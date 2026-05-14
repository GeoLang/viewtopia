import type { Track, Geofence, SpaceTimeEvent } from '../types';
import { haversineM } from './geo';

export interface FenceCrossing {
  entityId: string;
  fenceId: string;
  direction: 'enter' | 'exit';
  timestamp: number;
  lng: number;
  lat: number;
}

/**
 * Test if a point is inside a geofence.
 */
export function isInsideFence(fence: Geofence, lng: number, lat: number): boolean {
  if (fence.type === 'circle' && fence.center && fence.radius) {
    return haversineM(fence.center[1], fence.center[0], lat, lng) <= fence.radius;
  }
  if (fence.type === 'polygon' && fence.points && fence.points.length >= 3) {
    return pointInPolygon(lng, lat, fence.points);
  }
  return false;
}

/**
 * Detect fence crossings across all tracks.
 */
export function detectFenceCrossings(tracks: Track[], fences: Geofence[]): FenceCrossing[] {
  const crossings: FenceCrossing[] = [];

  for (const track of tracks) {
    for (const fence of fences) {
      if (!fence.active) continue;
      let wasInside = false;

      for (let i = 0; i < track.events.length; i++) {
        const ev = track.events[i];
        const inside = isInsideFence(fence, ev.lng, ev.lat);

        if (i > 0) {
          if (!wasInside && inside) {
            crossings.push({
              entityId: track.entityId,
              fenceId: fence.id,
              direction: 'enter',
              timestamp: ev.timestamp,
              lng: ev.lng,
              lat: ev.lat,
            });
          } else if (wasInside && !inside) {
            crossings.push({
              entityId: track.entityId,
              fenceId: fence.id,
              direction: 'exit',
              timestamp: ev.timestamp,
              lng: ev.lng,
              lat: ev.lat,
            });
          }
        }

        wasInside = inside;
      }
    }
  }

  return crossings;
}

/**
 * Ray-casting point-in-polygon test.
 */
function pointInPolygon(x: number, y: number, polygon: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];

    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}
