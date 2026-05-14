/**
 * Space-time data models — ported from Continuum's continuum-core.
 *
 * Entity: a tracked thing (person, vehicle, device).
 * Event: an entity observed at a location at a time.
 * Track: ordered sequence of events for one entity.
 */

/**
 * @typedef {'person'|'vehicle'|'device'|'organization'|'location'|'custom'} EntityKind
 */

/**
 * @typedef {Object} Entity
 * @property {string} id - UUID
 * @property {string} name
 * @property {EntityKind} kind
 * @property {string[]} aliases
 * @property {Object} metadata
 * @property {string} color - Hex color for rendering
 */

/**
 * @typedef {Object} Event
 * @property {string} id - UUID
 * @property {string} entityId
 * @property {number} timestamp - Unix ms
 * @property {number} lng
 * @property {number} lat
 * @property {number|null} altitudeM
 * @property {number|null} accuracyM
 * @property {string|null} source
 * @property {Object} metadata
 */

/**
 * @typedef {Object} Track
 * @property {string} entityId
 * @property {Event[]} events - sorted by timestamp
 * @property {number} startTime - Unix ms
 * @property {number} endTime - Unix ms
 */

let nextId = 0;
function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : `local-${++nextId}`;
}

const ENTITY_COLORS = [
  '#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4',
  '#42d4f4', '#f032e6', '#bfef45', '#fabed4', '#469990',
  '#dcbeff', '#9a6324', '#800000', '#aaffc3', '#808000',
];
let colorIdx = 0;

export function createEntity(name, kind = 'custom') {
  return {
    id: uuid(),
    name,
    kind,
    aliases: [],
    metadata: {},
    color: ENTITY_COLORS[colorIdx++ % ENTITY_COLORS.length],
  };
}

export function createEvent(entityId, timestamp, lng, lat, opts = {}) {
  return {
    id: uuid(),
    entityId,
    timestamp: typeof timestamp === 'number' ? timestamp : new Date(timestamp).getTime(),
    lng,
    lat,
    altitudeM: opts.altitudeM ?? null,
    accuracyM: opts.accuracyM ?? null,
    source: opts.source ?? null,
    metadata: opts.metadata ?? {},
  };
}

export function createTrack(entityId, events = []) {
  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
  return {
    entityId,
    events: sorted,
    startTime: sorted.length ? sorted[0].timestamp : 0,
    endTime: sorted.length ? sorted[sorted.length - 1].timestamp : 0,
  };
}

/**
 * Haversine distance in meters.
 */
export function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6_371_000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

/**
 * Total track distance in meters.
 */
export function trackDistanceM(track) {
  let total = 0;
  for (let i = 1; i < track.events.length; i++) {
    const a = track.events[i - 1];
    const b = track.events[i];
    total += haversineM(a.lat, a.lng, b.lat, b.lng);
  }
  return total;
}
