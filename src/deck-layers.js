/**
 * deck.gl advanced visualization layers for ViewTopia.
 *
 * Provides kepler.gl-style visualizations using deck.gl directly:
 * - HeatmapLayer: density-based heat maps
 * - HexagonLayer: 3D hexagonal binning
 * - ArcLayer: origin–destination arcs
 * - ScatterplotLayer: sized/colored point plots
 * - ScreenGridLayer: GPU screen-space gridding
 *
 * These layers can be added to the deck.gl renderer or used standalone.
 */

import { HeatmapLayer, HexagonLayer, ScreenGridLayer } from '@deck.gl/aggregation-layers';
import { ArcLayer, ScatterplotLayer } from '@deck.gl/layers';

/**
 * Create a HeatmapLayer from point data.
 * @param {Object} opts
 * @param {Array} opts.data - Array of {lat, lon, weight?} or GeoJSON FeatureCollection
 * @param {string} [opts.id] - Layer ID
 * @param {number} [opts.radius] - Radius in pixels (default 30)
 * @param {number} [opts.intensity] - Intensity multiplier (default 1)
 */
export function createHeatmapLayer({ data, id = 'heatmap', radius = 30, intensity = 1 }) {
  const points = normalizePoints(data);
  return new HeatmapLayer({
    id,
    data: points,
    getPosition: d => [d.lon, d.lat],
    getWeight: d => d.weight || 1,
    radiusPixels: radius,
    intensity,
    threshold: 0.05,
    colorRange: [
      [1, 152, 189], [73, 227, 206], [216, 254, 181],
      [254, 237, 177], [254, 173, 84], [209, 55, 78],
    ],
  });
}

/**
 * Create a HexagonLayer for 3D hexagonal binning.
 * @param {Object} opts
 * @param {Array} opts.data
 * @param {string} [opts.id]
 * @param {number} [opts.radius] - Hexagon radius in meters (default 1000)
 * @param {number} [opts.elevationScale] - Elevation multiplier (default 4)
 * @param {boolean} [opts.extruded] - 3D extrusion (default true)
 */
export function createHexagonLayer({ data, id = 'hexagon', radius = 1000, elevationScale = 4, extruded = true }) {
  const points = normalizePoints(data);
  return new HexagonLayer({
    id,
    data: points,
    getPosition: d => [d.lon, d.lat],
    radius,
    elevationScale,
    extruded,
    pickable: true,
    colorRange: [
      [1, 152, 189], [73, 227, 206], [216, 254, 181],
      [254, 237, 177], [254, 173, 84], [209, 55, 78],
    ],
  });
}

/**
 * Create an ArcLayer for origin–destination visualization.
 * @param {Object} opts
 * @param {Array} opts.data - Array of {from: [lon, lat], to: [lon, lat], ...}
 * @param {string} [opts.id]
 * @param {number} [opts.width] - Line width (default 2)
 */
export function createArcLayer({ data, id = 'arcs', width = 2 }) {
  return new ArcLayer({
    id,
    data,
    getSourcePosition: d => d.from,
    getTargetPosition: d => d.to,
    getSourceColor: [124, 58, 237, 200],  // purple
    getTargetColor: [6, 182, 212, 200],   // cyan
    getWidth: width,
    pickable: true,
  });
}

/**
 * Create a ScatterplotLayer for sized/colored point data.
 * @param {Object} opts
 * @param {Array} opts.data
 * @param {string} [opts.id]
 * @param {number} [opts.radius] - Point radius (default 100)
 * @param {Array} [opts.color] - RGBA color (default purple)
 */
export function createScatterLayer({ data, id = 'scatter', radius = 100, color = [124, 58, 237, 180] }) {
  const points = normalizePoints(data);
  return new ScatterplotLayer({
    id,
    data: points,
    getPosition: d => [d.lon, d.lat],
    getRadius: d => d.radius || radius,
    getFillColor: d => d.color || color,
    pickable: true,
    radiusMinPixels: 2,
    radiusMaxPixels: 50,
  });
}

/**
 * Create a ScreenGridLayer for fast GPU-based density visualization.
 * @param {Object} opts
 * @param {Array} opts.data
 * @param {string} [opts.id]
 * @param {number} [opts.cellSize] - Grid cell size in pixels (default 20)
 */
export function createScreenGridLayer({ data, id = 'screengrid', cellSize = 20 }) {
  const points = normalizePoints(data);
  return new ScreenGridLayer({
    id,
    data: points,
    getPosition: d => [d.lon, d.lat],
    getWeight: d => d.weight || 1,
    cellSizePixels: cellSize,
    colorRange: [
      [1, 152, 189, 25], [73, 227, 206, 85], [216, 254, 181, 127],
      [254, 237, 177, 170], [254, 173, 84, 220], [209, 55, 78, 255],
    ],
  });
}

/** Normalize GeoJSON or plain arrays to [{lat, lon, weight?, ...}] */
function normalizePoints(data) {
  if (!data) return [];
  // GeoJSON FeatureCollection
  if (data.type === 'FeatureCollection' && Array.isArray(data.features)) {
    return data.features
      .filter(f => f.geometry && (f.geometry.type === 'Point' || f.geometry.type === 'MultiPoint'))
      .map(f => {
        const [lon, lat] = f.geometry.coordinates;
        return { lon, lat, ...f.properties };
      });
  }
  // Array of features
  if (Array.isArray(data) && data[0]?.geometry) {
    return data
      .filter(f => f.geometry?.type === 'Point')
      .map(f => ({ lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], ...f.properties }));
  }
  // Already normalized
  return data;
}

/** All available viz types for the UI */
export const VIZ_TYPES = [
  { id: 'heatmap', label: 'Heatmap', icon: '🔥', create: createHeatmapLayer },
  { id: 'hexagon', label: 'Hexbin', icon: '⬡', create: createHexagonLayer },
  { id: 'arc', label: 'Arcs', icon: '🌈', create: createArcLayer },
  { id: 'scatter', label: 'Scatter', icon: '⚬', create: createScatterLayer },
  { id: 'screengrid', label: 'Grid', icon: '▦', create: createScreenGridLayer },
];
