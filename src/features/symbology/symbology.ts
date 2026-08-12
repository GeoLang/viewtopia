/**
 * Data-driven symbology for agent layers: graduated, categorized and rule-based
 * renderers. The class colour is baked into each feature as simplestyle
 * properties (`fill`, `stroke`, `marker-color`), which Cesium's
 * GeoJsonDataSource already honours per feature, and which MapLibre and Leaflet
 * read through a paint expression and a style callback. So one computation here
 * serves all three renderers and none of them needs its own scale.
 */
import { generateLegend } from '../../raster/renderer';
import type { ColorRamp } from '../../raster/types';
import { propertyKeys } from '../../lib/geojsonSources';
import type { AgentLayer } from '../../store/agentLayers';

export const GRADUATED_CLASSES = 5;
export const GRADUATED_RAMP: ColorRamp = 'viridis';
/** More distinct values than this and a field stops being a category. */
export const CATEGORY_CAP = 12;

export const CATEGORY_PALETTE = [
  '#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948',
  '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac', '#86bcb6', '#d37295',
];

export type BreakMethod = 'equal' | 'quantile';

export interface GraduatedSymbology {
  kind: 'graduated';
  field: string;
  method: BreakMethod;
  ramp: ColorRamp;
  /** Class lower bounds. */
  breaks: number[];
  colors: string[];
}

export interface CategorizedSymbology {
  kind: 'categorized';
  field: string;
  /** Every distinct value of the field; a feature missing it keeps its colour. */
  categories: { value: string | number; color: string }[];
}

export type RuleOp = '==' | '!=' | '<' | '<=' | '>' | '>=';

export interface SymbologyRule {
  field: string;
  op: RuleOp;
  /** Compared numerically when both sides parse as numbers, as text otherwise. */
  value: string;
  color: string;
}

export interface RuleSymbology {
  kind: 'rules';
  /** First match wins; an unmatched feature keeps the layer colour. */
  rules: SymbologyRule[];
}

export type Symbology = GraduatedSymbology | CategorizedSymbology | RuleSymbology;

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

/** The layer's features as they were before any symbology. */
function baseGeojson(layer: AgentLayer): GeoJSON.FeatureCollection {
  return layer.sourceGeojson ?? layer.geojson;
}

function numericValues(geojson: GeoJSON.FeatureCollection, field: string): number[] {
  return geojson.features.map((f) => f.properties?.[field]).filter(isNumber);
}

/**
 * Fields worth a graduated renderer: numeric, and with more than one distinct
 * value. A layer of one polygon carrying every score has nothing to shade, and
 * a dropdown there would only produce a uniform fill.
 */
export function numericFields(layer: AgentLayer): string[] {
  const geojson = baseGeojson(layer);
  return propertyKeys({ id: layer.id, name: layer.name, geojson }).filter(
    (key) => new Set(numericValues(geojson, key)).size > 1,
  );
}

function distinctValues(geojson: GeoJSON.FeatureCollection, field: string): (string | number)[] {
  const counts = new Map<string | number, number>();
  for (const f of geojson.features) {
    const v = f.properties?.[field];
    if (typeof v !== 'string' && !isNumber(v)) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a, na], [b, nb]) => nb - na || String(a).localeCompare(String(b)))
    .map(([v]) => v);
}

/** Fields whose distinct values are few enough to each get a colour. */
export function categoricalFields(layer: AgentLayer): string[] {
  const geojson = baseGeojson(layer);
  return propertyKeys({ id: layer.id, name: layer.name, geojson }).filter((key) => {
    const n = distinctValues(geojson, key).length;
    return n > 1 && n <= CATEGORY_CAP;
  });
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

export function buildGraduated(
  layer: AgentLayer,
  field: string,
  method: BreakMethod = 'equal',
  classes: number = GRADUATED_CLASSES,
  ramp: ColorRamp = GRADUATED_RAMP,
): GraduatedSymbology | null {
  const numbers = numericValues(baseGeojson(layer), field);
  if (new Set(numbers).size < 2) return null;

  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  let breaks: number[];
  if (method === 'quantile') {
    const sorted = [...numbers].sort((a, b) => a - b);
    const bounds = Array.from({ length: classes }, (_, i) =>
      sorted[Math.floor((i * sorted.length) / classes)],
    );
    // repeated values can collapse quantile bounds into the same number
    breaks = [...new Set(bounds)];
  } else {
    const width = (max - min) / classes;
    breaks = Array.from({ length: classes }, (_, i) => min + i * width);
  }
  // generateLegend samples the ramp at `classes` points across the range, which
  // is the colour scale we want; its values are those sample points rather than
  // bin bounds, so the lower bounds are derived above
  const colors = generateLegend(ramp, min, max, breaks.length).map((entry) => entry.color);
  return { kind: 'graduated', field, method, ramp, breaks, colors };
}

export function buildCategorized(layer: AgentLayer, field: string): CategorizedSymbology | null {
  const values = distinctValues(baseGeojson(layer), field);
  if (values.length < 2 || values.length > CATEGORY_CAP) return null;
  return {
    kind: 'categorized',
    field,
    categories: values.map((value, i) => ({
      value,
      color: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length],
    })),
  };
}

