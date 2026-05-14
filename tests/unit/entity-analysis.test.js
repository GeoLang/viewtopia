import { describe, it, expect, beforeEach } from 'vitest';
import { createEntity, createEvent, createTrack, createLink } from '../../src/spacetime/models.js';
import { detectColocations, colocationLinks, detectCoTravel } from '../../src/spacetime/colocation.js';
import { detectFrequentLocations, computeDailyPattern, detectAnomalies, classifyLocations } from '../../src/spacetime/pattern-of-life.js';
import {
  createCircleFence, createPolygonFence, getFences, clearFences,
  isInsideFence, detectFenceCrossings, summarizeFenceActivity,
} from '../../src/spacetime/geofence.js';
import { computeHistogram } from '../../src/spacetime/activity-histogram.js';
import { ingestGeoJSON } from '../../src/spacetime/ingest-formats.js';
import {
  initEntityManager, addEntity, updateEntity, deleteEntity,
  addAlias, removeAlias, mergeEntities, searchEntities,
} from '../../src/spacetime/entity-manager.js';

describe('entity-manager', () => {
  it('CRUD operations on entities', () => {
    const entityMap = new Map();
    let changed = 0;
    initEntityManager(entityMap, () => changed++);

    const ent = addEntity('Alice', 'person', { aliases: ['alice99'] });
    expect(ent.name).toBe('Alice');
    expect(ent.kind).toBe('person');
    expect(ent.aliases).toEqual(['alice99']);
    expect(entityMap.has(ent.id)).toBe(true);
    expect(changed).toBe(1);

    updateEntity(ent.id, { name: 'Alice Smith' });
    expect(entityMap.get(ent.id).name).toBe('Alice Smith');
    expect(changed).toBe(2);

    deleteEntity(ent.id);
    expect(entityMap.has(ent.id)).toBe(false);
    expect(changed).toBe(3);
  });

  it('alias management', () => {
    const entityMap = new Map();
    initEntityManager(entityMap, () => {});

    const ent = addEntity('Bob', 'device');
    addAlias(ent.id, '555-1234');
    addAlias(ent.id, 'bob@example.com');
    expect(entityMap.get(ent.id).aliases).toEqual(['555-1234', 'bob@example.com']);

    removeAlias(ent.id, '555-1234');
    expect(entityMap.get(ent.id).aliases).toEqual(['bob@example.com']);
  });

  it('merges entities', () => {
    const entityMap = new Map();
    initEntityManager(entityMap, () => {});

    const a = addEntity('Phone A', 'device', { aliases: ['111'] });
    const b = addEntity('Phone B', 'device', { aliases: ['222'], notes: 'suspect' });
    const merged = mergeEntities(a.id, b.id);
    expect(merged.aliases).toContain('222');
    expect(merged.aliases).toContain('Phone B');
    expect(merged.notes).toContain('suspect');
    expect(entityMap.has(b.id)).toBe(false);
  });

  it('searches by name and alias', () => {
    const entityMap = new Map();
    initEntityManager(entityMap, () => {});

    addEntity('Charlie', 'person', { aliases: ['chuck'] });
    addEntity('Dave', 'person');
    const results = searchEntities('chuck');
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('Charlie');
  });
});

describe('colocation detection', () => {
  it('detects entities near each other in space-time', () => {
    const trackA = createTrack('entityA', [
      createEvent('entityA', 1000, -122.4, 37.7),
      createEvent('entityA', 2000, -122.4, 37.7),
      createEvent('entityA', 3000, -122.4, 37.7),
    ]);
    const trackB = createTrack('entityB', [
      createEvent('entityB', 1500, -122.4, 37.7001), // ~11m away
      createEvent('entityB', 2500, -122.4, 37.7001),
      createEvent('entityB', 5000, -122.5, 37.8),    // far away
    ]);

    const colocations = detectColocations([trackA, trackB], {
      distanceThresholdM: 50,
      timeThresholdMs: 1000,
    });

    expect(colocations.length).toBeGreaterThan(0);
    expect(colocations[0].entityA).toBe('entityA');
    expect(colocations[0].entityB).toBe('entityB');
    expect(colocations[0].distanceM).toBeLessThan(50);
  });

  it('generates links from colocations', () => {
    const colocations = [
      { entityA: 'a', entityB: 'b', timestamp: 1000, lng: 0, lat: 0, distanceM: 10, timeDiffMs: 500 },
      { entityA: 'a', entityB: 'b', timestamp: 2000, lng: 0, lat: 0, distanceM: 20, timeDiffMs: 600 },
    ];
    const links = colocationLinks(colocations);
    expect(links.length).toBe(1);
    expect(links[0].kind).toBe('colocation');
    expect(links[0].evidenceCount).toBe(2);
  });

  it('detects co-travel', () => {
    const colocations = [];
    for (let i = 0; i < 5; i++) {
      colocations.push({
        entityA: 'x', entityB: 'y',
        timestamp: 1000 + i * 60000,
        lng: 0, lat: 0, distanceM: 10, timeDiffMs: 100,
      });
    }
    const travels = detectCoTravel(colocations, { minSteps: 3, maxGapMs: 120000 });
    expect(travels.length).toBe(1);
    expect(travels[0].steps).toBe(5);
  });
});

