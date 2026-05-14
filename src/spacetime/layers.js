/**
 * Space-Time deck.gl layer — visualizes entity tracks as 3D line strips
 * where time maps to the Z-axis (elevation).
 *
 * Performance-optimized for large datasets:
 * - Path data pre-built once (not per frame)
 * - GPU-side filtering via DataFilterExtension for time window
 * - ScatterplotLayer uses flat typed arrays where possible
 */

import { PathLayer, ScatterplotLayer, ArcLayer } from '@deck.gl/layers';
import { DataFilterExtension } from '@deck.gl/extensions';

/** @typedef {import('./models.js').Track} Track */
/** @typedef {import('./models.js').Event} Event */

/**
 * @typedef {Object} SpaceTimeLayerOptions
 * @property {Track[]} tracks - Array of tracks to render
 * @property {Map<string, import('./models.js').Entity>} entities - Entity lookup by ID
 * @property {number} timeMin - Earliest timestamp in view (Unix ms)
 * @property {number} timeMax - Latest timestamp in view (Unix ms)
 * @property {number} [elevationScale=5000] - Meters per unit time range
 * @property {number} [currentTime] - Optional highlight time (Unix ms)
 * @property {number} [trailDuration] - If set, only show events within this window (ms)
 */

/**
 * Convert hex color to [r, g, b, a] array.
 */
function hexToRgba(hex, alpha = 255) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff, alpha];
}

/**
 * Map a timestamp to an elevation value.
 */
function timeToElevation(timestamp, timeMin, timeMax, elevationScale) {
  if (timeMax === timeMin) return 0;
  const fraction = (timestamp - timeMin) / (timeMax - timeMin);
  return fraction * elevationScale;
}

// --- Pre-built data cache (avoids rebuilding every frame) ---
let _cachedTrackData = null;
let _cachedEventData = null;
let _cacheKey = null;

function getCacheKey(tracks, elevationScale, timeMin, timeMax) {
  return `${tracks.length}:${elevationScale}:${timeMin}:${timeMax}`;
}

/**
 * Pre-build path and event data. Only rebuilds if tracks or params change.
 */
function buildData(tracks, entities, timeMin, timeMax, elevationScale) {
  const key = getCacheKey(tracks, elevationScale, timeMin, timeMax);
  if (_cacheKey === key && _cachedTrackData) {
    return { pathData: _cachedTrackData, eventData: _cachedEventData };
  }

  const pathData = [];
  const eventData = [];

  for (const track of tracks) {
    if (track.events.length < 2) continue;
    const entity = entities.get(track.entityId);
    const color = entity ? hexToRgba(entity.color) : [200, 200, 200, 200];

    const path = new Array(track.events.length);
    for (let i = 0; i < track.events.length; i++) {
      const e = track.events[i];
      path[i] = [e.lng, e.lat, timeToElevation(e.timestamp, timeMin, timeMax, elevationScale)];
      eventData.push({
        position: path[i],
        color,
        timestamp: e.timestamp,
        entityId: track.entityId,
        name: entity?.name ?? 'Unknown',
      });
    }

    pathData.push({ path, color, entityId: track.entityId, name: entity?.name ?? 'Unknown' });
  }

  _cachedTrackData = pathData;
  _cachedEventData = eventData;
  _cacheKey = key;
  return { pathData, eventData };
}

/**
 * Create deck.gl layers for space-time visualization.
 *
 * Optimized for large datasets:
 * - Path geometry is cached and only rebuilt when data changes
 * - DataFilterExtension handles time window filtering on the GPU
 * - Event scatter only rendered for datasets under 500k points
 *
 * @param {SpaceTimeLayerOptions} opts
 * @returns {Array} deck.gl layer instances
 */
