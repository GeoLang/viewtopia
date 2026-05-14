import { describe, it, expect } from 'vitest';
import { createEntity, createEvent, createTrack, haversineM, trackDistanceM } from '../../src/spacetime/models.js';
import { getTimeBounds } from '../../src/spacetime/layers.js';
import { ingestCSV } from '../../src/spacetime/ingest.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('spacetime/models', () => {
  it('createEntity assigns unique IDs and colors', () => {
    const a = createEntity('Alice', 'person');
    const b = createEntity('Bob', 'vehicle');
    expect(a.id).not.toBe(b.id);
    expect(a.name).toBe('Alice');
    expect(a.kind).toBe('person');
    expect(a.color).toMatch(/^#[0-9a-f]{6}$/);
    expect(a.color).not.toBe(b.color);
  });

  it('createEvent parses ISO timestamp', () => {
    const e = createEvent('ent1', '2024-01-15T08:00:00Z', -122.4, 37.7);
    expect(e.entityId).toBe('ent1');
    expect(e.timestamp).toBe(new Date('2024-01-15T08:00:00Z').getTime());
    expect(e.lng).toBe(-122.4);
    expect(e.lat).toBe(37.7);
  });

  it('createTrack sorts events by time', () => {
    const events = [
      createEvent('e1', 3000, 0, 0),
      createEvent('e1', 1000, 1, 1),
      createEvent('e1', 2000, 2, 2),
    ];
    const track = createTrack('e1', events);
    expect(track.events[0].timestamp).toBe(1000);
    expect(track.events[2].timestamp).toBe(3000);
    expect(track.startTime).toBe(1000);
    expect(track.endTime).toBe(3000);
  });

  it('haversineM gives reasonable distance', () => {
    // SF to Oakland ~13km
    const d = haversineM(37.7749, -122.4194, 37.8044, -122.2712);
    expect(d).toBeGreaterThan(12000);
    expect(d).toBeLessThan(15000);
  });

  it('trackDistanceM sums segment distances', () => {
    const events = [
      createEvent('e1', 1000, -122.4194, 37.7749),
      createEvent('e1', 2000, -122.4180, 37.7760),
      createEvent('e1', 3000, -122.4165, 37.7775),
    ];
    const track = createTrack('e1', events);
    const d = trackDistanceM(track);
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(5000);
  });
});

describe('spacetime/ingest CSV', () => {
  it('parses sample-tracks.csv', () => {
    const csv = readFileSync(resolve(__dirname, '../fixtures/sample-tracks.csv'), 'utf-8');
    const { entities, tracks } = ingestCSV(csv);
    expect(entities.length).toBe(3);
    expect(tracks.length).toBe(3);

    const alice = entities.find(e => e.name === 'Alice');
    expect(alice).toBeDefined();

    const aliceTrack = tracks.find(t => t.entityId === alice.id);
    expect(aliceTrack.events.length).toBe(5);
    expect(aliceTrack.startTime).toBeLessThan(aliceTrack.endTime);
  });

  it('throws on missing required columns', () => {
    expect(() => ingestCSV('name,value\nfoo,1')).toThrow(/timestamp/i);
  });
});

describe('spacetime/layers', () => {
  it('getTimeBounds finds min/max across tracks', () => {
    const tracks = [
      { startTime: 1000, endTime: 5000, events: [] },
      { startTime: 500, endTime: 3000, events: [] },
    ];
    const bounds = getTimeBounds(tracks);
    expect(bounds.timeMin).toBe(500);
    expect(bounds.timeMax).toBe(5000);
  });
});
