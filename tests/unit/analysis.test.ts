import { describe, it, expect } from 'vitest';
import {
  haversineM,
  detectColocations,
  detectFrequentLocations,
  computeDailyPattern,
  detectAnomalies,
  computeDegree,
  computeBetweenness,
  computeAllMetrics,
  extractFeatures,
  clusterEntities,
  detectQualityIssues,
  qualitySummary,
  predictLocation,
  predictAllLocations,
  exportKML,
  exportCSV,
  isInsideFence,
  detectFenceCrossings,
} from '../../src/features/spacetime/analysis';
import type { Track, Entity, Geofence, Link } from '../../src/features/spacetime/types';

// Helper to create a simple track
function makeTrack(entityId: string, events: { lng: number; lat: number; timestamp: number }[]): Track {
  return {
    id: `track-${entityId}`,
    entityId,
    events: events.map((e, i) => ({
      id: `ev-${entityId}-${i}`,
      entityId,
      lng: e.lng,
      lat: e.lat,
      timestamp: e.timestamp,
    })),
  };
}

describe('geo utilities', () => {
  it('haversineM computes correct distance', () => {
    // London to Paris ~ 340 km
    const dist = haversineM(51.5074, -0.1278, 48.8566, 2.3522);
    expect(dist).toBeGreaterThan(330_000);
    expect(dist).toBeLessThan(350_000);
  });

  it('haversineM returns 0 for same point', () => {
    expect(haversineM(0, 0, 0, 0)).toBe(0);
  });

  it('haversineM handles antipodal points', () => {
    const dist = haversineM(0, 0, 0, 180);
    // Half circumference ~ 20015 km
    expect(dist).toBeGreaterThan(20_000_000);
    expect(dist).toBeLessThan(20_100_000);
  });
});

describe('colocation detection', () => {
  it('detects entities near each other in space and time', () => {
    const trackA = makeTrack('alice', [
      { lng: -0.1278, lat: 51.5074, timestamp: 1000000 },
      { lng: -0.1280, lat: 51.5075, timestamp: 1060000 },
    ]);
    const trackB = makeTrack('bob', [
      { lng: -0.1279, lat: 51.5074, timestamp: 1030000 },
    ]);

    const results = detectColocations([trackA, trackB], {
      distanceThresholdM: 200,
      timeThresholdMs: 60000,
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].entityA).toBe('alice');
    expect(results[0].entityB).toBe('bob');
    expect(results[0].distanceM).toBeLessThan(200);
  });

  it('does not detect distant entities', () => {
    const trackA = makeTrack('alice', [{ lng: 0, lat: 0, timestamp: 1000 }]);
    const trackB = makeTrack('bob', [{ lng: 10, lat: 10, timestamp: 1000 }]);

    const results = detectColocations([trackA, trackB], { distanceThresholdM: 100 });
    expect(results).toHaveLength(0);
  });

  it('does not detect temporally distant events', () => {
    const trackA = makeTrack('alice', [{ lng: 0, lat: 0, timestamp: 0 }]);
    const trackB = makeTrack('bob', [{ lng: 0.0001, lat: 0, timestamp: 10_000_000 }]);

    const results = detectColocations([trackA, trackB], { timeThresholdMs: 60000 });
    expect(results).toHaveLength(0);
  });

  it('respects maxResults', () => {
    const trackA = makeTrack('alice', Array.from({ length: 50 }, (_, i) => ({
      lng: 0, lat: 0, timestamp: i * 1000,
    })));
    const trackB = makeTrack('bob', Array.from({ length: 50 }, (_, i) => ({
      lng: 0.00001, lat: 0, timestamp: i * 1000,
    })));

    const results = detectColocations([trackA, trackB], { maxResults: 5 });
    expect(results).toHaveLength(5);
  });
});

