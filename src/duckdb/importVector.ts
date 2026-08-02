/**
 * Binary vector imports through the DuckDB spatial extension: GeoPackage,
 * Shapefile (loose or zipped), FlatGeobuf and GeoParquet, all read from
 * in-memory buffers so nothing leaves the browser.
 */
import { unzipSync } from 'fflate';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { getConnection, getDb } from './worker';

export interface ImportedLayer {
  name: string;
  geojson: FeatureCollection;
  tableName: string;
}

export interface ImportProblem {
  file: string;
  message: string;
  level: 'error' | 'warning';
}

export interface VectorImport {
  layers: ImportedLayer[];
  problems: ImportProblem[];
}

interface RowsLike {
  toArray(): { toJSON(): Record<string, unknown> }[];
}

interface DbLike {
  registerFileBuffer(name: string, buffer: Uint8Array): void | Promise<void>;
}

interface ConnLike {
  query(sql: string): RowsLike | Promise<RowsLike>;
}

/** DuckDB handles, injectable so tests can drive the node bundle directly. */
export interface VectorTarget {
  db: DbLike;
  conn: ConnLike;
}

interface SourceFile {
  name: string;
  bytes: Uint8Array;
}

interface ImportJob {
  source: SourceFile;
  sidecars: SourceFile[];
}

const SIDECAR_EXTS = ['dbf', 'shx', 'prj', 'cpg'];
const READER_EXTS = ['gpkg', 'shp', 'fgb', 'parquet', 'geoparquet'];
const GEOM_ALIAS = '__geom__';

function extOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

function stemOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? name : name.slice(0, dot);
}

function literal(value: string): string {
  return value.replace(/'/g, "''");
}

function ident(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function slug(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || 'layer';
}

async function rowsOf(target: VectorTarget, sql: string): Promise<Record<string, unknown>[]> {
  const result = await target.conn.query(sql);
  return result.toArray().map((row) => row.toJSON());
}

/** Zip entries join the pool as if they had been dropped alongside the zip. */
async function readSources(files: File[], problems: ImportProblem[]): Promise<SourceFile[]> {
  const sources: SourceFile[] = [];
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (extOf(file.name) !== 'zip') {
      sources.push({ name: file.name, bytes });
      continue;
    }
    let entries: Record<string, Uint8Array>;
    try {
      entries = unzipSync(bytes);
    } catch {
      problems.push({ file: file.name, message: 'not a readable zip', level: 'error' });
      continue;
    }
    for (const [path, entry] of Object.entries(entries)) {
      if (path.startsWith('__MACOSX/')) continue;
      const name = path.split('/').pop();
      if (name) sources.push({ name, bytes: entry });
    }
  }
  return sources;
}

function groupJobs(sources: SourceFile[], problems: ImportProblem[]): ImportJob[] {
  const shpStems = new Set(
    sources.filter((s) => extOf(s.name) === 'shp').map((s) => stemOf(s.name)),
  );
  const jobs: ImportJob[] = [];
  for (const source of sources) {
    const ext = extOf(source.name);
    if (READER_EXTS.includes(ext)) {
      const sidecars =
        ext === 'shp'
          ? sources.filter(
              (s) => s !== source && stemOf(s.name) === stemOf(source.name) && SIDECAR_EXTS.includes(extOf(s.name)),
            )
          : [];
      jobs.push({ source, sidecars });
    } else if (SIDECAR_EXTS.includes(ext)) {
      if (!shpStems.has(stemOf(source.name)))
        problems.push({ file: source.name, message: 'needs the matching .shp', level: 'error' });
    } else {
      problems.push({ file: source.name, message: `unsupported format: .${ext}`, level: 'error' });
    }
  }
  return jobs;
}

function readerSql(source: SourceFile, layer: string | null): string {
  const name = literal(source.name);
  const ext = extOf(source.name);
  if (ext === 'parquet' || ext === 'geoparquet') return `read_parquet('${name}')`;
  if (layer) return `ST_Read('${name}', layer='${literal(layer)}')`;
  return `ST_Read('${name}')`;
}

async function gpkgLayers(target: VectorTarget, source: SourceFile): Promise<(string | null)[]> {
  const rows = await rowsOf(
    target,
    `SELECT unnest(layers).name AS name FROM st_read_meta('${literal(source.name)}')`,
  );
  const names = rows.map((row) => row['name']).filter((n): n is string => typeof n === 'string');
  return names.length > 0 ? names : [null];
}

/** The reader reports its CRS in the column type, e.g. GEOMETRY('EPSG:3857'). */
function crsOf(columnType: string): string | null {
  return /^GEOMETRY\('([A-Za-z]+:\d+)'\)$/.exec(columnType)?.[1] ?? null;
}

function toFeatures(rows: Record<string, unknown>[]): Feature[] {
  const features: Feature[] = [];
  for (const row of rows) {
    const raw = row[GEOM_ALIAS];
    if (typeof raw !== 'string') continue;
    let geometry: Geometry;
    try {
      geometry = JSON.parse(raw) as Geometry;
    } catch {
      continue;
    }
    const properties: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      if (key === GEOM_ALIAS) continue;
      properties[key] = typeof value === 'bigint' ? Number(value) : value;
    }
    features.push({ type: 'Feature', geometry, properties });
  }
  return features;
}

