/**
 * What the attribute table shows and how it orders and summarizes it. The SQL
 * side (calculated fields, virtual fields, joins) is in expressions.ts.
 */
import type { AgentLayer } from '../../store/agentLayers';

/** The Cesium renderer names each agent layer's data source `agent-layer-<id>`. */
const DATA_SOURCE_PREFIX = 'agent-layer-';

/** The store id behind a viewer data source, or null for one nothing owns. */
export function agentLayerId(dataSourceName: string): string | null {
  return dataSourceName.startsWith(DATA_SOURCE_PREFIX)
    ? dataSourceName.slice(DATA_SOURCE_PREFIX.length)
    : null;
}

export type SortDir = 'asc' | 'desc';

export interface SortState {
  column: string;
  dir: SortDir;
}

/** Header clicks cycle a column asc, desc, then back to the layer's own order. */
export function nextSort(current: SortState | null, column: string): SortState | null {
  if (current?.column !== column) return { column, dir: 'asc' };
  return current.dir === 'asc' ? { column, dir: 'desc' } : null;
}

const isEmpty = (v: unknown) => v == null || v === '';

/** Numbers numerically, anything else as text, with empties always last. */
export function compareValues(a: unknown, b: unknown, dir: SortDir): number {
  if (isEmpty(a) || isEmpty(b)) return isEmpty(a) === isEmpty(b) ? 0 : isEmpty(a) ? 1 : -1;
  const na = Number(a);
  const nb = Number(b);
  const cmp =
    Number.isFinite(na) && Number.isFinite(nb) ? na - nb : String(a).localeCompare(String(b));
  return dir === 'desc' ? -cmp : cmp;
}

export function sortRows<T>(
  rows: T[],
  value: (row: T) => unknown,
  sort: SortState | null,
): T[] {
  if (!sort) return rows;
  return [...rows].sort((a, b) => compareValues(value(a), value(b), sort.dir));
}

/** Column names in first-seen order across the rows. */
export function attributeColumns(rows: Record<string, unknown>[]): string[] {
  const columns: string[] = [];
  for (const attrs of rows) {
    for (const key of Object.keys(attrs)) {
      if (!columns.includes(key)) columns.push(key);
    }
  }
  return columns;
}

export interface ColumnStats {
  /** values that are neither null nor empty */
  count: number;
  distinct: number;
  min: number | string | null;
  max: number | string | null;
  /** null unless every present value is a number */
  mean: number | null;
  median: number | null;
}

export function columnStats(values: unknown[]): ColumnStats {
  const present = values.filter((v) => !isEmpty(v));
  const distinct = new Set(present.map(String)).size;
  if (present.length === 0) {
    return { count: 0, distinct: 0, min: null, max: null, mean: null, median: null };
  }

  const nums = present.map(Number);
  if (!nums.every((n) => Number.isFinite(n))) {
    const text = present.map(String).sort((a, b) => a.localeCompare(b));
    return { count: present.length, distinct, min: text[0], max: text[text.length - 1], mean: null, median: null };
  }

  const sorted = [...nums].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return {
    count: present.length,
    distinct,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: nums.reduce((sum, n) => sum + n, 0) / nums.length,
    median: sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2,
  };
}

function featuresWithField(
  geojson: GeoJSON.FeatureCollection,
  name: string,
  values: unknown[],
): GeoJSON.FeatureCollection {
  return {
    ...geojson,
    features: geojson.features.map((feature, i) => ({
      ...feature,
      properties: { ...feature.properties, [name]: values[i] ?? null },
    })),
  };
}

/**
 * The layer with one computed value per feature written into its properties.
 * A styled layer keeps a pre-styling copy of the same features, so the field
 * has to land on both or clearing the symbology would drop it.
 */
export function layerWithField(
  layer: AgentLayer,
  name: string,
  values: unknown[],
): AgentLayer {
  return {
    ...layer,
    geojson: featuresWithField(layer.geojson, name, values),
    sourceGeojson: layer.sourceGeojson
      ? featuresWithField(layer.sourceGeojson, name, values)
      : undefined,
  };
}
