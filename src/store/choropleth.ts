/**
 * Shading an agent layer's features by one of its numeric attributes.
 *
 * The class colour is baked into each feature as simplestyle properties (`fill`,
 * `stroke`, `marker-color`), which Cesium's GeoJsonDataSource already honours
 * per feature, and which MapLibre and Leaflet read through a paint expression
 * and a style callback. So one computation here serves all three renderers and
 * none of them needs its own scale.
 */
import { generateLegend } from '../raster/renderer';
import type { ColorRamp } from '../raster/types';
import { propertyKeys } from '../lib/geojsonSources';
import type { AgentLayer } from './agentLayers';

export const CHOROPLETH_CLASSES = 5;
export const CHOROPLETH_RAMP: ColorRamp = 'viridis';

/** Which simplestyle key carries the colour for a geometry. */
const STYLE_KEYS: Record<GeoJSON.Geometry['type'], string[]> = {
  Point: ['marker-color'],
  MultiPoint: ['marker-color'],
  LineString: ['stroke'],
  MultiLineString: ['stroke'],
  // the outline stays the layer's own colour, so only the fill is shaded
  Polygon: ['fill'],
  MultiPolygon: ['fill'],
  GeometryCollection: ['fill', 'stroke', 'marker-color'],
};

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** The layer's features as they were before any classification. */
function baseGeojson(layer: AgentLayer): GeoJSON.FeatureCollection {
  return layer.sourceGeojson ?? layer.geojson;
}

function values(geojson: GeoJSON.FeatureCollection, field: string): number[] {
  return geojson.features.map((f) => f.properties?.[field]).filter(isNumber);
}

/**
 * Fields worth shading by: numeric, and with more than one distinct value.
 * A layer of one polygon carrying every score has nothing to shade, and a
 * dropdown there would only produce a uniform fill.
 */
export function choroplethFields(layer: AgentLayer): string[] {
  const geojson = baseGeojson(layer);
  const keys = propertyKeys({ id: layer.id, name: layer.name, geojson });
  return keys.filter((key) => new Set(values(geojson, key)).size > 1);
}

/** Index of the class a value falls in, given the classes' lower bounds. */
export function classOf(value: number, breaks: number[]): number {
  let i = breaks.length - 1;
  while (i > 0 && value < breaks[i]) i--;
  return i;
}

/** A simplestyle colour off a feature, for a renderer that reads them itself. */
export function simplestyleColor(
  feature: GeoJSON.Feature | undefined,
  key: string,
  fallback: string,
): string {
  const value = feature?.properties?.[key];
  return typeof value === 'string' ? value : fallback;
}

/**
 * Shade the layer by one numeric field. The features are copies with the class
 * colour added, and the originals are kept on the layer so clearing restores
 * them rather than having to unpick baked properties.
 */
export function classifyLayer(
  layer: AgentLayer,
  field: string,
  ramp: ColorRamp = CHOROPLETH_RAMP,
  classes: number = CHOROPLETH_CLASSES,
): AgentLayer {
  const geojson = baseGeojson(layer);
  const numbers = values(geojson, field);
  if (new Set(numbers).size < 2) return layer;

  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  // generateLegend samples the ramp at `classes` points across the range, which
  // is the colour scale we want; its values are those sample points rather than
  // bin bounds, so the equal-width lower bounds are derived here
  const colors = generateLegend(ramp, min, max, classes).map((entry) => entry.color);
  const width = (max - min) / classes;
  const breaks = colors.map((_, i) => min + i * width);

  const features = geojson.features.map((feature) => {
    const value = feature.properties?.[field];
    if (!isNumber(value)) return feature;
    const color = colors[classOf(value, breaks)];
    const baked = Object.fromEntries(
      (STYLE_KEYS[feature.geometry?.type] ?? []).map((key) => [key, color]),
    );
    return { ...feature, properties: { ...feature.properties, ...baked } };
  });

  return {
    ...layer,
    sourceGeojson: geojson,
    geojson: { ...geojson, features },
    choropleth: { field, breaks, colors },
  };
}

/** Put the layer back to its single colour. */
export function clearClassification(layer: AgentLayer): AgentLayer {
  if (!layer.sourceGeojson) return layer;
  return {
    ...layer,
    geojson: layer.sourceGeojson,
    sourceGeojson: undefined,
    choropleth: undefined,
  };
}
