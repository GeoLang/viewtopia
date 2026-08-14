/**
 * Data-driven symbology for agent layers: graduated, categorized, rule-based
 * and expression renderers. The colour is baked into each feature as
 * simplestyle properties (`fill`, `stroke`, `marker-color`), which Cesium's
 * GeoJsonDataSource already honours per feature, and which MapLibre and Leaflet
 * read through a paint expression and a style callback. So one computation here
 * serves all three renderers and none of them needs its own scale. A point
 * radius rides along the same way, under `marker-radius`.
 */
import { generateLegend, sampleRamp } from '../../raster/renderer';
import type { ColorRamp } from '../../raster/types';
import { propertyKeys } from '../../lib/geojsonSources';
import type { AgentLayer } from '../../store/agentLayers';
import { evaluateExpression, parseExpression } from './expression';

export const GRADUATED_CLASSES = 5;
export const GRADUATED_RAMP: ColorRamp = 'viridis';
/** More distinct values than this and a field stops being a category. */
export const CATEGORY_CAP = 12;

export const CATEGORY_PALETTE = [
  '#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948',
  '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac', '#86bcb6', '#d37295',
];

export const COLOR_RAMPS: ColorRamp[] = [
  'viridis', 'magma', 'inferno', 'plasma', 'terrain', 'rdylgn',
  'spectral', 'greens', 'reds', 'blues', 'grays',
];

export type BreakMethod = 'equal' | 'quantile';
export const BREAK_METHODS: BreakMethod[] = ['equal', 'quantile'];

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
export const RULE_OPS: RuleOp[] = ['==', '!=', '<', '<=', '>', '>='];

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

/** Radius in pixels a point draws at, unless the symbology sizes it. */
export const POINT_RADIUS = 5;

/** Point radii an expression renderer spans by default, low value to high. */
export const EXPRESSION_SIZES: [number, number] = [3, 12];

/** How many places the ramp is sampled at, for the legend and for the class-only formats. */
export const EXPRESSION_STOPS = 5;

/** The per-feature radius, alongside the simplestyle colour keys. */
export const MARKER_RADIUS_KEY = 'marker-radius';

/** Cesium takes a marker size by name only, so a radius lands in one of these. */
const MARKER_SIZE_NAMES = ['small', 'medium', 'large'];

export interface ExpressionSymbology {
  kind: 'expression';
  /** Arithmetic over the feature's properties, in the syntax `expression.ts` reads. */
  expression: string;
  ramp: ColorRamp;
  /** The expression's low and high value over the layer's own features. */
  domain: [number, number];
  /** Point radius at each end of the domain, where the renderer sizes points too. */
  sizes?: [number, number];
}

export type Symbology =
  | GraduatedSymbology
  | CategorizedSymbology
  | RuleSymbology
  | ExpressionSymbology;

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

export type GeometryKind = 'point' | 'line' | 'polygon';

const GEOMETRY_KINDS: Record<GeoJSON.Geometry['type'], GeometryKind | null> = {
  Point: 'point',
  MultiPoint: 'point',
  LineString: 'line',
  MultiLineString: 'line',
  Polygon: 'polygon',
  MultiPolygon: 'polygon',
  GeometryCollection: null,
};

/**
 * The kinds of geometry the features hold, for an exchange format that
 * symbolizes each kind separately. A layer with nothing to read counts as
 * polygons, so an export still carries its colours.
 */
export function geometryKinds(geojson: GeoJSON.FeatureCollection): GeometryKind[] {
  const kinds = new Set<GeometryKind>();
  for (const feature of geojson.features) {
    const kind = GEOMETRY_KINDS[feature.geometry?.type];
    if (kind) kinds.add(kind);
  }
  return kinds.size ? [...kinds] : ['polygon'];
}

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

/** A simplestyle number off a feature, for a renderer that reads them itself. */
export function simplestyleNumber(
  feature: GeoJSON.Feature | undefined,
  key: string,
  fallback: number,
): number {
  const value = feature?.properties?.[key];
  return isNumber(value) ? value : fallback;
}