/**
 * The renderer a column the agent named wants: an ordered ramp for numbers,
 * one colour per value for text. Null when the file has no such column, or too
 * little in it to separate, and the layer keeps its single colour.
 */
export function suggestSymbology(layer: AgentLayer, field: string): Symbology | null {
  return buildGraduated(layer, field) ?? buildCategorized(layer, field);
}

function matchesRule(props: GeoJSON.GeoJsonProperties, rule: SymbologyRule): boolean {
  const v = props?.[rule.field];
  if (v == null) return false;
  const num = Number(rule.value);
  const numeric = isNumber(v) && rule.value.trim() !== '' && Number.isFinite(num);
  switch (rule.op) {
    case '==':
      return numeric ? v === num : String(v) === rule.value;
    case '!=':
      return numeric ? v !== num : String(v) !== rule.value;
    case '<':
      return numeric && v < num;
    case '<=':
      return numeric && v <= num;
    case '>':
      return numeric && v > num;
    case '>=':
      return numeric && v >= num;
  }
}

/** The symbology's colour for one feature, or null to keep its own. */
export function symbologyColor(feature: GeoJSON.Feature, sym: Symbology): string | null {
  const props = feature.properties;
  switch (sym.kind) {
    case 'graduated': {
      const value = props?.[sym.field];
      return isNumber(value) ? sym.colors[classOf(value, sym.breaks)] : null;
    }
    case 'categorized': {
      const value = props?.[sym.field];
      return sym.categories.find((c) => c.value === value)?.color ?? null;
    }
    case 'rules':
      return sym.rules.find((r) => matchesRule(props, r))?.color ?? null;
  }
}

/**
 * Restyle the layer. The features are copies with the colour added, and the
 * originals are kept on the layer so clearing restores them rather than having
 * to unpick baked properties.
 */
export function applySymbology(layer: AgentLayer, sym: Symbology): AgentLayer {
  const geojson = baseGeojson(layer);
  const features = geojson.features.map((feature) => {
    const color = symbologyColor(feature, sym);
    if (color === null) return feature;
    const baked = Object.fromEntries(
      (STYLE_KEYS[feature.geometry?.type] ?? []).map((key) => [key, color]),
    );
    return { ...feature, properties: { ...feature.properties, ...baked } };
  });
  return {
    ...layer,
    sourceGeojson: geojson,
    geojson: { ...geojson, features },
    symbology: sym,
  };
}

/** Put the layer back to its single colour. */
export function clearSymbology(layer: AgentLayer): AgentLayer {
  if (!layer.sourceGeojson) return { ...layer, symbology: undefined };
  return {
    ...layer,
    geojson: layer.sourceGeojson,
    sourceGeojson: undefined,
    symbology: undefined,
  };
}

const short = (v: number) => String(Number(v.toPrecision(3)));

/** One swatch per class, for the legend. */
export function legendEntries(sym: Symbology): { color: string; label: string }[] {
  switch (sym.kind) {
    case 'graduated':
      return sym.breaks.map((lower, i) => {
        const upper = sym.breaks[i + 1];
        const range = upper === undefined ? `${short(lower)}+` : `${short(lower)} to ${short(upper)}`;
        return { color: sym.colors[i], label: range };
      });
    case 'categorized':
      return sym.categories.map((c) => ({ color: c.color, label: String(c.value) }));
    case 'rules':
      return sym.rules.map((r) => ({ color: r.color, label: `${r.field} ${r.op} ${r.value}` }));
  }
}

/** The field a symbology reads, for labelling; rules read several. */
export function symbologyField(sym: Symbology): string | null {
  return sym.kind === 'rules' ? null : sym.field;
}

/**
 * A project file saved before symbology existed carries the old choropleth
 * shape; its baked features and sourceGeojson are already right, so only the
 * metadata needs converting.
 */
export function migrateLegacyChoropleth(layer: AgentLayer): AgentLayer {
  const { choropleth, ...rest } = layer as AgentLayer & {
    choropleth?: { field: string; breaks: number[]; colors: string[] };
  };
  if (!choropleth || layer.symbology) return layer;
  return {
    ...rest,
    symbology: {
      kind: 'graduated',
      field: choropleth.field,
      method: 'equal',
      ramp: GRADUATED_RAMP,
      breaks: choropleth.breaks,
      colors: choropleth.colors,
    },
  };
}
