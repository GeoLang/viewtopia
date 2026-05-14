/**
 * Pattern-of-Life Analysis — identify routines, frequent locations,
 * and behavioral anomalies.
 *
 * GeoTime-style: detect home/work locations, daily patterns,
 * repeated visits, and deviations from normal behavior.
 */

import { haversineM } from './models.js';

/**
 * @typedef {Object} FrequentLocation
 * @property {number} lng
 * @property {number} lat
 * @property {number} visitCount
 * @property {number} totalDwellMs - Total time spent at this location
 * @property {string} label - Auto-generated label (e.g., "Location #1")
 * @property {number[]} visitHours - Array of hour-of-day when visited
 */

/**
 * @typedef {Object} DailyPattern
 * @property {number} hour - 0-23
 * @property {number} avgLng
 * @property {number} avgLat
 * @property {number} sampleCount
 * @property {number} stdDevM - Spatial standard deviation in meters
 */

/**
 * Detect frequent locations (dwell clusters) for an entity's track.
 *
 * Uses DBSCAN-like clustering: events within `radiusM` of each other
 * are grouped, clusters with enough visits become frequent locations.
 *
 * @param {import('./models.js').Track} track
 * @param {Object} opts
 * @param {number} [opts.radiusM=50] - Cluster radius in meters
 * @param {number} [opts.minVisits=3] - Min visits to be a frequent location
 * @param {number} [opts.dwellThresholdMs=300000] - Min time gap to count as separate visit (5 min)
 * @returns {FrequentLocation[]}
 */
export function detectFrequentLocations(track, opts = {}) {
  const { radiusM = 50, minVisits = 3, dwellThresholdMs = 300000 } = opts;
  const events = track.events;
  if (events.length === 0) return [];

  const clusters = [];
  const assigned = new Set();

  for (let i = 0; i < events.length; i++) {
    if (assigned.has(i)) continue;
    const cluster = [i];
    assigned.add(i);

    for (let j = i + 1; j < events.length; j++) {
      if (assigned.has(j)) continue;
      const dist = haversineM(events[i].lat, events[i].lng, events[j].lat, events[j].lng);
      if (dist <= radiusM) {
        cluster.push(j);
        assigned.add(j);
      }
    }
    clusters.push(cluster);
  }

  // Convert clusters to frequent locations
  const results = [];
  let locNum = 1;
  for (const cluster of clusters) {
    if (cluster.length < minVisits) continue;

    // Count distinct visits (gaps > dwellThreshold between consecutive events)
    const sorted = cluster.map(i => events[i]).sort((a, b) => a.timestamp - b.timestamp);
    let visits = 1;
    let totalDwell = 0;
    const visitHours = new Set();

    for (let k = 1; k < sorted.length; k++) {
      const gap = sorted[k].timestamp - sorted[k - 1].timestamp;
      if (gap > dwellThresholdMs) {
        visits++;
      } else {
        totalDwell += gap;
      }
      visitHours.add(new Date(sorted[k].timestamp).getUTCHours());
    }
    visitHours.add(new Date(sorted[0].timestamp).getUTCHours());

    if (visits < minVisits) continue;

    // Centroid
    let sumLng = 0, sumLat = 0;
    for (const idx of cluster) {
      sumLng += events[idx].lng;
      sumLat += events[idx].lat;
    }

    results.push({
      lng: sumLng / cluster.length,
      lat: sumLat / cluster.length,
      visitCount: visits,
      totalDwellMs: totalDwell,
      label: `Location #${locNum++}`,
      visitHours: [...visitHours].sort((a, b) => a - b),
    });
  }

  return results.sort((a, b) => b.visitCount - a.visitCount);
}

/**
 * Compute hourly pattern (pattern-of-life) for an entity.
 * For each hour of the day, compute average position and spatial variance.
 *
 * @param {import('./models.js').Track} track
 * @returns {DailyPattern[]}
 */
export function computeDailyPattern(track) {
  const hourBuckets = Array.from({ length: 24 }, () => []);

  for (const e of track.events) {
    const hour = new Date(e.timestamp).getUTCHours();
    hourBuckets[hour].push(e);
  }

  return hourBuckets.map((bucket, hour) => {
    if (bucket.length === 0) return { hour, avgLng: 0, avgLat: 0, sampleCount: 0, stdDevM: 0 };

    const avgLng = bucket.reduce((s, e) => s + e.lng, 0) / bucket.length;
    const avgLat = bucket.reduce((s, e) => s + e.lat, 0) / bucket.length;

    // Spatial standard deviation
    let sumDist2 = 0;
    for (const e of bucket) {
      const d = haversineM(avgLat, avgLng, e.lat, e.lng);
      sumDist2 += d * d;
    }
    const stdDevM = Math.sqrt(sumDist2 / bucket.length);

    return { hour, avgLng, avgLat, sampleCount: bucket.length, stdDevM };
  });
}

/**
 * Detect anomalies: events that deviate significantly from the entity's
 * normal pattern-of-life.
 *
 * @param {import('./models.js').Track} track
 * @param {DailyPattern[]} pattern - from computeDailyPattern()
 * @param {Object} opts
 * @param {number} [opts.stdDevMultiplier=3] - How many stddevs to flag
 * @returns {import('./models.js').Event[]}
 */
export function detectAnomalies(track, pattern, opts = {}) {
  const { stdDevMultiplier = 3 } = opts;
  const anomalies = [];

  for (const e of track.events) {
    const hour = new Date(e.timestamp).getUTCHours();
    const p = pattern[hour];
    if (p.sampleCount < 5) continue; // not enough data
    if (p.stdDevM === 0) continue;

    const dist = haversineM(p.avgLat, p.avgLng, e.lat, e.lng);
    if (dist > p.stdDevM * stdDevMultiplier) {
      anomalies.push(e);
    }
  }

  return anomalies;
}

/**
 * Classify frequent locations as home/work based on visit hours.
 * Home: most visits during 20:00-08:00
 * Work: most visits during 08:00-18:00
 *
 * @param {FrequentLocation[]} locations
 */
export function classifyLocations(locations) {
  for (const loc of locations) {
    const nightHours = loc.visitHours.filter(h => h >= 20 || h < 8).length;
    const dayHours = loc.visitHours.filter(h => h >= 8 && h < 18).length;

    if (nightHours > dayHours && loc.visitCount >= 5) {
      loc.label = 'Home';
    } else if (dayHours > nightHours && loc.visitCount >= 5) {
      loc.label = 'Work';
    }
  }
}