/** A colour ramp sampled at 0..1, in the form the raster legend already writes. */
export function rampColor(ramp: ColorRamp, position: number): string {
  const [red, green, blue] = sampleRamp(ramp, position);
  return `rgb(${red},${green},${blue})`;
}

const RGB_FORM = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i;
const HEX_FORM = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** A colour's channels, in either form an exchange format hands one back. */
export function colorChannels(color: string): [number, number, number] | null {
  const rgb = RGB_FORM.exec(color.trim());
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  const digits = HEX_FORM.exec(color.trim())?.[1];
  if (!digits) return null;
  const wide = digits.length === 3 ? [...digits].map((d) => d + d).join('') : digits;
  const [red, green, blue] = [0, 2, 4].map((at) => Number.parseInt(wide.slice(at, at + 2), 16));
  return [red, green, blue];
}

function sameColor(left: string, right: string): boolean {
  const one = colorChannels(left);
  const other = colorChannels(right);
  return one !== null && other !== null && String(one) === String(other);
}

/**
 * The ramp these colours are even samples of, where one of ours is. It is how
 * an exchange format that writes colours and no ramp name gets its ramp back.
 */
export function rampOfSamples(colors: string[]): ColorRamp | null {
  if (colors.length < 2) return null;
  return (
    COLOR_RAMPS.find((ramp) =>
      colors.every((color, index) => sameColor(rampColor(ramp, index / (colors.length - 1)), color)),
    ) ?? null
  );
}

/** Where a value sits across the domain, 0..1, clamped to its ends. */
function domainPosition(value: number, [low, high]: [number, number]): number {
  if (high <= low) return 0;
  return Math.min(1, Math.max(0, (value - low) / (high - low)));
}

/** The value a fraction of the way across a low-to-high span. */
export const spanAt = ([low, high]: [number, number], position: number) =>
  low + position * (high - low);

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

/**
 * An expression renderer over the layer, or null when the expression is
 * malformed or gives every feature the same value, which has nothing to shade.
 * `parseExpression` gives the reason a malformed one was refused.
 */
