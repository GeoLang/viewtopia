import type { Track } from '../types';
import { haversineM } from './geo';

export interface FrequentLocation {
  lng: number;
  lat: number;
  visitCount: number;
  totalDwellMs: number;
  label: string;
  visitHours: number[];
}

export interface DailyPattern {
  hour: number;
  avgLng: number;
  avgLat: number;
  sampleCount: number;
  stdDevM: number;
}

export interface PatternOptions {
  radiusM?: number;
  minVisits?: number;
  dwellThresholdMs?: number;
}

/**
 * Detect frequent locations (dwell clusters) for an entity's track.
 */
export function detectFrequentLocations(
  track: Track,
  opts: PatternOptions = {},
): FrequentLocation[] {
  const { radiusM = 50, minVisits = 3, dwellThresholdMs = 300_000 } = opts;
  const events = track.events;
  if (events.length === 0) return [];

  const clusters: number[][] = [];
  const assigned = new Set<number>();

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

  const results: FrequentLocation[] = [];
  let locNum = 1;

  for (const cluster of clusters) {
    if (cluster.length < minVisits) continue;

    const sorted = cluster.map((i) => events[i]).sort((a, b) => a.timestamp - b.timestamp);
    let visits = 1;
    let totalDwell = 0;
    const visitHours = new Set<number>();

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

    let sumLng = 0;
    let sumLat = 0;
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
      visitHours: [...visitHours],
    });
  }

  return results;
}

/**
 * Compute daily pattern — average location per hour-of-day.
 */
export function computeDailyPattern(track: Track): DailyPattern[] {
  const hourBuckets: { lngs: number[]; lats: number[] }[] = Array.from({ length: 24 }, () => ({
    lngs: [],
    lats: [],
  }));

  for (const ev of track.events) {
    const hour = new Date(ev.timestamp).getUTCHours();
    hourBuckets[hour].lngs.push(ev.lng);
    hourBuckets[hour].lats.push(ev.lat);
  }

  return hourBuckets.map((bucket, hour) => {
    const n = bucket.lngs.length;
    if (n === 0) return { hour, avgLng: 0, avgLat: 0, sampleCount: 0, stdDevM: 0 };

    const avgLng = bucket.lngs.reduce((s, v) => s + v, 0) / n;
    const avgLat = bucket.lats.reduce((s, v) => s + v, 0) / n;

    let sumDist2 = 0;
    for (let i = 0; i < n; i++) {
      const d = haversineM(avgLat, avgLng, bucket.lats[i], bucket.lngs[i]);
      sumDist2 += d * d;
    }
    const stdDevM = Math.sqrt(sumDist2 / n);

    return { hour, avgLng, avgLat, sampleCount: n, stdDevM };
  });
}

/**
 * Detect anomalous events — events that deviate significantly from the daily pattern.
 */
export function detectAnomalies(
  track: Track,
  opts: { deviationThresholdM?: number } = {},
): number[] {
  const { deviationThresholdM = 50_000 } = opts;
  const pattern = computeDailyPattern(track);
  const anomalyIndices: number[] = [];

  for (let i = 0; i < track.events.length; i++) {
    const ev = track.events[i];
    const hour = new Date(ev.timestamp).getUTCHours();
    const p = pattern[hour];
    if (p.sampleCount < 3) continue;

    const dist = haversineM(p.avgLat, p.avgLng, ev.lat, ev.lng);
    if (dist > p.stdDevM * 3 && dist > deviationThresholdM) {
      anomalyIndices.push(i);
    }
  }

  return anomalyIndices;
}