describe('pattern-of-life', () => {
  const baseTimestamp = new Date('2024-01-01T08:00:00Z').getTime();
  const hourMs = 3600_000;

  it('detects frequent locations', () => {
    // Visit same location 5 times with gaps
    const events = Array.from({ length: 5 }, (_, i) => ({
      lng: -0.1278,
      lat: 51.5074,
      timestamp: baseTimestamp + i * hourMs * 24, // daily visits
    }));
    const track = makeTrack('alice', events);

    const locs = detectFrequentLocations(track, { radiusM: 100, minVisits: 3 });
    expect(locs.length).toBeGreaterThan(0);
    expect(locs[0].visitCount).toBeGreaterThanOrEqual(3);
  });

  it('returns empty for sparse data', () => {
    const track = makeTrack('alice', [{ lng: 0, lat: 0, timestamp: 0 }]);
    const locs = detectFrequentLocations(track);
    expect(locs).toHaveLength(0);
  });

  it('computes daily pattern with 24 hours', () => {
    const events = Array.from({ length: 24 }, (_, i) => ({
      lng: i, lat: i * 0.5, timestamp: baseTimestamp + i * hourMs,
    }));
    const track = makeTrack('alice', events);
    const pattern = computeDailyPattern(track);

    expect(pattern).toHaveLength(24);
    expect(pattern[8].sampleCount).toBeGreaterThan(0);
    expect(pattern[8].avgLng).toBeCloseTo(0); // first event at hour 8
  });

  it('detects anomalies for outlier events', () => {
    // Create 20 events at same location, then one far away
    const events = Array.from({ length: 20 }, (_, i) => ({
      lng: -0.1278, lat: 51.5074,
      timestamp: baseTimestamp + i * hourMs * 24 + 8 * hourMs, // all at 8am
    }));
    events.push({ lng: 100, lat: -40, timestamp: baseTimestamp + 20 * hourMs * 24 + 8 * hourMs });
    const track = makeTrack('alice', events);

    const anomalies = detectAnomalies(track);
    expect(anomalies).toContain(20); // last event is anomalous
  });
});

describe('network metrics', () => {
  const entities = ['a', 'b', 'c', 'd'];
  const links: Link[] = [
    { id: 'l1', sourceId: 'a', targetId: 'b', kind: 'colocation' },
    { id: 'l2', sourceId: 'b', targetId: 'c', kind: 'colocation' },
    { id: 'l3', sourceId: 'c', targetId: 'd', kind: 'colocation' },
  ];

  it('computes degree centrality', () => {
    const degree = computeDegree(entities, links);
    expect(degree.get('a')).toBeCloseTo(1 / 3); // 1 connection out of 3 possible
    expect(degree.get('b')).toBeCloseTo(2 / 3); // 2 connections
    expect(degree.get('c')).toBeCloseTo(2 / 3);
    expect(degree.get('d')).toBeCloseTo(1 / 3);
  });

  it('computes betweenness centrality', () => {
    const betweenness = computeBetweenness(entities, links);
    // b and c are the bridges in a-b-c-d chain
    expect(betweenness.get('b')!).toBeGreaterThan(betweenness.get('a')!);
    expect(betweenness.get('c')!).toBeGreaterThan(betweenness.get('d')!);
  });

  it('computeAllMetrics returns both', () => {
    const m = computeAllMetrics(entities, links);
    expect(m.degree.size).toBe(4);
    expect(m.betweenness.size).toBe(4);
  });

  it('handles disconnected graph', () => {
    const degree = computeDegree(['x', 'y'], []);
    expect(degree.get('x')).toBe(0);
    expect(degree.get('y')).toBe(0);
  });
});