export function buildExpression(
  layer: AgentLayer,
  expression: string,
  ramp: ColorRamp = GRADUATED_RAMP,
  sizes?: [number, number],
): ExpressionSymbology | null {
  const { node } = parseExpression(expression);
  if (!node) return null;
  const values = baseGeojson(layer)
    .features.map((feature) => evaluateExpression(node, feature.properties))
    .filter(isNumber);
  if (new Set(values).size < 2) return null;
  const domain: [number, number] = [Math.min(...values), Math.max(...values)];
  return { kind: 'expression', expression, ramp, domain, ...(sizes ? { sizes } : {}) };
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

/** How the symbology draws one feature; a null keeps whatever the layer draws. */
export interface FeatureStyle {
  color: string | null;
  /** Point radius in pixels, where the symbology sizes points. */
  radius: number | null;
}

const NO_STYLE: FeatureStyle = { color: null, radius: null };

function classColor(
  feature: GeoJSON.Feature,
  sym: GraduatedSymbology | CategorizedSymbology | RuleSymbology,
): string | null {
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

function expressionStyler(sym: ExpressionSymbology): (feature: GeoJSON.Feature) => FeatureStyle {
  const { node } = parseExpression(sym.expression);
  if (!node) return () => NO_STYLE;
  return (feature) => {
    const value = evaluateExpression(node, feature.properties);
    if (value === null) return NO_STYLE;
    const position = domainPosition(value, sym.domain);
    return {
      color: rampColor(sym.ramp, position),
      radius: sym.sizes ? spanAt(sym.sizes, position) : null,
    };
  };
}

/**
 * The symbology's style for one feature. Built once per layer, because an
 * expression renderer parses its expression here rather than per feature.
 */
export function featureStyler(sym: Symbology): (feature: GeoJSON.Feature) => FeatureStyle {
  if (sym.kind === 'expression') return expressionStyler(sym);
  return (feature) => ({ color: classColor(feature, sym), radius: null });
}

function markerSizeName(radius: number, sizes: [number, number]): string {
  const bucket = Math.floor(domainPosition(radius, sizes) * MARKER_SIZE_NAMES.length);
  return MARKER_SIZE_NAMES[Math.min(MARKER_SIZE_NAMES.length - 1, bucket)];
}

/**
 * Restyle the layer. The features are copies with the colour added, and the
 * originals are kept on the layer so clearing restores them rather than having
 * to unpick baked properties.
 */
export function applySymbology(layer: AgentLayer, sym: Symbology): AgentLayer {
  const geojson = baseGeojson(layer);
  const styler = featureStyler(sym);
  const sizes = sym.kind === 'expression' ? sym.sizes : undefined;
  const features = geojson.features.map((feature) => {
    const { color, radius } = styler(feature);
    const baked: Record<string, string | number> = {};
    if (color !== null) {
      for (const key of STYLE_KEYS[feature.geometry?.type] ?? []) baked[key] = color;
    }
    if (radius !== null && sizes && GEOMETRY_KINDS[feature.geometry?.type] === 'point') {
      baked[MARKER_RADIUS_KEY] = radius;
      baked['marker-size'] = markerSizeName(radius, sizes);
    }
    if (Object.keys(baked).length === 0) return feature;
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

/** A number short enough for a label. */
export const shortNumber = (v: number) => String(Number(v.toPrecision(3)));

/** The ramp cut into classes, for a legend or a format that writes classes only. */
export interface ExpressionClass {
  /** The values this class covers, low to high. */
  bounds: [number, number];
  color: string;
  /** Point radius in pixels, where the symbology sizes points. */
  radius?: number;
}

const stopPositions = () =>
  Array.from({ length: EXPRESSION_STOPS }, (_, index) => index / (EXPRESSION_STOPS - 1));

/**
 * An expression renderer's continuous ramp cut into classes. A feature draws in
 * the colour its own value samples, so these are an approximation, and every
 * format that writes them says so.
 */
export function expressionClasses(sym: ExpressionSymbology): ExpressionClass[] {
  const width = (sym.domain[1] - sym.domain[0]) / EXPRESSION_STOPS;
  return stopPositions().map((position, index) => ({
    bounds: [sym.domain[0] + index * width, sym.domain[0] + (index + 1) * width],
    color: rampColor(sym.ramp, position),
    ...(sym.sizes ? { radius: spanAt(sym.sizes, position) } : {}),
  }));
}

export interface LegendEntry {
  color: string;
  label: string;
  /** Point radius in pixels, where the symbology sizes points. */
  radius?: number;
}

/** One swatch per class, for the legend. */
export function legendEntries(sym: Symbology): LegendEntry[] {
  switch (sym.kind) {
    case 'graduated':
      return sym.breaks.map((lower, i) => {
        const upper = sym.breaks[i + 1];
        const range =
          upper === undefined
            ? `${shortNumber(lower)}+`
            : `${shortNumber(lower)} to ${shortNumber(upper)}`;
        return { color: sym.colors[i], label: range };
      });
    case 'categorized':
      return sym.categories.map((c) => ({ color: c.color, label: String(c.value) }));
    case 'rules':
      return sym.rules.map((r) => ({ color: r.color, label: `${r.field} ${r.op} ${r.value}` }));
    case 'expression':
      return stopPositions().map((position) => ({
        color: rampColor(sym.ramp, position),
        label: shortNumber(spanAt(sym.domain, position)),
        ...(sym.sizes ? { radius: spanAt(sym.sizes, position) } : {}),
      }));
  }
}

/**
 * What a symbology classifies by, for labelling: a column name, an expression,
 * or nothing at all where rules read several columns.
 */
export function symbologyField(sym: Symbology): string | null {
  switch (sym.kind) {
    case 'rules':
      return null;
    case 'expression':
      return sym.expression;
    default:
      return sym.field;
  }
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
