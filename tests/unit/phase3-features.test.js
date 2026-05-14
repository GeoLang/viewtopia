import { describe, it, expect } from 'vitest';
import { createEntity, createEvent, createTrack, createLink, haversineM } from '../../src/spacetime/models.js';
import {
  computeDegree, computeBetweenness, computeCloseness,
  computePageRank, detectCommunities, computeAllMetrics,
} from '../../src/spacetime/network-metrics.js';
import { exportKML, exportCSV, exportLinksCSV } from '../../src/spacetime/export.js';
import { detectQualityIssues, removeQualityIssues, qualitySummary } from '../../src/spacetime/data-quality.js';
import { extractFeatures, clusterEntities } from '../../src/spacetime/clustering.js';
import { predictLocation } from '../../src/spacetime/prediction.js';
import {
  createGeofenceEntryRule, createProximityRule, createSpeedRule,
  removeRule, getRules, evaluateRules, getAlerts, clearAlerts,
} from '../../src/spacetime/alerting.js';
import {
  recordAction, getAuditLog, getRecentActions, filterLog, clearAuditLog, exportAuditCSV,
} from '../../src/spacetime/audit-trail.js';
import { ingestCDR } from '../../src/spacetime/ingest-cdr.js';

// Helper: make entities + tracks for a triangle graph: A - B - C
function makeGraph() {
  const ids = ['a', 'b', 'c'];
  const links = [
    createLink('a', 'b', 'colocation'),
    createLink('b', 'c', 'communication'),
  ];
  return { ids, links };
}

function makeTrack(entityId, points) {
  const events = points.map(([ts, lng, lat]) => createEvent(entityId, ts, lng, lat));
  return createTrack(entityId, events);
}

describe('network-metrics', () => {
  it('computes degree centrality', () => {
    const { ids, links } = makeGraph();
    const degree = computeDegree(ids, links);
    expect(degree.get('b')).toBeGreaterThan(degree.get('a'));
    expect(degree.get('a')).toBe(degree.get('c'));
  });

  it('computes betweenness centrality', () => {
    const { ids, links } = makeGraph();
    const betweenness = computeBetweenness(ids, links);
    // B is the bridge between A and C
    expect(betweenness.get('b')).toBeGreaterThan(betweenness.get('a'));
    expect(betweenness.get('a')).toBe(0);
  });

  it('computes closeness centrality', () => {
    const { ids, links } = makeGraph();
    const closeness = computeCloseness(ids, links);
    expect(closeness.get('b')).toBeGreaterThan(closeness.get('a'));
  });

  it('computes PageRank', () => {
    const { ids, links } = makeGraph();
    const rank = computePageRank(ids, links);
    expect(rank.get('b')).toBeGreaterThan(0);
    expect(rank.size).toBe(3);
  });

  it('detects communities', () => {
    const { ids, links } = makeGraph();
    const communities = detectCommunities(ids, links);
    expect(communities.size).toBeGreaterThanOrEqual(1);
    // All nodes should appear somewhere
    const allNodes = [...communities.values()].flat();
    expect(allNodes).toContain('a');
    expect(allNodes).toContain('b');
    expect(allNodes).toContain('c');
  });

  it('computeAllMetrics returns all measures', () => {
    const { ids, links } = makeGraph();
    const metrics = computeAllMetrics(ids, links);
    expect(metrics.degree).toBeDefined();
    expect(metrics.betweenness).toBeDefined();
    expect(metrics.closeness).toBeDefined();
    expect(metrics.pageRank).toBeDefined();
    expect(metrics.communities).toBeDefined();
  });
});

describe('export', () => {
  it('exports KML with placemarks', () => {
    const entities = new Map();
    entities.set('e1', createEntity('Alice', 'person'));
    const track = makeTrack('e1', [[1000, -73.9, 40.7], [2000, -73.91, 40.71]]);
    const kml = exportKML(entities, [track]);
    expect(kml).toContain('<?xml');
    expect(kml).toContain('Alice');
    expect(kml).toContain('gx:Track');
  });

  it('exports CSV', () => {
    const entities = new Map();
    entities.set('e1', createEntity('Bob', 'vehicle'));
    const track = makeTrack('e1', [[1000, 10, 20], [2000, 11, 21]]);
    const csv = exportCSV(entities, [track]);
    const lines = csv.split('\n');
    expect(lines[0]).toContain('entity_name');
    expect(lines.length).toBe(3); // header + 2 data rows
  });

  it('exports links CSV', () => {
    const entities = new Map();
    entities.set('a', { name: 'Alice', id: 'a' });
    entities.set('b', { name: 'Bob', id: 'b' });
    const links = [createLink('a', 'b', 'colocation')];
    const csv = exportLinksCSV(links, entities);
    expect(csv).toContain('Alice');
    expect(csv).toContain('Bob');
    expect(csv).toContain('colocation');
  });
});

describe('data-quality', () => {
  it('detects zero-coordinate issues', () => {
    const track = makeTrack('e1', [[1000, 0, 0], [2000, 10, 20]]);
    const issues = detectQualityIssues([track]);
    expect(issues.some(i => i.type === 'zero_coord')).toBe(true);
  });

  it('detects impossible speed', () => {
    // 1000 km in 1 second = impossible speed
    const track = makeTrack('e1', [
      [1000, 0, 0.01], // Avoid null island detection
      [2000, 10, 10],   // ~1500 km in 1 second
    ]);
    const issues = detectQualityIssues([track]);
    expect(issues.some(i => i.type === 'impossible_speed')).toBe(true);
  });

  it('removes quality issues', () => {
    const track = makeTrack('e1', [[1000, 0, 0], [2000, 10, 20], [3000, 11, 21]]);
    const issues = detectQualityIssues([track]);
    const removed = removeQualityIssues([track], issues);
    expect(removed).toBeGreaterThan(0);
    expect(track.events.length).toBe(2); // removed the (0,0) point
  });

  it('qualitySummary counts correctly', () => {
    const track = makeTrack('e1', [[1000, 0, 0]]);
    const issues = detectQualityIssues([track]);
    const summary = qualitySummary(issues);
    expect(summary.total).toBeGreaterThan(0);
    expect(summary.errors).toBeGreaterThan(0);
  });
});

