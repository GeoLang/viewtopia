/**
 * Binary Columnar Store — store events as typed arrays for 10x memory efficiency.
 *
 * Instead of millions of JS objects ({lng, lat, timestamp, entityId}),
 * store data in contiguous Float64Arrays/Uint32Arrays that deck.gl can
 * consume directly via binary accessors.
 *
 * This is the same approach used by Kepler.gl, Uber's internal tools,
 * and deck.gl's own examples for million-point datasets.
 */

/**
 * @typedef {Object} BinaryEventStore
 * @property {Float64Array} timestamps - Unix ms
 * @property {Float64Array} longitudes
 * @property {Float64Array} latitudes
 * @property {Float32Array} altitudes - meters (0 if unknown)
 * @property {Uint32Array} entityIndices - index into entity list
 * @property {number} length - total event count
 * @property {string[]} entityIds - entity ID lookup table
 * @property {Map<string, number>} entityIdToIndex - reverse lookup
 */

/**
 * Create an empty binary store with pre-allocated capacity.
 * @param {number} capacity - Initial number of events to allocate for
 * @returns {BinaryEventStore}
 */
export function createBinaryStore(capacity = 100000) {
  return {
    timestamps: new Float64Array(capacity),
    longitudes: new Float64Array(capacity),
    latitudes: new Float64Array(capacity),
    altitudes: new Float32Array(capacity),
    entityIndices: new Uint32Array(capacity),
    length: 0,
    capacity,
    entityIds: [],
    entityIdToIndex: new Map(),
  };
}

/**
 * Get or create an entity index for the store.
 */
function getEntityIndex(store, entityId) {
  if (store.entityIdToIndex.has(entityId)) {
    return store.entityIdToIndex.get(entityId);
  }
  const idx = store.entityIds.length;
  store.entityIds.push(entityId);
  store.entityIdToIndex.set(entityId, idx);
  return idx;
}

/**
 * Ensure store has enough capacity, growing if needed.
 */
function ensureCapacity(store, needed) {
  if (store.capacity >= needed) return;
  const newCap = Math.max(needed, store.capacity * 2);
  const newTimestamps = new Float64Array(newCap);
  const newLongitudes = new Float64Array(newCap);
  const newLatitudes = new Float64Array(newCap);
  const newAltitudes = new Float32Array(newCap);
  const newEntityIndices = new Uint32Array(newCap);

  newTimestamps.set(store.timestamps);
  newLongitudes.set(store.longitudes);
  newLatitudes.set(store.latitudes);
  newAltitudes.set(store.altitudes);
  newEntityIndices.set(store.entityIndices);

  store.timestamps = newTimestamps;
  store.longitudes = newLongitudes;
  store.latitudes = newLatitudes;
  store.altitudes = newAltitudes;
  store.entityIndices = newEntityIndices;
  store.capacity = newCap;
}

/**
 * Append a single event to the store.
 */
export function appendEvent(store, entityId, timestamp, lng, lat, altitude = 0) {
  ensureCapacity(store, store.length + 1);
  const i = store.length;
  store.timestamps[i] = timestamp;
  store.longitudes[i] = lng;
  store.latitudes[i] = lat;
  store.altitudes[i] = altitude;
  store.entityIndices[i] = getEntityIndex(store, entityId);
  store.length++;
}

/**
 * Batch append events from tracks (convert from object model to binary).
 * @param {BinaryEventStore} store
 * @param {import('./models.js').Track[]} tracks
 */
export function appendTracks(store, tracks) {
  // Count total events
  let total = 0;
  for (const t of tracks) total += t.events.length;
  ensureCapacity(store, store.length + total);

  for (const track of tracks) {
    const entityIdx = getEntityIndex(store, track.entityId);
    for (const e of track.events) {
      const i = store.length;
      store.timestamps[i] = e.timestamp;
      store.longitudes[i] = e.lng;
      store.latitudes[i] = e.lat;
      store.altitudes[i] = e.altitudeM || 0;
      store.entityIndices[i] = entityIdx;
      store.length++;
    }
  }
}

/**
 * Sort the entire store by timestamp (needed for efficient time-range queries).
 */