describe('pattern-of-life', () => {
  it('detects frequent locations', () => {
    // Build track with repeated visits to same location
    const events = [];
    for (let day = 0; day < 5; day++) {
      // Home at night
      events.push(createEvent('e1', new Date(`2024-01-${10 + day}T22:00:00Z`).getTime(), -122.4, 37.7));
      // Work during day
      events.push(createEvent('e1', new Date(`2024-01-${10 + day}T09:00:00Z`).getTime(), -122.5, 37.8));
      // Different lunch spots (shouldn't cluster)
      events.push(createEvent('e1', new Date(`2024-01-${10 + day}T12:00:00Z`).getTime(), -122.3 + day * 0.1, 37.6));
    }
    const track = createTrack('e1', events);
    const locs = detectFrequentLocations(track, { radiusM: 100, minVisits: 3 });
    expect(locs.length).toBeGreaterThanOrEqual(2); // home + work
  });

  it('computes daily pattern', () => {
    const events = [
      createEvent('e1', new Date('2024-01-10T08:00:00Z').getTime(), -122.4, 37.7),
      createEvent('e1', new Date('2024-01-11T08:30:00Z').getTime(), -122.4, 37.7),
      createEvent('e1', new Date('2024-01-10T20:00:00Z').getTime(), -122.5, 37.8),
    ];
    const track = createTrack('e1', events);
    const pattern = computeDailyPattern(track);
    expect(pattern.length).toBe(24);
    expect(pattern[8].sampleCount).toBe(2);
    expect(pattern[20].sampleCount).toBe(1);
  });

  it('classifies home/work locations', () => {
    const locs = [
      { lng: 0, lat: 0, visitCount: 10, totalDwellMs: 0, label: 'Location #1', visitHours: [21, 22, 23, 0, 1, 6, 7] },
      { lng: 1, lat: 1, visitCount: 8, totalDwellMs: 0, label: 'Location #2', visitHours: [9, 10, 11, 12, 13, 14, 15] },
    ];
    classifyLocations(locs);
    expect(locs[0].label).toBe('Home');
    expect(locs[1].label).toBe('Work');
  });
});

describe('geofence', () => {
  beforeEach(() => clearFences());

  it('creates and queries circle fences', () => {
    const fence = createCircleFence('Zone A', -122.4, 37.7, 1000);
    expect(getFences().length).toBe(1);
    expect(isInsideFence(fence, -122.4, 37.7)).toBe(true);
    expect(isInsideFence(fence, -122.4, 37.8)).toBe(false); // ~11km away
  });

  it('creates polygon fences', () => {
    const fence = createPolygonFence('Box', [
      [-1, -1], [1, -1], [1, 1], [-1, 1],
    ]);
    expect(isInsideFence(fence, 0, 0)).toBe(true);
    expect(isInsideFence(fence, 2, 2)).toBe(false);
  });

  it('detects fence crossings', () => {
    const fence = createCircleFence('Office', 0, 0, 100000); // 100km radius
    const track = createTrack('e1', [
      createEvent('e1', 1000, 10, 10),  // outside
      createEvent('e1', 2000, 0.001, 0.001),  // inside
      createEvent('e1', 3000, 10, 10),  // outside again
    ]);
    const crossings = detectFenceCrossings([track]);
    expect(crossings.length).toBe(2);
    expect(crossings[0].direction).toBe('enter');
    expect(crossings[1].direction).toBe('exit');
  });
});

describe('activity-histogram', () => {
  it('computes bins from tracks', () => {
    const track = createTrack('e1', [
      createEvent('e1', 1000, 0, 0),
      createEvent('e1', 2000, 0, 0),
      createEvent('e1', 5000, 0, 0),
    ]);
    const bins = computeHistogram([track], { bins: 4 });
    expect(bins.length).toBe(4);
    const totalEvents = bins.reduce((s, b) => s + b.total, 0);
    expect(totalEvents).toBe(3);
  });
});

describe('ingest-formats GeoJSON', () => {
  it('parses FeatureCollection with Points', () => {
    const geojson = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'Station A', timestamp: '2024-01-15T10:00:00Z' },
          geometry: { type: 'Point', coordinates: [-122.4, 37.7] },
        },
        {
          type: 'Feature',
          properties: { name: 'Station B', timestamp: '2024-01-15T11:00:00Z' },
          geometry: { type: 'Point', coordinates: [-122.5, 37.8] },
        },
      ],
    };
    const entities = new Map();
    const tracks = new Map();
    const result = ingestGeoJSON(geojson, entities, tracks);
    expect(result.entities.length).toBe(2);
    expect(result.tracks.length).toBe(2);
  });

  it('parses LineString as track', () => {
    const geojson = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: { name: 'Route 1', timestamp: '2024-01-15T10:00:00Z' },
        geometry: { type: 'LineString', coordinates: [[-122.4, 37.7], [-122.5, 37.8], [-122.6, 37.9]] },
      }],
    };
    const entities = new Map();
    const tracks = new Map();
    const result = ingestGeoJSON(geojson, entities, tracks);
    expect(result.entities.length).toBe(1);
    const track = [...tracks.values()][0];
    expect(track.events.length).toBe(3);
  });
});
