/**
 * Space-Time deck.gl layer — visualizes entity tracks as 3D line strips
 * where time maps to the Z-axis (elevation).
 *
 * Each track appears as a colored path rising through time, with the
 * XY plane being the map and Z representing temporal progression.
 */

import { PathLayer, ScatterplotLayer } from '@deck.gl/layers';

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

/**
 * Create deck.gl layers for space-time visualization.
 *
 * Returns an array of layers:
 * - PathLayer for track lines (3D paths rising through time)
 * - ScatterplotLayer for event points
 * - Optional: highlighted "current time" points
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

  // Build path data: one path per track
  const pathData = tracks
    .filter(t => t.events.length >= 2)
    .map(track => {
      const entity = entities.get(track.entityId);
      const color = entity ? hexToRgba(entity.color) : [200, 200, 200, 200];
      let events = track.events;

      // Filter by trail duration if set
      if (trailDuration != null && currentTime != null) {
        const cutoff = currentTime - trailDuration;
        events = events.filter(e => e.timestamp >= cutoff && e.timestamp <= currentTime);
      }

      const path = events.map(e => [
        e.lng,
        e.lat,
        timeToElevation(e.timestamp, timeMin, timeMax, elevationScale),
      ]);

      return { path, color, entityId: track.entityId, name: entity?.name ?? 'Unknown' };
    })
    .filter(d => d.path.length >= 2);

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

  // Event points (only show if not too many)
  const allEvents = tracks.flatMap(t => {
    const entity = entities.get(t.entityId);
    let events = t.events;
    if (trailDuration != null && currentTime != null) {
      const cutoff = currentTime - trailDuration;
      events = events.filter(e => e.timestamp >= cutoff && e.timestamp <= currentTime);
    }
    return events.map(e => ({
      ...e,
      color: entity ? hexToRgba(entity.color) : [200, 200, 200, 200],
      elevation: timeToElevation(e.timestamp, timeMin, timeMax, elevationScale),
    }));
  });

  if (allEvents.length <= 10000) {
    layers.push(new ScatterplotLayer({
      id: 'spacetime-events',
      data: allEvents,
      getPosition: d => [d.lng, d.lat, d.elevation],
      getFillColor: d => d.color,
      getRadius: 4,
      radiusUnits: 'pixels',
      pickable: true,
    }));
  }

  // Current-time highlight: show where each entity is NOW
  if (currentTime != null) {
    const currentPoints = tracks
      .map(track => {
        const entity = entities.get(track.entityId);
        // Find the event closest to currentTime
        let closest = null;
        let minDist = Infinity;
        for (const e of track.events) {
          const dist = Math.abs(e.timestamp - currentTime);
          if (dist < minDist) {
            minDist = dist;
            closest = e;
          }
        }
        if (!closest) return null;
        return {
          lng: closest.lng,
          lat: closest.lat,
          elevation: timeToElevation(closest.timestamp, timeMin, timeMax, elevationScale),
          color: entity ? hexToRgba(entity.color) : [255, 255, 255, 255],
          name: entity?.name ?? 'Unknown',
        };
      })
      .filter(Boolean);

    layers.push(new ScatterplotLayer({
      id: 'spacetime-current',
      data: currentPoints,
      getPosition: d => [d.lng, d.lat, d.elevation],
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
