/**
 * Convert a loaded vector layer to a cloud-native format, in the browser.
 *
 * GeoParquet comes out of DuckDB spatial: a plain parquet COPY of a GEOMETRY
 * column writes the GeoParquet "geo" key (1.0.0, WKB, bbox, PROJJSON CRS).
 * FlatGeobuf cannot take that route, the GDAL write drivers in this
 * duckdb-wasm build abort the wasm instance rather than write a file, so it is
 * serialized by the flatgeobuf package instead.
 */
import { serialize as serializeFgb } from 'flatgeobuf/lib/mjs/geojson.js';
import { exportQuery, type ExportTarget } from '../../duckdb/exportFile';
import { getConnection, getDb } from '../../duckdb/worker';
import { geojsonToPmtiles } from '../pmtiles/writer';

export type ConvertFormat = 'geoparquet' | 'flatgeobuf' | 'pmtiles' | 'geojson';

export interface FormatSpec {
  id: ConvertFormat;
  label: string;
  extension: string;
  mimeType: string;
}

export const CONVERT_FORMATS: FormatSpec[] = [
  {
    id: 'geoparquet',
    label: 'GeoParquet',
    extension: 'parquet',
    mimeType: 'application/vnd.apache.parquet',
  },
  {
    id: 'flatgeobuf',
    label: 'FlatGeobuf',
    extension: 'fgb',
    mimeType: 'application/octet-stream',
  },
  { id: 'pmtiles', label: 'PMTiles', extension: 'pmtiles', mimeType: 'application/octet-stream' },
  { id: 'geojson', label: 'GeoJSON', extension: 'geojson', mimeType: 'application/geo+json' },
];

/** DuckDB handles, injectable so tests can drive the node bundle directly. */
export interface ConvertTarget extends ExportTarget {
  db: ExportTarget['db'] & { registerFileText(name: string, text: string): unknown };
}

/** ST_Read parses the registered GeoJSON, and the COPY carries its geometry. */
export async function geojsonToGeoParquet(
  geojson: GeoJSON.FeatureCollection,
  target?: ConvertTarget,
): Promise<Uint8Array> {
  const handle = target ?? {
    db: (await getDb()) as unknown as ConvertTarget['db'],
    conn: await getConnection(),
  };
  const name = `viewtopia-convert-${crypto.randomUUID()}.geojson`;
  await handle.db.registerFileText(name, JSON.stringify(geojson));
  try {
    return await exportQuery(`SELECT * FROM ST_Read('${name}')`, 'parquet', handle);
  } finally {
    await handle.db.dropFile(name);
  }
}

export function geojsonToFlatGeobuf(geojson: GeoJSON.FeatureCollection): Uint8Array {
  return serializeFgb(geojson, 4326);
}

export async function convertLayer(
  geojson: GeoJSON.FeatureCollection,
  layerName: string,
  format: ConvertFormat,
  target?: ConvertTarget,
): Promise<Uint8Array> {
  if (geojson.features.length === 0) throw new Error('the layer has no features to convert');
  switch (format) {
    case 'geoparquet':
      return geojsonToGeoParquet(geojson, target);
    case 'flatgeobuf':
      return geojsonToFlatGeobuf(geojson);
    case 'pmtiles':
      return geojsonToPmtiles(geojson, layerName);
    case 'geojson':
      return new TextEncoder().encode(JSON.stringify(geojson));
  }
}

/** A source name as a download-safe file stem, its extension dropped. */
export function fileNameSlug(name: string): string {
  const stem = name.toLowerCase().replace(/\.[a-z0-9]+$/, '');
  return stem.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'layer';
}

export function convertFileName(layerName: string, format: ConvertFormat): string {
  const spec = CONVERT_FORMATS.find((f) => f.id === format);
  if (!spec) throw new Error(`unknown format: ${format}`);
  return `${fileNameSlug(layerName)}.${spec.extension}`;
}
