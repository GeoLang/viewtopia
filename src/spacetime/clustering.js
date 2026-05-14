/**
 * Behavioral Clustering — group entities by movement similarity.
 *
 * Uses k-means on movement feature vectors to identify entities
 * with similar patterns (e.g., same commute route, similar activity times).
 */

import { haversineM } from './models.js';

/**
 * @typedef {Object} EntityFeatures
 * @property {string} entityId
 * @property {number} avgSpeed - Average speed in m/s
 * @property {number} totalDistance - Total distance in meters
 * @property {number} activeHours - Number of unique active hours
 * @property {number} avgLng - Mean longitude
 * @property {number} avgLat - Mean latitude
 * @property {number} spatialSpread - Spatial standard deviation in meters
 * @property {number} eventCount
 * @property {number} activeDays - Number of unique active days
 */

/**
 * Extract feature vector from a track for clustering.
 */
export function extractFeatures(track) {
  const events = track.events;
  if (events.length === 0) {
    return {
      entityId: track.entityId,
      avgSpeed: 0, totalDistance: 0, activeHours: 0,
      avgLng: 0, avgLat: 0, spatialSpread: 0,
      eventCount: 0, activeDays: 0,
    };
  }

  let totalDist = 0;
  let totalTime = 0;
  const hours = new Set();
  const days = new Set();
  let sumLng = 0, sumLat = 0;

  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    sumLng += e.lng;
    sumLat += e.lat;
    hours.add(new Date(e.timestamp).getUTCHours());
    days.add(new Date(e.timestamp).toISOString().slice(0, 10));

    if (i > 0) {
      const prev = events[i - 1];
      totalDist += haversineM(prev.lat, prev.lng, e.lat, e.lng);
      totalTime += e.timestamp - prev.timestamp;
    }
  }

  const avgLng = sumLng / events.length;
  const avgLat = sumLat / events.length;

  // Spatial spread
  let sumDist2 = 0;
  for (const e of events) {
    const d = haversineM(avgLat, avgLng, e.lat, e.lng);
    sumDist2 += d * d;
  }
  const spatialSpread = Math.sqrt(sumDist2 / events.length);

  return {
    entityId: track.entityId,
    avgSpeed: totalTime > 0 ? totalDist / (totalTime / 1000) : 0,
    totalDistance: totalDist,
    activeHours: hours.size,
    avgLng,
    avgLat,
    spatialSpread,
    eventCount: events.length,
    activeDays: days.size,
  };
}

/**
 * Normalize feature vectors to [0, 1] range.
 */
function normalizeFeatures(features) {
  const keys = ['avgSpeed', 'totalDistance', 'activeHours', 'avgLng', 'avgLat', 'spatialSpread', 'eventCount', 'activeDays'];
  const mins = {};
  const maxs = {};

  for (const key of keys) {
    mins[key] = Infinity;
    maxs[key] = -Infinity;
    for (const f of features) {
      if (f[key] < mins[key]) mins[key] = f[key];
      if (f[key] > maxs[key]) maxs[key] = f[key];
    }
  }

  return features.map(f => {
    const norm = { entityId: f.entityId };
    for (const key of keys) {
      const range = maxs[key] - mins[key] || 1;
      norm[key] = (f[key] - mins[key]) / range;
    }
    return norm;
  });
}

/**
 * Euclidean distance between two normalized feature vectors.
 */
function featureDistance(a, b) {
  const keys = ['avgSpeed', 'totalDistance', 'activeHours', 'avgLng', 'avgLat', 'spatialSpread', 'eventCount', 'activeDays'];
  let sum = 0;
  for (const key of keys) {
    const diff = (a[key] || 0) - (b[key] || 0);
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

/**
 * K-means clustering on entity features.
 *
 * @param {import('./models.js').Track[]} tracks
 * @param {Object} opts
 * @param {number} [opts.k=3] - Number of clusters
 * @param {number} [opts.maxIterations=50]
 * @returns {Map<number, string[]>} Cluster ID -> entity IDs
 */
export function clusterEntities(tracks, opts = {}) {
  const { k = 3, maxIterations = 50 } = opts;

  const rawFeatures = tracks.map(t => extractFeatures(t));
  if (rawFeatures.length <= k) {
    // Fewer entities than clusters — each is its own cluster
    const clusters = new Map();
    rawFeatures.forEach((f, i) => clusters.set(i, [f.entityId]));
    return clusters;
  }

  const features = normalizeFeatures(rawFeatures);
  const featureKeys = ['avgSpeed', 'totalDistance', 'activeHours', 'avgLng', 'avgLat', 'spatialSpread', 'eventCount', 'activeDays'];

  // Initialize centroids (k-means++)
  const centroids = [features[0]];
  for (let c = 1; c < k; c++) {
    // Pick next centroid weighted by distance to nearest existing centroid
    let maxDist = -1;
    let bestIdx = 0;
    for (let i = 0; i < features.length; i++) {
      const minDistToC = Math.min(...centroids.map(ce => featureDistance(features[i], ce)));
      if (minDistToC > maxDist) { maxDist = minDistToC; bestIdx = i; }
    }
    centroids.push(features[bestIdx]);
  }

  // Iterate
  const assignments = new Array(features.length);
  for (let iter = 0; iter < maxIterations; iter++) {
    // Assign each point to nearest centroid
    let changed = false;
    for (let i = 0; i < features.length; i++) {
      let minDist = Infinity;
      let minC = 0;
      for (let c = 0; c < k; c++) {
        const d = featureDistance(features[i], centroids[c]);
        if (d < minDist) { minDist = d; minC = c; }
      }
      if (assignments[i] !== minC) { assignments[i] = minC; changed = true; }
    }
    if (!changed) break;

    // Recompute centroids
    for (let c = 0; c < k; c++) {
      const members = features.filter((_, i) => assignments[i] === c);
      if (members.length === 0) continue;
      const newCentroid = { entityId: 'centroid' };
      for (const key of featureKeys) {
        newCentroid[key] = members.reduce((s, m) => s + m[key], 0) / members.length;
      }
      centroids[c] = newCentroid;
    }
  }

  // Build cluster map
  const clusters = new Map();
  for (let i = 0; i < features.length; i++) {
    const c = assignments[i];
    if (!clusters.has(c)) clusters.set(c, []);
    clusters.get(c).push(features[i].entityId);
  }

  return clusters;
}
