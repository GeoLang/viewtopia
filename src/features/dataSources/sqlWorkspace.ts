/**
 * What the SQL workspace does with a query besides running it: draw the result,
 * attach a remote file as a table, print a value. The database tab and the
 * chat's sql actions both call these.
 */
import { queryAsGeoJson } from '../../duckdb';
import { attachCsvUrl, attachParquetUrl } from '../../duckdb/loaders';
import { useAgentLayerStore } from '../../store/agentLayers';

export const ATTACH_FORMATS = ['csv', 'parquet'] as const;
export type AttachFormat = (typeof ATTACH_FORMATS)[number];

/** How much of the query stands in for a layer name nobody gave. */
const QUERY_NAME_LENGTH = 40;
const QUERY_LAYER_COLOR = '#38bdf8';

/** One result value as the table cell and the chat both print it. */
export function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export interface QueryLayer {
  name: string;
  featureCount: number;
}

/** Draw a query's geometry as a layer, answering the layer it added. */
export async function addQueryLayer(sql: string, name?: string): Promise<QueryLayer> {
  const geojson = await queryAsGeoJson(sql);
  const layerName = name ?? sql.slice(0, QUERY_NAME_LENGTH);
  useAgentLayerStore.getState().addLayer({
    id: crypto.randomUUID(),
    name: layerName,
    color: QUERY_LAYER_COLOR,
    geojson,
  });
  return { name: layerName, featureCount: geojson.features.length };
}

/** The part of a URL before its query string, which is where the extension is. */
function urlPath(url: string): string {
  return url.split(/[?#]/)[0];
}

/** What a URL attaches as, read from its extension, or null for anything else. */
export function attachFormatOf(url: string): AttachFormat | null {
  const path = urlPath(url).toLowerCase();
  return ATTACH_FORMATS.find((format) => path.endsWith(`.${format}`)) ?? null;
}

/** A name DuckDB takes as a view identifier. */
function viewIdentifier(text: string): string {
  const cleaned = text
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || 'remote';
}

/**
 * Attach a remote CSV or Parquet file as a view, answering the name to query it
 * as. The format is read from the URL when the caller does not name one.
 */
export async function attachUrl(
  url: string,
  name?: string,
  format?: AttachFormat,
): Promise<string> {
  const reading = format ?? attachFormatOf(url);
  if (!reading) throw new Error('the URL has to end in .parquet or .csv');
  const fileStem = (urlPath(url).split('/').pop() ?? '').replace(/\.[^.]+$/, '');
  const view = viewIdentifier(name ?? fileStem);
  if (reading === 'parquet') await attachParquetUrl(view, url);
  else await attachCsvUrl(view, url);
  return view;
}
