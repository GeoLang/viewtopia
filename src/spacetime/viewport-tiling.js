/**
 * Viewport Tiling — only load/render data visible in the current viewport + time window.
 *
 * For large datasets, we don't send all events to deck.gl at once.
 * Instead, we query the binary store for events within the current
 * viewport bounds and time range, then pass only those to the layers.
 *
 * This ensures consistent 60fps regardless of total dataset size.
 */

import { queryTimeRange, querySpatioTemporal, toBinaryAttributes } from './binary-store.js';

/** Maximum events to render per frame */
const MAX_VISIBLE_EVENTS = 500000;

/**
 * @typedef {Object} ViewportState
 * @property {number} west
 * @property {number} south
 * @property {number} east
 * @property {number} north
 * @property {number} zoom
 * @property {number} timeStart - Current visible time window start
 * @property {number} timeEnd - Current visible time window end
 */

/**
 * @typedef {Object} TileResult
 * @property {Uint32Array} indices - Indices into binary store
 * @property {number} total - Total matching events
 * @property {boolean} downsampled - Whether we had to downsample
 */

/**
 * Query the binary store for events visible in the current viewport.
 *
 * @param {import('./binary-store.js').BinaryEventStore} store
 * @param {ViewportState} viewport
 * @returns {TileResult}
 */
export function queryViewport(store, viewport) {
  const { west, south, east, north, timeStart, timeEnd } = viewport;

  const indices = querySpatioTemporal(store, west, south, east, north, timeStart, timeEnd);

  if (indices.length <= MAX_VISIBLE_EVENTS) {
    return { indices, total: indices.length, downsampled: false };
  }

  // Downsample: take every Nth event to stay within budget
  const step = Math.ceil(indices.length / MAX_VISIBLE_EVENTS);
  const sampled = new Uint32Array(Math.ceil(indices.length / step));
  for (let i = 0, j = 0; i < indices.length; i += step, j++) {
    sampled[j] = indices[i];
  }
  return { indices: sampled, total: indices.length, downsampled: true };
}

/**
 * Create binary position array for deck.gl from query results.
 * Returns positions in [lng, lat, 0, lng, lat, 0, ...] format.
 *
 * @param {import('./binary-store.js').BinaryEventStore} store
 * @param {Uint32Array} indices
 * @returns {{positions: Float64Array, timestamps: Float32Array, entityIndices: Uint32Array, length: number}}
 */
export function buildRenderData(store, indices) {
  const count = indices.length;
  const positions = new Float64Array(count * 3);
  const timestamps = new Float32Array(count);
  const entityIndices = new Uint32Array(count);

  for (let i = 0; i < count; i++) {
    const si = indices[i];
    positions[i * 3] = store.longitudes[si];
    positions[i * 3 + 1] = store.latitudes[si];
    positions[i * 3 + 2] = store.altitudes[si];
    timestamps[i] = store.timestamps[si];
    entityIndices[i] = store.entityIndices[si];
  }

  return { positions, timestamps, entityIndices, length: count };
}

/**
 * Determine if the viewport has changed enough to warrant re-querying.
 * Prevents unnecessary recalculations during smooth panning.
 */
export function viewportChanged(prev, next) {
  if (!prev) return true;
  const threshold = 0.001; // ~111m at equator
  return (
    Math.abs(prev.west - next.west) > threshold ||
    Math.abs(prev.south - next.south) > threshold ||
    Math.abs(prev.east - next.east) > threshold ||
    Math.abs(prev.north - next.north) > threshold ||
    prev.timeStart !== next.timeStart ||
    prev.timeEnd !== next.timeEnd
  );
}

/**
 * Compute appropriate time window based on zoom level and trail duration.
 * At high zoom, show shorter time windows for better performance.
 */
export function computeTimeWindow(timeMin, timeMax, currentTime, trailDuration, zoom) {
  if (trailDuration != null) {
    return { timeStart: currentTime - trailDuration, timeEnd: currentTime };
  }

  // Auto-window based on zoom: higher zoom = shorter window
  // zoom 0-5: full range, 5-10: 50% range, 10-15: 10% range, 15+: 1% range
  const totalRange = timeMax - timeMin;
  let fraction = 1.0;
  if (zoom > 15) fraction = 0.01;
  else if (zoom > 10) fraction = 0.1;
  else if (zoom > 5) fraction = 0.5;

  const windowSize = totalRange * fraction;
  return {
    timeStart: currentTime - windowSize / 2,
    timeEnd: currentTime + windowSize / 2,
  };
}
