import { describe, it, expect } from 'vitest';
import {
  createEntity, createEvent, createTrack, haversineM, trackDistanceM,
  createLink, createTimeRange, timeRangeContains, timeRangeNormalize, timeRangeExpand,
} from '../../src/spacetime/models.js';
import { getTimeBounds, createLinkLayer } from '../../src/spacetime/layers.js';
import { ingestCSV, ingestJSON } from '../../src/spacetime/ingest.js';
import { SpaceTimeIndex } from '../../src/spacetime/index-spatial.js';
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

describe('spacetime/models — Link', () => {
  it('createLink sets defaults', () => {
    const link = createLink('src1', 'tgt1', 'colocation');
    expect(link.sourceId).toBe('src1');
    expect(link.targetId).toBe('tgt1');
    expect(link.kind).toBe('colocation');
    expect(link.strength).toBe(1.0);
    expect(link.evidenceCount).toBe(1);
  });
});

describe('spacetime/models — TimeRange', () => {
  it('timeRangeContains checks boundaries', () => {
    const range = createTimeRange(1000, 5000);
    expect(timeRangeContains(range, 3000)).toBe(true);
    expect(timeRangeContains(range, 1000)).toBe(true);
    expect(timeRangeContains(range, 999)).toBe(false);
  });

  it('timeRangeNormalize maps to [0, 1]', () => {
    const range = createTimeRange(0, 10000);
    expect(timeRangeNormalize(range, 0)).toBe(0);
    expect(timeRangeNormalize(range, 10000)).toBe(1);
    expect(timeRangeNormalize(range, 5000)).toBe(0.5);
  });

  it('timeRangeExpand grows bounds', () => {
    const range = createTimeRange(1000, 5000);
    timeRangeExpand(range, 500);
    expect(range.start).toBe(500);
    timeRangeExpand(range, 9000);
    expect(range.end).toBe(9000);
  });
});

describe('spacetime/ingest JSON', () => {
  it('parses JSON array of events', () => {
    const json = JSON.stringify([
      { entity_id: 'drone1', timestamp: '2024-01-15T10:00:00Z', lng: -122.4, lat: 37.7 },
      { entity_id: 'drone1', timestamp: '2024-01-15T10:05:00Z', lng: -122.5, lat: 37.8 },
      { entity_id: 'drone2', timestamp: '2024-01-15T10:00:00Z', lng: -122.3, lat: 37.6 },
    ]);
    const { entities, tracks } = ingestJSON(json);
    expect(entities.length).toBe(2);
    expect(tracks.length).toBe(2);
    const d1 = entities.find(e => e.name === 'drone1');
    const d1Track = tracks.find(t => t.entityId === d1.id);
    expect(d1Track.events.length).toBe(2);
  });
});

describe('spacetime/index-spatial', () => {
  it('builds and queries by bounding box', () => {
    const events = [
      createEvent('e1', 1000, -122.4, 37.7),
      createEvent('e1', 2000, -122.5, 37.8),
      createEvent('e2', 1500, -100.0, 40.0), // far away
    ];
    const idx = new SpaceTimeIndex();
    idx.build(events);
    expect(idx.size).toBe(3);

    const results = idx.query(-123, 37, -122, 38);
    expect(results.length).toBe(2); // only the SF events
  });

  it('filters by time window', () => {
    const events = [
      createEvent('e1', 1000, -122.4, 37.7),
      createEvent('e1', 5000, -122.4, 37.7),
      createEvent('e1', 9000, -122.4, 37.7),
    ];
    const idx = new SpaceTimeIndex();
    idx.build(events);

    const results = idx.query(-123, 37, -122, 38, 2000, 6000);
    expect(results.length).toBe(1);
    expect(results[0].timestamp).toBe(5000);
  });

  it('kNearest returns closest events', () => {
    const events = [
      createEvent('e1', 1000, -122.4, 37.7),
      createEvent('e1', 2000, -122.41, 37.71),
      createEvent('e1', 3000, -100.0, 40.0),
    ];
    const idx = new SpaceTimeIndex();
    idx.build(events);

    const nearest = idx.kNearest(-122.4, 37.7, 2);
    expect(nearest.length).toBe(2);
    expect(nearest[0].lng).toBe(-122.4);
  });
});