describe('clustering', () => {
  it('extracts features from a track', () => {
    const track = makeTrack('alice', [
      { lng: 0, lat: 0, timestamp: 0 },
      { lng: 0.001, lat: 0.001, timestamp: 60000 },
      { lng: 0.002, lat: 0.002, timestamp: 120000 },
    ]);
    const features = extractFeatures(track);
    expect(features.entityId).toBe('alice');
    expect(features.eventCount).toBe(3);
    expect(features.totalDistance).toBeGreaterThan(0);
    expect(features.avgSpeed).toBeGreaterThan(0);
  });

  it('returns empty features for empty track', () => {
    const track = makeTrack('bob', []);
    const features = extractFeatures(track);
    expect(features.eventCount).toBe(0);
    expect(features.avgSpeed).toBe(0);
  });

  it('clusters tracks into k groups', () => {
    const tracks = [
      makeTrack('a', [{ lng: 0, lat: 0, timestamp: 0 }, { lng: 0.001, lat: 0, timestamp: 1000 }]),
      makeTrack('b', [{ lng: 0, lat: 0, timestamp: 0 }, { lng: 0.001, lat: 0, timestamp: 1000 }]),
      makeTrack('c', [{ lng: 50, lat: 50, timestamp: 0 }, { lng: 50.1, lat: 50, timestamp: 1000 }]),
      makeTrack('d', [{ lng: 50, lat: 50, timestamp: 0 }, { lng: 50.1, lat: 50, timestamp: 1000 }]),
    ];
    const clusters = clusterEntities(tracks, { k: 2 });
    expect(clusters.size).toBe(2);

    // a and b should be in same cluster, c and d in another
    let clusterOfA = -1;
    let clusterOfC = -1;
    for (const [id, members] of clusters) {
      if (members.includes('a')) clusterOfA = id;
      if (members.includes('c')) clusterOfC = id;
    }
    expect(clusterOfA).not.toBe(clusterOfC);
  });

  it('handles fewer entities than clusters', () => {
    const tracks = [makeTrack('a', [{ lng: 0, lat: 0, timestamp: 0 }])];
    const clusters = clusterEntities(tracks, { k: 5 });
    expect(clusters.size).toBe(1);
  });
});

describe('data quality', () => {
  it('detects zero coordinates', () => {
    const track = makeTrack('alice', [{ lng: 0, lat: 0, timestamp: 1000 }]);
    const issues = detectQualityIssues([track]);
    expect(issues.some((i) => i.type === 'zero_coord')).toBe(true);
  });

  it('detects invalid coordinate range', () => {
    const track = makeTrack('alice', [{ lng: 200, lat: 100, timestamp: 1000 }]);
    const issues = detectQualityIssues([track]);
    expect(issues.some((i) => i.type === 'invalid_coord')).toBe(true);
  });

  it('detects impossible speed', () => {
    const track = makeTrack('alice', [
      { lng: 0, lat: 0, timestamp: 0 },
      { lng: 10, lat: 10, timestamp: 1000 }, // ~1570 km in 1 second = impossibly fast
    ]);
    const issues = detectQualityIssues([track]);
    expect(issues.some((i) => i.type === 'impossible_speed')).toBe(true);
  });

  it('detects duplicate timestamps', () => {
    const track = makeTrack('alice', [
      { lng: 1, lat: 1, timestamp: 5000 },
      { lng: 2, lat: 2, timestamp: 5000 },
    ]);
    const issues = detectQualityIssues([track]);
    expect(issues.some((i) => i.type === 'duplicate_time')).toBe(true);
  });

  it('returns clean for valid data', () => {
    const track = makeTrack('alice', [
      { lng: -0.1278, lat: 51.5074, timestamp: 0 },
      { lng: -0.1279, lat: 51.5075, timestamp: 60000 },
    ]);
    const issues = detectQualityIssues([track]);
    expect(issues).toHaveLength(0);
  });

  it('qualitySummary aggregates by type', () => {
    const issues = [
      { type: 'zero_coord' as const, entityId: 'a', eventIndex: 0, timestamp: 0, description: '', severity: 'error' as const },
      { type: 'zero_coord' as const, entityId: 'b', eventIndex: 0, timestamp: 0, description: '', severity: 'error' as const },
      { type: 'impossible_speed' as const, entityId: 'a', eventIndex: 1, timestamp: 0, description: '', severity: 'warning' as const },
    ];
    const summary = qualitySummary(issues);
    expect(summary['zero_coord']).toBe(2);
    expect(summary['impossible_speed']).toBe(1);
  });
});