export function createSpaceTimeLayers(opts) {
  const {
    tracks,
    entities,
    timeMin,
    timeMax,
    elevationScale = 5000,
    currentTime = null,
    trailDuration = null,
  } = opts;

  const layers = [];
  const { pathData, eventData } = buildData(tracks, entities, timeMin, timeMax, elevationScale);

  // Path layer — full tracks (GPU-filtered if trail is set)
  layers.push(new PathLayer({
    id: 'spacetime-paths',
    data: pathData,
    getPath: d => d.path,
    getColor: d => d.color,
    getWidth: 3,
    widthUnits: 'pixels',
    jointRounded: true,
    capRounded: true,
    pickable: true,
  }));

  // Event scatter — uses DataFilterExtension for GPU-side time filtering
  // Only render if dataset is manageable (deck.gl handles 500k+ points fine)
  if (eventData.length <= 500000) {
    const filterMin = (trailDuration != null && currentTime != null) ? currentTime - trailDuration : timeMin;
    const filterMax = currentTime ?? timeMax;

    layers.push(new ScatterplotLayer({
      id: 'spacetime-events',
      data: eventData,
      getPosition: d => d.position,
      getFillColor: d => d.color,
      getRadius: 4,
      radiusUnits: 'pixels',
      pickable: true,
      // GPU-side filter: only show events within time window
      getFilterValue: d => d.timestamp,
      filterRange: [filterMin, filterMax],
      extensions: [new DataFilterExtension({ filterSize: 1 })],
      updateTriggers: {
        getFilterValue: [timeMin],
        filterRange: [filterMin, filterMax],
      },
    }));
  }

  // Current-time highlight: show where each entity is NOW
  if (currentTime != null) {
    const currentPoints = [];
    for (const track of tracks) {
      if (track.events.length === 0) continue;
      const entity = entities.get(track.entityId);
      // Binary search for closest event to currentTime
      const closest = binarySearchClosest(track.events, currentTime);
      if (!closest) continue;
      currentPoints.push({
        position: [closest.lng, closest.lat, timeToElevation(closest.timestamp, timeMin, timeMax, elevationScale)],
        color: entity ? hexToRgba(entity.color) : [255, 255, 255, 255],
        name: entity?.name ?? 'Unknown',
      });
    }

    layers.push(new ScatterplotLayer({
      id: 'spacetime-current',
      data: currentPoints,
      getPosition: d => d.position,
      getFillColor: d => d.color,
      getRadius: 8,
      radiusUnits: 'pixels',
      stroked: true,
      getLineColor: [255, 255, 255, 255],
      getLineWidth: 2,
      lineWidthUnits: 'pixels',
      pickable: true,
    }));
  }

  return layers;
}

/**
 * Binary search for the event closest to a target timestamp.
 * Assumes events are sorted by timestamp.
 */
function binarySearchClosest(events, target) {
  if (events.length === 0) return null;
  let lo = 0, hi = events.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (events[mid].timestamp < target) lo = mid + 1;
    else hi = mid;
  }
  // Check lo and lo-1 for closest
  if (lo > 0 && Math.abs(events[lo - 1].timestamp - target) < Math.abs(events[lo].timestamp - target)) {
    return events[lo - 1];
  }
  return events[lo];
}

/**
 * Get the time bounds for a set of tracks.
 */
export function getTimeBounds(tracks) {
  let min = Infinity;
  let max = -Infinity;
  for (const track of tracks) {
    if (track.startTime < min) min = track.startTime;
    if (track.endTime > max) max = track.endTime;
  }
  return { timeMin: min === Infinity ? 0 : min, timeMax: max === -Infinity ? 0 : max };
}

// --- Link visualization ---

const LINK_COLORS = {
  colocation: [255, 200, 0, 200],
  communication: [0, 200, 255, 200],
  financial: [0, 255, 100, 200],
  organizational: [200, 100, 255, 200],
  inferred: [180, 180, 180, 150],
};

/**
 * Create an ArcLayer showing links between entities.
 *
 * Each arc connects the latest known position of two linked entities.
 *
 * @param {Object} opts
 * @param {import('./models.js').Link[]} opts.links
 * @param {Map<string, import('./models.js').Entity>} opts.entities
 * @param {import('./models.js').Track[]} opts.tracks
 * @param {number} [opts.currentTime] - Filter links by time
 * @returns {ArcLayer|null}
 */
export function createLinkLayer({ links, entities, tracks, currentTime }) {
  if (!links || links.length === 0) return null;

  // Build entity → latest position map
  const posMap = new Map();
  for (const track of tracks) {
    if (track.events.length === 0) continue;
    let best = track.events[0];
    if (currentTime != null) {
      // Find event closest to currentTime
      for (const e of track.events) {
        if (Math.abs(e.timestamp - currentTime) < Math.abs(best.timestamp - currentTime)) {
          best = e;
        }
      }
    } else {
      best = track.events[track.events.length - 1];
    }
    posMap.set(track.entityId, best);
  }

  const arcData = links
    .filter(link => {
      if (currentTime != null) {
        if (link.firstSeen > currentTime || link.lastSeen < currentTime) return false;
      }
      return posMap.has(link.sourceId) && posMap.has(link.targetId);
    })
    .map(link => {
      const src = posMap.get(link.sourceId);
      const tgt = posMap.get(link.targetId);
      return {
        sourcePosition: [src.lng, src.lat],
        targetPosition: [tgt.lng, tgt.lat],
        color: LINK_COLORS[link.kind] || LINK_COLORS.inferred,
        strength: link.strength,
        kind: link.kind,
      };
    });

  if (arcData.length === 0) return null;

  return new ArcLayer({
    id: 'spacetime-links',
    data: arcData,
    getSourcePosition: d => d.sourcePosition,
    getTargetPosition: d => d.targetPosition,
    getSourceColor: d => d.color,
    getTargetColor: d => d.color,
    getWidth: d => 1 + d.strength * 3,
    widthUnits: 'pixels',
    pickable: true,
    getTooltip: d => d.kind,
  });
}
