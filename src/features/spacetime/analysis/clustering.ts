import type { Track } from '../types';
import { haversineM } from './geo';

export interface EntityFeatures {
  entityId: string;
  avgSpeed: number;
  totalDistance: number;
  activeHours: number;
  avgLng: number;
  avgLat: number;
  spatialSpread: number;
  eventCount: number;
  activeDays: number;
}

const FEATURE_KEYS: (keyof Omit<EntityFeatures, 'entityId'>)[] = [
  'avgSpeed',
  'totalDistance',
  'activeHours',
  'avgLng',
  'avgLat',
  'spatialSpread',
  'eventCount',
  'activeDays',
];

/**
 * Extract feature vector from a track for clustering.
 */
export function extractFeatures(track: Track): EntityFeatures {
  const events = track.events;
  if (events.length === 0) {
    return {
      entityId: track.entityId,
      avgSpeed: 0,
      totalDistance: 0,
      activeHours: 0,
      avgLng: 0,
      avgLat: 0,
      spatialSpread: 0,
      eventCount: 0,
      activeDays: 0,
    };
  }

  let totalDist = 0;
  let totalTime = 0;
  const hours = new Set<number>();
  const days = new Set<string>();
  let sumLng = 0;
  let sumLat = 0;

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

function featureDistance(a: EntityFeatures, b: EntityFeatures): number {
  let sum = 0;
  for (const key of FEATURE_KEYS) {
    const diff = (a[key] as number) - (b[key] as number);
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

function normalizeFeatures(features: EntityFeatures[]): EntityFeatures[] {
  const mins: Record<string, number> = {};
  const maxs: Record<string, number> = {};

  for (const key of FEATURE_KEYS) {
    mins[key] = Infinity;
    maxs[key] = -Infinity;
    for (const f of features) {
      const v = f[key] as number;
      if (v < mins[key]) mins[key] = v;
      if (v > maxs[key]) maxs[key] = v;
    }
  }

  return features.map((f) => {
    const norm: Record<string, unknown> = { entityId: f.entityId };
    for (const key of FEATURE_KEYS) {
      const range = maxs[key] - mins[key] || 1;
      norm[key] = ((f[key] as number) - mins[key]) / range;
    }
    return norm as unknown as EntityFeatures;
  });
}

export interface ClusterOptions {
  k?: number;
  maxIterations?: number;
}

/**
 * K-means clustering on entity features.
 */
export function clusterEntities(
  tracks: Track[],
  opts: ClusterOptions = {},
): Map<number, string[]> {
  const { k = 3, maxIterations = 50 } = opts;

  const rawFeatures = tracks.map((t) => extractFeatures(t));
  if (rawFeatures.length <= k) {
    const clusters = new Map<number, string[]>();
    rawFeatures.forEach((f, i) => clusters.set(i, [f.entityId]));
    return clusters;
  }

  const features = normalizeFeatures(rawFeatures);

  // Initialize centroids (k-means++)
  const centroids: EntityFeatures[] = [features[0]];
  for (let c = 1; c < k; c++) {
    let maxDist = -1;
    let bestIdx = 0;
    for (let i = 0; i < features.length; i++) {
      const minDistToC = Math.min(...centroids.map((ce) => featureDistance(features[i], ce)));
      if (minDistToC > maxDist) {
        maxDist = minDistToC;
        bestIdx = i;
      }
    }
    centroids.push(features[bestIdx]);
  }

  const assignments = new Array<number>(features.length);

  for (let iter = 0; iter < maxIterations; iter++) {
    let changed = false;

    // Assign
    for (let i = 0; i < features.length; i++) {
      let minDist = Infinity;
      let bestC = 0;
      for (let c = 0; c < centroids.length; c++) {
        const d = featureDistance(features[i], centroids[c]);
        if (d < minDist) {
          minDist = d;
          bestC = c;
        }
      }
      if (assignments[i] !== bestC) {
        assignments[i] = bestC;
        changed = true;
      }
    }

    if (!changed) break;

    // Update centroids
    for (let c = 0; c < k; c++) {
      const members = features.filter((_, i) => assignments[i] === c);
      if (members.length === 0) continue;

      const newCentroid: Record<string, unknown> = { entityId: '' };
      for (const key of FEATURE_KEYS) {
        newCentroid[key] = members.reduce((s, m) => s + (m[key] as number), 0) / members.length;
      }
      centroids[c] = newCentroid as unknown as EntityFeatures;
    }
  }

  const clusters = new Map<number, string[]>();
  for (let i = 0; i < features.length; i++) {
    const c = assignments[i];
    if (!clusters.has(c)) clusters.set(c, []);
    clusters.get(c)!.push(rawFeatures[i].entityId);
  }

  return clusters;
}