describe('prediction', () => {
  it('returns empty for short tracks', () => {
    const track = makeTrack('alice', [{ lng: 0, lat: 0, timestamp: 0 }]);
    const preds = predictLocation(track, 100000);
    expect(preds).toHaveLength(0);
  });

  it('produces predictions for tracks with enough data', () => {
    const hourMs = 3600_000;
    const base = new Date('2024-01-01T10:00:00Z').getTime();
    // 30 events over 30 days at 10am
    const events = Array.from({ length: 30 }, (_, i) => ({
      lng: -0.1278 + i * 0.0001,
      lat: 51.5074,
      timestamp: base + i * 24 * hourMs,
    }));
    const track = makeTrack('alice', events);

    const future = base + 31 * 24 * hourMs; // next day at 10am
    const preds = predictLocation(track, future);
    expect(preds.length).toBeGreaterThan(0);
    expect(preds[0].confidence).toBeGreaterThan(0);
  });

  it('predictAllLocations returns map', () => {
    const tracks = [
      makeTrack('a', Array.from({ length: 5 }, (_, i) => ({ lng: i, lat: i, timestamp: i * 60000 }))),
    ];
    const result = predictAllLocations(tracks, 500000);
    expect(result instanceof Map).toBe(true);
  });
});

describe('export', () => {
  it('exports KML with placemarks', () => {
    const entities = new Map<string, Entity>([
      ['e1', { id: 'e1', name: 'Alice', kind: 'person', aliases: [], color: '#ff0000', properties: {}, createdAt: 0, updatedAt: 0 }],
    ]);
    const tracks: Track[] = [
      makeTrack('e1', [
        { lng: 0, lat: 0, timestamp: 1000 },
        { lng: 1, lat: 1, timestamp: 2000 },
      ]),
    ];

    const kml = exportKML(entities, tracks);
    expect(kml).toContain('<?xml version="1.0"');
    expect(kml).toContain('<name>Alice</name>');
    expect(kml).toContain('gx:Track');
  });

  it('exports CSV with headers', () => {
    const entities = new Map<string, Entity>([
      ['e1', { id: 'e1', name: 'Bob', kind: 'vehicle', aliases: [], color: '#00ff00', properties: {}, createdAt: 0, updatedAt: 0 }],
    ]);
    const tracks: Track[] = [
      makeTrack('e1', [{ lng: 10, lat: 20, timestamp: 5000 }]),
    ];

    const csv = exportCSV(entities, tracks);
    expect(csv).toContain('entity_name,entity_kind,timestamp,longitude,latitude,altitude');
    expect(csv).toContain('"Bob"');
    expect(csv).toContain('"vehicle"');
  });

  it('handles empty tracks', () => {
    const kml = exportKML(new Map(), []);
    expect(kml).toContain('<Document>');
  });
});

describe('geofence', () => {
  it('detects point inside circle fence', () => {
    const fence: Geofence = {
      id: 'f1', name: 'Test', type: 'circle',
      center: [0, 0], radius: 1000, active: true,
    };
    expect(isInsideFence(fence, 0.001, 0.001)).toBe(true);
    expect(isInsideFence(fence, 10, 10)).toBe(false);
  });

  it('detects point inside polygon fence', () => {
    const fence: Geofence = {
      id: 'f2', name: 'Square', type: 'polygon',
      points: [[0, 0], [10, 0], [10, 10], [0, 10]],
      active: true,
    };
    expect(isInsideFence(fence, 5, 5)).toBe(true);
    expect(isInsideFence(fence, 15, 15)).toBe(false);
  });

  it('detects fence crossings', () => {
    const fence: Geofence = {
      id: 'f1', name: 'Zone', type: 'circle',
      center: [0, 0], radius: 1000, active: true,
    };
    const track = makeTrack('alice', [
      { lng: 10, lat: 10, timestamp: 0 },    // outside
      { lng: 0.001, lat: 0.001, timestamp: 1000 }, // inside
      { lng: 20, lat: 20, timestamp: 2000 },  // outside
    ]);

    const crossings = detectFenceCrossings([track], [fence]);
    expect(crossings.length).toBe(2);
    expect(crossings[0].direction).toBe('enter');
    expect(crossings[1].direction).toBe('exit');
  });

  it('ignores inactive fences', () => {
    const fence: Geofence = {
      id: 'f1', name: 'Disabled', type: 'circle',
      center: [0, 0], radius: 1000, active: false,
    };
    const track = makeTrack('alice', [
      { lng: 10, lat: 10, timestamp: 0 },
      { lng: 0.001, lat: 0.001, timestamp: 1000 },
    ]);

    const crossings = detectFenceCrossings([track], [fence]);
    expect(crossings).toHaveLength(0);
  });
});
