/**
 * Spatial-temporal index — ported from Continuum's continuum-index.
 *
 * Uses rbush for 2D spatial indexing + binary search on sorted time for
 * combined space-time queries. Similar to Continuum's 3D R*Tree approach
 * but adapted for the browser.
 */

import RBush from 'rbush';
import { timeRangeNormalize, createTimeRange } from './models.js';

/**
 * @typedef {Object} IndexedEvent
 * @property {string} eventId
 * @property {string} entityId
 * @property {number} lng
 * @property {number} lat
 * @property {number} timestamp - Unix ms
 */

class EventIndex extends RBush {
  toBBox(item) {
    return { minX: item.lng, minY: item.lat, maxX: item.lng, maxY: item.lat };
  }
  compareMinX(a, b) { return a.lng - b.lng; }
  compareMinY(a, b) { return a.lat - b.lat; }
}

/**
 * Space-time index for fast spatial + temporal queries.
 */
export class SpaceTimeIndex {
  constructor() {
    this._tree = new EventIndex();
    this._events = []; // sorted by timestamp
    this._timeRange = null;
  }

  /**
   * Build index from an array of events.
   * @param {import('./models.js').Event[]} events
   */
  build(events) {
    if (events.length === 0) return;

    // Sort by time
    this._events = [...events].sort((a, b) => a.timestamp - b.timestamp);

    const minT = this._events[0].timestamp;
    const maxT = this._events[this._events.length - 1].timestamp;
    this._timeRange = createTimeRange(minT, maxT);

    // Build spatial index
    const items = this._events.map(e => ({
      eventId: e.id,
      entityId: e.entityId,
      lng: e.lng,
      lat: e.lat,
      timestamp: e.timestamp,
    }));
    this._tree.load(items);
  }

  /**
   * Query events within a spatial bounding box and optional time range.
   * @param {number} minLng
   * @param {number} minLat
   * @param {number} maxLng
   * @param {number} maxLat
   * @param {number} [timeStart] - Unix ms, inclusive
   * @param {number} [timeEnd] - Unix ms, inclusive
   * @returns {IndexedEvent[]}
   */
  query(minLng, minLat, maxLng, maxLat, timeStart, timeEnd) {
    // Spatial query
    const spatial = this._tree.search({
      minX: minLng, minY: minLat, maxX: maxLng, maxY: maxLat,
    });

    // Filter by time if specified
    if (timeStart == null && timeEnd == null) return spatial;

    const tMin = timeStart ?? -Infinity;
    const tMax = timeEnd ?? Infinity;
    return spatial.filter(e => e.timestamp >= tMin && e.timestamp <= tMax);
  }

  /**
   * Find events near a point within a radius (degrees) and optional time window.
   * @param {number} lng
   * @param {number} lat
   * @param {number} radiusDeg
   * @param {number} [timeStart]
   * @param {number} [timeEnd]
   * @returns {IndexedEvent[]}
   */
  queryRadius(lng, lat, radiusDeg, timeStart, timeEnd) {
    return this.query(
      lng - radiusDeg, lat - radiusDeg,
      lng + radiusDeg, lat + radiusDeg,
      timeStart, timeEnd,
    );
  }

  /**
   * Find the k nearest events to a point (spatial only, no time filter).
   * Uses brute-force over spatial candidates — fine for moderate result sets.
   * @param {number} lng
   * @param {number} lat
   * @param {number} k
   * @returns {IndexedEvent[]}
   */
  kNearest(lng, lat, k) {
    // Expand search radius until we have k results
    let radius = 0.01;
    let results = [];
    while (results.length < k && radius < 180) {
      results = this.query(lng - radius, lat - radius, lng + radius, lat + radius);
      radius *= 2;
    }
    // Sort by distance and take k
    results.sort((a, b) => {
      const dA = (a.lng - lng) ** 2 + (a.lat - lat) ** 2;
      const dB = (b.lng - lng) ** 2 + (b.lat - lat) ** 2;
      return dA - dB;
    });
    return results.slice(0, k);
  }

  /** @returns {import('./models.js').TimeRange|null} */
  get timeRange() { return this._timeRange; }

  /** @returns {number} */
  get size() { return this._events.length; }
}