async function readLayer(
  target: VectorTarget,
  source: SourceFile,
  layer: string | null,
): Promise<ImportedLayer> {
  const reader = readerSql(source, layer);
  const columns = await rowsOf(target, `DESCRIBE SELECT * FROM ${reader}`);
  const geomColumn = columns.find(
    (c) => typeof c['column_type'] === 'string' && c['column_type'].startsWith('GEOMETRY'),
  );
  const geomName = geomColumn?.['column_name'];
  if (typeof geomName !== 'string') throw new Error('no geometry column');

  const crs = crsOf(String(geomColumn?.['column_type']));
  const quoted = ident(geomName);
  // always_xy keeps EPSG:4326 output in lon/lat instead of PROJ's lat/lon
  const geomExpr =
    crs && crs !== 'EPSG:4326'
      ? `ST_Transform(${quoted}, '${literal(crs)}', 'EPSG:4326', always_xy := true)`
      : quoted;

  const rows = await rowsOf(
    target,
    `SELECT * EXCLUDE (${quoted}), ST_AsGeoJSON(${geomExpr}) AS ${GEOM_ALIAS} FROM ${reader} AS _t`,
  );
  const name = layer ?? source.name;
  const tableName = slug(name);
  await target.conn.query(`CREATE OR REPLACE TABLE ${ident(tableName)} AS SELECT * FROM ${reader}`);
  return {
    name,
    tableName,
    geojson: { type: 'FeatureCollection', features: toFeatures(rows) },
  };
}

async function runJob(
  target: VectorTarget,
  job: ImportJob,
  problems: ImportProblem[],
): Promise<ImportedLayer[]> {
  for (const file of [job.source, ...job.sidecars]) {
    await target.db.registerFileBuffer(file.name, file.bytes);
  }
  if (extOf(job.source.name) === 'shp' && !job.sidecars.some((s) => extOf(s.name) === 'dbf')) {
    problems.push({
      file: job.source.name,
      message: 'no .dbf alongside it, imported without attributes',
      level: 'warning',
    });
  }
  const layers =
    extOf(job.source.name) === 'gpkg' ? await gpkgLayers(target, job.source) : [null];
  const imported: ImportedLayer[] = [];
  for (const layer of layers) {
    imported.push(await readLayer(target, job.source, layer));
  }
  return imported;
}

/** Import binary vector files. One bad file is reported and the rest still import. */
export async function importVectorFiles(
  files: File[],
  target?: VectorTarget,
): Promise<VectorImport> {
  const problems: ImportProblem[] = [];
  const sources = await readSources(files, problems);
  const jobs = groupJobs(sources, problems);
  if (jobs.length === 0) return { layers: [], problems };

  const handle = target ?? { db: await getDb(), conn: await getConnection() };
  const layers: ImportedLayer[] = [];
  for (const job of jobs) {
    try {
      layers.push(...(await runJob(handle, job, problems)));
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'could not be read';
      problems.push({ file: job.source.name, message: reason, level: 'error' });
    }
  }
  return { layers, problems };
}
