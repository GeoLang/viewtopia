import type { Track, } from '../types';
import { haversineM } from './geo';

export interface ColocationEvent {
  entityA: string;
  entityB: string;
  timestamp: number;
  lng: number;
  lat: number;
  distanceM: number;
  timeDiffMs: number;
}

export interface ColocationOptions {
  distanceThresholdM?: number;
  timeThresholdMs?: number;
  maxResults?: number;
}

/**
 * Detect colocations: find pairs of events from different entities
 * that are within spatial and temporal thresholds.
 */
export function detectColocations(
  tracks: Track[],
  opts: ColocationOptions = {},
): ColocationEvent[] {
  const {
    distanceThresholdM = 100,
    timeThresholdMs = 300_000,
    maxResults = 1000,
  } = opts;

  const results: ColocationEvent[] = [];

  for (let i = 0; i < tracks.length && results.length < maxResults; i++) {
    for (let j = i + 1; j < tracks.length && results.length < maxResults; j++) {
      const trackA = tracks[i];
      const trackB = tracks[j];
      if (trackA.entityId === trackB.entityId) continue;

      let ptrB = 0;
      for (let a = 0; a < trackA.events.length && results.length < maxResults; a++) {
        const evA = trackA.events[a];

        while (
          ptrB < trackB.events.length &&
          trackB.events[ptrB].timestamp < evA.timestamp - timeThresholdMs
        ) {
          ptrB++;
        }

        for (let b = ptrB; b < trackB.events.length && results.length < maxResults; b++) {
          const evB = trackB.events[b];
          if (evB.timestamp > evA.timestamp + timeThresholdMs) break;

          const dist = haversineM(evA.lat, evA.lng, evB.lat, evB.lng);
          if (dist <= distanceThresholdM) {
            results.push({
              entityA: trackA.entityId,
              entityB: trackB.entityId,
              timestamp: (evA.timestamp + evB.timestamp) / 2,
              lng: (evA.lng + evB.lng) / 2,
              lat: (evA.lat + evB.lat) / 2,
              distanceM: dist,
              timeDiffMs: Math.abs(evA.timestamp - evB.timestamp),
            });
          }
        }
      }
    }
  }

  return results;
}
