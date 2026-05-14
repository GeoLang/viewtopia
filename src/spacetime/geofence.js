/**
 * Geo-fencing — define spatial zones and detect when entities enter/leave.
 *
 * GeoTime-style: analysts draw polygons or circles on the map,
 * then the system detects all crossings and generates alerts.
 */

import { haversineM } from './models.js';

/**
 * @typedef {Object} GeoFence
 * @property {string} id
 * @property {string} name
 * @property {'circle'|'polygon'} type
 * @property {number} [lng] - Center (for circle)
 * @property {number} [lat] - Center (for circle)
 * @property {number} [radiusM] - Radius in meters (for circle)
 * @property {Array<[number, number]>} [polygon] - [lng, lat] points (for polygon)
 * @property {string} color
 */

/**
 * @typedef {Object} FenceCrossing
 * @property {string} entityId
 * @property {string} fenceId
 * @property {'enter'|'exit'} direction
 * @property {number} timestamp
 * @property {number} lng
 * @property {number} lat
 */

let fences = [];
let fenceIdCounter = 0;

/**
 * Create a circular geo-fence.
 */
export function createCircleFence(name, lng, lat, radiusM, color = '#ff6600') {
  const fence = { id: `fence-${++fenceIdCounter}`, name, type: 'circle', lng, lat, radiusM, color };
  fences.push(fence);
  return fence;
}

/**
 * Create a polygon geo-fence.
 * @param {Array<[number, number]>} polygon - [lng, lat] vertices
 */
export function createPolygonFence(name, polygon, color = '#ff6600') {
  const fence = { id: `fence-${++fenceIdCounter}`, name, type: 'polygon', polygon, color };
  fences.push(fence);
  return fence;
}

/**
 * Remove a geo-fence by ID.
 */
export function removeFence(id) {
  fences = fences.filter(f => f.id !== id);
}

/**
 * Get all geo-fences.
 */
export function getFences() {
  return fences;
}

/**
 * Clear all geo-fences.
 */
export function clearFences() {
  fences = [];
}

/**
 * Test if a point is inside a geo-fence.
 */
export function isInsideFence(fence, lng, lat) {
  if (fence.type === 'circle') {
    return haversineM(fence.lat, fence.lng, lat, lng) <= fence.radiusM;
  }
  return pointInPolygon(lng, lat, fence.polygon);
}

/**
 * Ray-casting algorithm for point-in-polygon.
 * @param {number} x - longitude
 * @param {number} y - latitude
 * @param {Array<[number, number]>} poly - [lng, lat] vertices
 */
function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Detect all fence crossings for a set of tracks.
 * Returns enter/exit events sorted by time.
 *
 * @param {import('./models.js').Track[]} tracks
 * @param {GeoFence[]} [fenceList] - Optional; defaults to global fences
 * @returns {FenceCrossing[]}
 */
export function detectFenceCrossings(tracks, fenceList) {
  const activeFences = fenceList || fences;
  if (activeFences.length === 0) return [];

  const crossings = [];

  for (const track of tracks) {
    if (track.events.length < 2) continue;

    for (const fence of activeFences) {
      let wasInside = isInsideFence(fence, track.events[0].lng, track.events[0].lat);

      for (let i = 1; i < track.events.length; i++) {
        const e = track.events[i];
        const isInside = isInsideFence(fence, e.lng, e.lat);

        if (!wasInside && isInside) {
          crossings.push({
            entityId: track.entityId,
            fenceId: fence.id,
            direction: 'enter',
            timestamp: e.timestamp,
            lng: e.lng,
            lat: e.lat,
          });
        } else if (wasInside && !isInside) {
          crossings.push({
            entityId: track.entityId,
            fenceId: fence.id,
            direction: 'exit',
            timestamp: e.timestamp,
            lng: e.lng,
            lat: e.lat,
          });
        }
        wasInside = isInside;
      }
    }
  }

  return crossings.sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Summarize fence activity: for each fence, how many times each entity enters/exits.
 *
 * @param {FenceCrossing[]} crossings
 * @returns {Map<string, Map<string, {enters: number, exits: number, totalDwellMs: number}>>}
 */
export function summarizeFenceActivity(crossings) {
  // fenceId -> entityId -> stats
  const summary = new Map();

  // Also track enter times for dwell calculation
  const lastEnter = new Map(); // "fenceId:entityId" -> timestamp

  for (const c of crossings) {
    if (!summary.has(c.fenceId)) summary.set(c.fenceId, new Map());
    const fenceMap = summary.get(c.fenceId);
    if (!fenceMap.has(c.entityId)) fenceMap.set(c.entityId, { enters: 0, exits: 0, totalDwellMs: 0 });
    const stats = fenceMap.get(c.entityId);

    const key = `${c.fenceId}:${c.entityId}`;
    if (c.direction === 'enter') {
      stats.enters++;
      lastEnter.set(key, c.timestamp);
    } else {
      stats.exits++;
      const enterTime = lastEnter.get(key);
      if (enterTime != null) {
        stats.totalDwellMs += c.timestamp - enterTime;
        lastEnter.delete(key);
      }
    }
  }

  return summary;
}
