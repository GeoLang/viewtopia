// @vitest-environment node
import { mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as duckdb from '@duckdb/duckdb-wasm/blocking';
import {
  convertFileName,
  convertLayer,
  geojsonToFlatGeobuf,
  geojsonToGeoParquet,
  type ConvertTarget,
} from '../../src/features/convert/formats';

/**
 * The write paths against the real engine: the node-blocking bundle stands in
 * for the browser worker, so the SQL and the spatial extension are the shipped
 * ones. What the two binary formats have to prove is that the geometry is in
 * the output as geometry, not that a file appeared.
 */

const require = createRequire(import.meta.url);
let target: ConvertTarget;
let db: duckdb.DuckDB;
let conn: duckdb.DuckDBConnection;
const cwd = process.cwd();

const FC: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { name: 'Lisbon', pop: 5 },
      geometry: { type: 'Point', coordinates: [-9.13, 38.72] },
    },
    {
      type: 'Feature',
      properties: { name: 'Turin', pop: 3 },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [7, 45],
            [7.1, 45],
            [7.1, 45.1],
            [7, 45],
          ],
        ],
      },
    },
  ],
};

beforeAll(async () => {
  // GDAL writes index and aux files next to the process, keep them out of the repo
  process.chdir(mkdtempSync(join(tmpdir(), 'viewtopia-convert-')));
  db = await duckdb.createDuckDB(
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

const rows = (sql: string) => conn.query(sql).toArray().map((r) => r.toJSON());

describe('GeoParquet', () => {
  it('writes parquet carrying the GeoParquet "geo" metadata', async () => {
    const bytes = await geojsonToGeoParquet(FC, target);
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('PAR1');

    db.registerFileBuffer('geo.parquet', Uint8Array.from(bytes));
    const kv = rows("SELECT key::VARCHAR AS k, value::VARCHAR AS v FROM parquet_kv_metadata('geo.parquet')");
    const geo = kv.find((row) => row.k === 'geo');
    if (!geo) throw new Error(`no geo metadata, only: ${kv.map((row) => row.k).join(', ')}`);
    // the value is stored as a blob, so its JSON arrives with \x22 for a quote
    const meta = JSON.parse(String(geo.v).replace(/\\x22/g, '"')) as {
      version: string;
      primary_column: string;
      columns: Record<string, { encoding: string; bbox: number[] }>;
    };
    expect(meta.version).toMatch(/^1\./);
    expect(meta.columns[meta.primary_column].encoding).toBe('WKB');
    expect(meta.columns[meta.primary_column].bbox).toEqual([-9.13, 38.72, 7.1, 45.1]);
  });

  it('reads back as geometry, not as an opaque blob', async () => {
    const bytes = await geojsonToGeoParquet(FC, target);
    db.registerFileBuffer('roundtrip.parquet', Uint8Array.from(bytes));
    const back = rows(
      "SELECT name, pop, typeof(geom) AS ty, ST_AsText(geom) AS wkt FROM read_parquet('roundtrip.parquet') ORDER BY name",
    );
    expect(back.map((r) => r.name)).toEqual(['Lisbon', 'Turin']);
    expect(back[0].ty).toBe("GEOMETRY('EPSG:4326')");
    expect(back[0].wkt).toBe('POINT (-9.13 38.72)');
    expect(back[1].wkt).toBe('POLYGON ((7 45, 7.1 45, 7.1 45.1, 7 45))');
    expect(back[1].pop).toBe(3);
  });

  it('drops the GeoJSON it registered to convert from', async () => {
    const registered: string[] = [];
    const watched: ConvertTarget = {
      conn: target.conn,
      db: {
        registerFileText: (name, text) => {
          registered.push(name);
          return db.registerFileText(name, text);
        },
        copyFileToBuffer: (name) => db.copyFileToBuffer(name),
        dropFile: (name) => {
          registered.push(name);
          return db.dropFile(name);
        },
      },
    };
    await geojsonToGeoParquet(FC, watched);
    // the parquet drop is exportQuery's, so only the source pair is seen here
    expect(registered[0]).toMatch(/^viewtopia-convert-.*\.geojson$/);
    expect(registered.filter((n) => n === registered[0])).toHaveLength(2);
  });
});

describe('FlatGeobuf', () => {
  it('writes an fgb that GDAL reads back with its CRS and attributes', () => {
    const bytes = geojsonToFlatGeobuf(FC);
    expect(new TextDecoder().decode(bytes.slice(0, 3))).toBe('fgb');

    db.registerFileBuffer('out.fgb', bytes);
    const back = rows(
      "SELECT name, pop, typeof(geom) AS ty, ST_AsText(geom) AS wkt FROM ST_Read('out.fgb') ORDER BY name",
    );
    expect(back.map((r) => r.name)).toEqual(['Lisbon', 'Turin']);
    expect(back[0].ty).toBe("GEOMETRY('EPSG:4326')");
    expect(back[0].wkt).toBe('POINT (-9.13 38.72)');
    expect(back[1].wkt).toBe('POLYGON ((7 45, 7.1 45, 7.1 45.1, 7 45))');
    expect(back[1].pop).toBe(3);
  });
});

describe('convertLayer', () => {
  it('writes each format from the same layer', async () => {
    const pmtiles = await convertLayer(FC, 'Places', 'pmtiles', target);
    expect(new TextDecoder().decode(pmtiles.slice(0, 7))).toBe('PMTiles');

    const geojson = await convertLayer(FC, 'Places', 'geojson', target);
    expect(JSON.parse(new TextDecoder().decode(geojson))).toEqual(FC);

    const fgb = await convertLayer(FC, 'Places', 'flatgeobuf', target);
    expect(new TextDecoder().decode(fgb.slice(0, 3))).toBe('fgb');

    const parquet = await convertLayer(FC, 'Places', 'geoparquet', target);
    expect(new TextDecoder().decode(parquet.slice(0, 4))).toBe('PAR1');
  });

  it('refuses an empty layer instead of writing an empty file', async () => {
    const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
    await expect(convertLayer(empty, 'Places', 'geoparquet', target)).rejects.toThrow(/no features/);
  });
});

describe('convertFileName', () => {
  it('names the download after the layer and the format', () => {
    expect(convertFileName('parcels.geojson', 'geoparquet')).toBe('parcels.parquet');
    expect(convertFileName('Drawn features (3)', 'flatgeobuf')).toBe('drawn-features-3.fgb');
    expect(convertFileName('***', 'pmtiles')).toBe('layer.pmtiles');
  });
});