describe('clustering', () => {
  it('extracts features from track', () => {
    const track = makeTrack('e1', [
      [1000, -73.9, 40.7],
      [60000, -73.91, 40.71],
      [120000, -73.92, 40.72],
    ]);
    const features = extractFeatures(track);
    expect(features.entityId).toBe('e1');
    expect(features.eventCount).toBe(3);
    expect(features.totalDistance).toBeGreaterThan(0);
    expect(features.avgSpeed).toBeGreaterThan(0);
  });

  it('clusters entities into k groups', () => {
    const tracks = [];
    // Two groups: near NYC and near London
    for (let i = 0; i < 4; i++) {
      tracks.push(makeTrack(`nyc${i}`, [
        [1000 * i, -74 + Math.random() * 0.1, 40.7 + Math.random() * 0.1],
        [2000 * i + 1000, -74 + Math.random() * 0.1, 40.7 + Math.random() * 0.1],
      ]));
    }
    for (let i = 0; i < 4; i++) {
      tracks.push(makeTrack(`lon${i}`, [
        [1000 * i, -0.1 + Math.random() * 0.1, 51.5 + Math.random() * 0.1],
        [2000 * i + 1000, -0.1 + Math.random() * 0.1, 51.5 + Math.random() * 0.1],
      ]));
    }
    const clusters = clusterEntities(tracks, { k: 2 });
    expect(clusters.size).toBe(2);
  });
});

describe('prediction', () => {
  it('predicts location from historical pattern', () => {
    // Generate a track with data at various hours
    const events = [];
    const base = Date.UTC(2024, 0, 1);
    for (let day = 0; day < 10; day++) {
      for (let hour = 8; hour < 20; hour++) {
        events.push(createEvent('e1', base + day * 86400000 + hour * 3600000,
          -73.9 + hour * 0.001, 40.7 + hour * 0.001));
      }
    }
    const track = createTrack('e1', events);
    const futureTime = base + 15 * 86400000 + 12 * 3600000; // noon, 15 days later
    const preds = predictLocation(track, futureTime);
    expect(preds.length).toBeGreaterThan(0);
    expect(preds[0].confidence).toBeGreaterThan(0);
    expect(preds[0].basis).toBeDefined();
  });
});

describe('alerting', () => {
  it('creates and evaluates proximity rule', () => {
    clearAlerts();
    const trackA = makeTrack('a', [[1000, 10, 20]]);
    const trackB = makeTrack('b', [[1000, 10.0001, 20.0001]]);

    let triggered = null;
    createProximityRule('Test proximity', 'a', 'b', 500, (alert) => { triggered = alert; });

    const newAlerts = evaluateRules([trackA, trackB], 1000);
    expect(newAlerts.length).toBe(1);
    expect(triggered).not.toBeNull();
    expect(triggered.message).toContain('within');

    // Clean up
    const rules = getRules();
    rules.forEach(r => removeRule(r.id));
    clearAlerts();
  });

  it('creates speed threshold rule', () => {
    clearAlerts();
    // Very fast movement
    const track = makeTrack('fast', [
      [1000, 0, 0.01],
      [2000, 10, 10], // Teleport
    ]);

    createSpeedRule('Speed alert', ['fast'], 200, () => {});
    const newAlerts = evaluateRules([track], 2000);
    expect(newAlerts.length).toBe(1);

    const rules = getRules();
    rules.forEach(r => removeRule(r.id));
    clearAlerts();
  });
});

describe('audit-trail', () => {
  it('records and retrieves actions', () => {
    clearAuditLog();
    recordAction('import', 'Loaded test.csv', { rows: 100 });
    recordAction('analysis', 'Ran colocation detection');

    const log = getAuditLog();
    expect(log.length).toBe(2);
    expect(log[0].action).toBe('import');
    expect(log[0].detail.rows).toBe(100);
  });

  it('filters by action type', () => {
    clearAuditLog();
    recordAction('import', 'File 1');
    recordAction('analysis', 'Analysis 1');
    recordAction('import', 'File 2');

    expect(filterLog('import').length).toBe(2);
    expect(filterLog('analysis').length).toBe(1);
  });

  it('exports CSV', () => {
    clearAuditLog();
    recordAction('export', 'Test export');
    const csv = exportAuditCSV();
    expect(csv).toContain('timestamp');
    expect(csv).toContain('export');
  });

  it('getRecentActions returns last N', () => {
    clearAuditLog();
    for (let i = 0; i < 10; i++) recordAction('import', `File ${i}`);
    expect(getRecentActions(3).length).toBe(3);
  });
});

describe('ingest-cdr', () => {
  it('ingests CDR CSV data', () => {
    const csv = `caller,callee,timestamp,cell_lat,cell_lng,duration
+1234,+5678,2024-01-01T10:00:00Z,40.7,-73.9,120
+1234,+9999,2024-01-01T11:00:00Z,40.71,-73.91,60
+5678,+1234,2024-01-01T12:00:00Z,51.5,-0.1,300`;

    const entities = new Map();
    const trackMap = new Map();
    const result = ingestCDR(csv, entities, trackMap);

    expect(entities.size).toBeGreaterThan(0);
    expect(result.records).toBe(3);
    expect(result.links.length).toBeGreaterThan(0);
  });
});
