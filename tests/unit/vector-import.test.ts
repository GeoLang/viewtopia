// @vitest-environment node
import { mkdtempSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as duckdb from '@duckdb/duckdb-wasm/blocking';
import { importVectorFiles, type VectorTarget } from '../../src/duckdb/importVector';

/**
 * The real spatial extension over real files. Everything but the browser
 * worker is the shipped code: the node-blocking bundle is injected as the
 * target, so the SQL, the CRS handling and the grouping are the live ones.
 */

const require = createRequire(import.meta.url);
const fixtures = join(dirname(fileURLToPath(import.meta.url)), '../fixtures/vector');
const bytes = (name: string) => readFileSync(join(fixtures, name));
const load = (name: string, as = name) => new File([bytes(name)], as);

let target: VectorTarget;
let conn: duckdb.DuckDBConnection;
const cwd = process.cwd();

beforeAll(async () => {
  // GDAL writes index and aux files next to the process, keep them out of the repo
  process.chdir(mkdtempSync(join(tmpdir(), 'viewtopia-vector-')));
  const db = await duckdb.createDuckDB(
    {
      mvp: { mainModule: require.resolve('@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm') },
      eh: { mainModule: require.resolve('@duckdb/duckdb-wasm/dist/duckdb-eh.wasm') },
    },
    new duckdb.ConsoleLogger(duckdb.LogLevel.ERROR),
    duckdb.NODE_RUNTIME,
  );
  await db.instantiate(() => {});
  conn = db.connect();
  conn.query('INSTALL spatial; LOAD spatial;');
  target = { db, conn };
}, 120_000);

afterAll(() => process.chdir(cwd));

const count = (sql: string) => Number(conn.query(sql).toArray()[0].toJSON()['count_star()']);

describe('importVectorFiles', () => {
  it('reads every layer of a GeoPackage', async () => {
    const { layers, problems } = await importVectorFiles([load('places.gpkg')], target);
    expect(problems).toEqual([]);
    expect(layers.map((l) => l.name)).toEqual(['places', 'zones']);

    const places = layers[0];
    expect(places.geojson.features).toHaveLength(2);
    expect(places.geojson.features[0].properties?.['name']).toBe('alpha');
    expect(places.geojson.features[0].properties?.['pop']).toBe(10);
    expect(places.geojson.features[0].geometry).toEqual({
      type: 'Point',
      coordinates: [-9.13, 38.72],
    });
    expect(layers[1].geojson.features[0].geometry.type).toBe('Polygon');
  });

  it('leaves each imported layer queryable as a table', async () => {
    const { layers } = await importVectorFiles([load('places.gpkg')], target);
    expect(layers.map((l) => l.tableName)).toEqual(['places', 'zones']);
    expect(count('SELECT count(*) FROM "places"')).toBe(2);
    expect(count('SELECT count(*) FROM "zones"')).toBe(1);
  });

  it('groups a shapefile with its sidecars', async () => {
    const files = ['probe.shp', 'probe.dbf', 'probe.shx', 'probe.prj', 'probe.cpg'].map((n) =>
      load(n),
    );
    const { layers, problems } = await importVectorFiles(files, target);
    expect(problems).toEqual([]);
    expect(layers).toHaveLength(1);
    expect(layers[0].name).toBe('probe.shp');
    expect(layers[0].tableName).toBe('probe_shp');
    expect(layers[0].geojson.features).toHaveLength(1);
    expect(layers[0].geojson.features[0].properties?.['name']).toBe('Lisbon');
    expect(layers[0].geojson.features[0].geometry.type).toBe('Polygon');
  });

  it('warns and imports geometry only when the .dbf is missing', async () => {
    // its own stem, so the .dbf registered by the test above is not picked up
    const files = ['shp', 'shx', 'prj'].map((ext) => load(`probe.${ext}`, `nodbf.${ext}`));
    const { layers, problems } = await importVectorFiles(files, target);
    expect(problems).toEqual([
      {
        file: 'nodbf.shp',
        message: 'no .dbf alongside it, imported without attributes',
        level: 'warning',
      },
    ]);
    expect(layers[0].geojson.features).toHaveLength(1);
    expect(layers[0].geojson.features[0].properties?.['name']).toBeUndefined();
    expect(layers[0].geojson.features[0].geometry.type).toBe('Polygon');
  });

  it('unpacks a zipped shapefile', async () => {
    const { layers, problems } = await importVectorFiles([load('probe-shp.zip')], target);
    expect(problems).toEqual([]);
    expect(layers).toHaveLength(1);
    expect(layers[0].name).toBe('probe.shp');
    expect(layers[0].geojson.features[0].properties?.['name']).toBe('Lisbon');
  });

  it('reads FlatGeobuf', async () => {
    const { layers, problems } = await importVectorFiles([load('probe.fgb')], target);
    expect(problems).toEqual([]);
    expect(layers[0].name).toBe('probe.fgb');
    expect(layers[0].geojson.features).toHaveLength(1);
    expect(layers[0].geojson.features[0].properties?.['display_name']).toBe('Lisbon, Portugal');
    expect(layers[0].geojson.features[0].geometry.type).toBe('Polygon');
  });

  it('reads GeoParquet', async () => {
    const { layers, problems } = await importVectorFiles([load('probe.parquet')], target);
    expect(problems).toEqual([]);
    expect(layers[0].tableName).toBe('probe_parquet');
    expect(layers[0].geojson.features).toHaveLength(1);
    expect(layers[0].geojson.features[0].properties?.['name']).toBe('Lisbon');
    expect(layers[0].geojson.features[0].geometry.type).toBe('Polygon');
  });

  it('reprojects a non-4326 source to lon/lat', async () => {
    const { layers } = await importVectorFiles([load('webmercator.fgb')], target);
    const geometry = layers[0].geojson.features[0].geometry;
    if (geometry.type !== 'Point') throw new Error('expected a point');
    const [lon, lat] = geometry.coordinates;
    expect(lon).toBeCloseTo(-9.13, 6);
    expect(lat).toBeCloseTo(38.72, 6);
  });

  it('escapes quotes in file names instead of running them', async () => {
    conn.query('CREATE OR REPLACE TABLE canary AS SELECT 1 AS x');
    const evil = "evil'; DROP TABLE canary; --.fgb";
    const { layers, problems } = await importVectorFiles([load('probe.fgb', evil)], target);
    expect(problems).toEqual([]);
    expect(layers[0].name).toBe(evil);
    expect(layers[0].geojson.features).toHaveLength(1);
    expect(count('SELECT count(*) FROM canary')).toBe(1);
  });

  it('reports an unreadable file without dropping the rest of the batch', async () => {
    const broken = new File([new Uint8Array([1, 2, 3, 4])], 'broken.fgb');
    const { layers, problems } = await importVectorFiles([broken, load('probe.fgb')], target);
    expect(layers.map((l) => l.name)).toEqual(['probe.fgb']);
    expect(problems).toHaveLength(1);
    expect(problems[0].file).toBe('broken.fgb');
    expect(problems[0].level).toBe('error');
  });

  it('flags a sidecar dropped without its shapefile', async () => {
    const { layers, problems } = await importVectorFiles([load('probe.dbf')], target);
    expect(layers).toEqual([]);
    expect(problems).toEqual([
      { file: 'probe.dbf', message: 'needs the matching .shp', level: 'error' },
    ]);
  });
});
