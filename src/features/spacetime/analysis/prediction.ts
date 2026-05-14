import type { Track } from '../types';
import { computeDailyPattern, detectFrequentLocations } from './pattern-of-life';

export interface LocationPrediction {
  lng: number;
  lat: number;
  confidence: number;
  basis: 'hourly_pattern' | 'frequent_location' | 'linear_extrapolation';
  label: string;
}

/**
 * Predict where an entity will be at a given future time.
 */
export function predictLocation(track: Track, futureTimestamp: number): LocationPrediction[] {
  const predictions: LocationPrediction[] = [];

  if (track.events.length < 3) return predictions;

  // Strategy 1: Hourly pattern
  const pattern = computeDailyPattern(track);
  const hour = new Date(futureTimestamp).getUTCHours();
  const hourPattern = pattern[hour];
  if (hourPattern.sampleCount >= 3) {
    const confidence =
      Math.min(0.9, hourPattern.sampleCount / 20) *
      (hourPattern.stdDevM > 0 ? Math.max(0.1, 1 - hourPattern.stdDevM / 50000) : 0.5);
    predictions.push({
      lng: hourPattern.avgLng,
      lat: hourPattern.avgLat,
      confidence,
      basis: 'hourly_pattern',
      label: `Typical location at ${hour}:00 (${hourPattern.sampleCount} samples, ±${(hourPattern.stdDevM / 1000).toFixed(1)}km)`,
    });
  }

  // Strategy 2: Frequent locations
  const freqLocs = detectFrequentLocations(track, { minVisits: 3 });
  if (freqLocs.length > 0) {
    const hourLocs = freqLocs.filter((l) => l.visitHours.includes(hour));
    const bestLoc = hourLocs.length > 0 ? hourLocs[0] : freqLocs[0];
    predictions.push({
      lng: bestLoc.lng,
      lat: bestLoc.lat,
      confidence: Math.min(0.8, bestLoc.visitCount / 15),
      basis: 'frequent_location',
      label: `${bestLoc.label} (${bestLoc.visitCount} visits)`,
    });
  }

  // Strategy 3: Linear extrapolation from last few events
  const recent = track.events.slice(-5);
  if (recent.length >= 2) {
    const last = recent[recent.length - 1];
    const prev = recent[recent.length - 2];
    const dt = last.timestamp - prev.timestamp;

    if (dt > 0) {
      const futDt = futureTimestamp - last.timestamp;
      const scale = futDt / dt;
      const predLng = last.lng + (last.lng - prev.lng) * scale;
      const predLat = last.lat + (last.lat - prev.lat) * scale;
      // Confidence drops off with distance from last observation
      const confidence = Math.max(0.05, 0.6 * Math.exp(-Math.abs(scale) / 10));
      predictions.push({
        lng: predLng,
        lat: predLat,
        confidence,
        basis: 'linear_extrapolation',
        label: `Linear projection (${(futDt / 60000).toFixed(0)} min ahead)`,
      });
    }
  }

  return predictions;
}

/**
 * Predict locations for all entities.
 */
export function predictAllLocations(
  tracks: Track[],
  futureTimestamp: number,
): Map<string, LocationPrediction[]> {
  const result = new Map<string, LocationPrediction[]>();
  for (const track of tracks) {
    const preds = predictLocation(track, futureTimestamp);
    if (preds.length > 0) {
      result.set(track.entityId, preds);
    }
  }
  return result;
}