export function sortByTimestamp(store) {
  // Create index array and sort
  const indices = Array.from({ length: store.length }, (_, i) => i);
  indices.sort((a, b) => store.timestamps[a] - store.timestamps[b]);

  // Reorder all columns according to sort
  const newTs = new Float64Array(store.capacity);
  const newLng = new Float64Array(store.capacity);
  const newLat = new Float64Array(store.capacity);
  const newAlt = new Float32Array(store.capacity);
  const newEnt = new Uint32Array(store.capacity);

  for (let i = 0; i < store.length; i++) {
    const src = indices[i];
    newTs[i] = store.timestamps[src];
    newLng[i] = store.longitudes[src];
    newLat[i] = store.latitudes[src];
    newAlt[i] = store.altitudes[src];
    newEnt[i] = store.entityIndices[src];
  }

  store.timestamps = newTs;
  store.longitudes = newLng;
  store.latitudes = newLat;
  store.altitudes = newAlt;
  store.entityIndices = newEnt;
}

/**
 * Get time bounds of the store.
 */
export function getStoreBounds(store) {
  if (store.length === 0) return { timeMin: 0, timeMax: 0, west: 0, south: 0, east: 0, north: 0 };

  let timeMin = Infinity, timeMax = -Infinity;
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;

  for (let i = 0; i < store.length; i++) {
    const t = store.timestamps[i];
    if (t < timeMin) timeMin = t;
    if (t > timeMax) timeMax = t;
    const lng = store.longitudes[i];
    const lat = store.latitudes[i];
    if (lng < west) west = lng;
    if (lng > east) east = lng;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  }

  return { timeMin, timeMax, west, south, east, north };
}

/**
 * Query events within a time range using binary search.
 * Assumes store is sorted by timestamp.
 *
 * @returns {{start: number, end: number}} Indices into the store arrays
 */
export function queryTimeRange(store, startMs, endMs) {
  // Binary search for start
  let lo = 0, hi = store.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (store.timestamps[mid] < startMs) lo = mid + 1;
    else hi = mid;
  }
  const start = lo;

  // Binary search for end
  hi = store.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (store.timestamps[mid] <= endMs) lo = mid + 1;
    else hi = mid;
  }
  const end = lo;

  return { start, end };
}

/**
 * Query events within a spatial bounding box + optional time range.
 * Returns indices of matching events.
 *
 * @param {BinaryEventStore} store
 * @param {number} west
 * @param {number} south
 * @param {number} east
 * @param {number} north
 * @param {number} [startMs]
 * @param {number} [endMs]
 * @returns {Uint32Array} Indices of matching events
 */
export function querySpatioTemporal(store, west, south, east, north, startMs, endMs) {
  const results = [];
  const scanStart = (startMs != null) ? queryTimeRange(store, startMs, endMs ?? Infinity).start : 0;
  const scanEnd = (endMs != null) ? queryTimeRange(store, startMs ?? 0, endMs).end : store.length;

  for (let i = scanStart; i < scanEnd; i++) {
    const lng = store.longitudes[i];
    const lat = store.latitudes[i];
    if (lng >= west && lng <= east && lat >= south && lat <= north) {
      results.push(i);
    }
  }

  return new Uint32Array(results);
}

/**
 * Create deck.gl-compatible binary attribute objects from the store.
 * This allows deck.gl to consume data directly without JS object overhead.
 *
 * @param {BinaryEventStore} store
 * @param {number} [startIdx=0]
 * @param {number} [endIdx]
 * @returns {Object} Binary attributes for ScatterplotLayer
 */
export function toBinaryAttributes(store, startIdx = 0, endIdx) {
  const end = endIdx ?? store.length;
  const count = end - startIdx;

  // Interleave positions as [lng, lat, alt, lng, lat, alt, ...]
  const positions = new Float64Array(count * 3);
  for (let i = 0; i < count; i++) {
    const si = startIdx + i;
    positions[i * 3] = store.longitudes[si];
    positions[i * 3 + 1] = store.latitudes[si];
    positions[i * 3 + 2] = store.altitudes[si];
  }

  // Filter values (timestamps) for DataFilterExtension
  const filterValues = store.timestamps.subarray(startIdx, end);

  return {
    length: count,
    attributes: {
      getPosition: { value: positions, size: 3 },
      getFilterValue: { value: new Float32Array(filterValues), size: 1 },
    },
    entityIndices: store.entityIndices.subarray(startIdx, end),
  };
}

/**
 * Get event count per entity for the store.
 * @returns {Map<string, number>}
 */
export function getEntityEventCounts(store) {
  const counts = new Map();
  for (let i = 0; i < store.length; i++) {
    const entityId = store.entityIds[store.entityIndices[i]];
    counts.set(entityId, (counts.get(entityId) || 0) + 1);
  }
  return counts;
}
