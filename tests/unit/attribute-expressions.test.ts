// @vitest-environment node
import { mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as duckdb from '@duckdb/duckdb-wasm/blocking';
import { evaluateFields, type AttributeTarget } from '../../src/features/attributes/expressions';

/**
 * The calculator and virtual fields against the real engine: the node-blocking
 * bundle stands in for the browser worker, so the SQL is the shipped one and
 * the type inference is what a user's layer really gets.
 */

const require = createRequire(import.meta.url);
let target: AttributeTarget;
let db: duckdb.DuckDB;
const cwd = process.cwd();

const point = (lon: number, properties: Record<string, unknown>): GeoJSON.Feature => ({
  type: 'Feature',
  properties,
  geometry: { type: 'Point', coordinates: [lon, 45] },
});

const collection = (features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({
  type: 'FeatureCollection',
  features,
});

const PARCELS = collection([
  point(7, { parcel: 'A-100', pop: 1200, area: 3 }),
  point(8, { parcel: 'B-200', pop: 400, area: 2 }),
  point(9, { parcel: 'C-300', pop: 900, area: 4 }),
]);

beforeAll(async () => {
  process.chdir(mkdtempSync(join(tmpdir(), 'viewtopia-attributes-')));
  db = await duckdb.createDuckDB(
    {
      mvp: { mainModule: require.resolve('@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm') },
      eh: { mainModule: require.resolve('@duckdb/duckdb-wasm/dist/duckdb-eh.wasm') },
    },
    new duckdb.ConsoleLogger(duckdb.LogLevel.ERROR),
    duckdb.NODE_RUNTIME,
  );
  await db.instantiate(() => {});
  target = { db, conn: db.connect() };
}, 120_000);

afterAll(() => process.chdir(cwd));

describe('evaluating field expressions', () => {
  it('computes one value per row, in row order', async () => {
    const values = await evaluateFields(
      PARCELS.features.map((f) => ({ ...f.properties })),
      [{ name: 'density', expression: 'pop / area' }],
      target,
    );
    expect(values.density).toEqual([400, 200, 225]);
  });

  it('runs several fields at once, over text as well as numbers', async () => {
    const values = await evaluateFields(
      PARCELS.features.map((f) => ({ ...f.properties })),
      [
        { name: 'zone', expression: "lower(split_part(parcel, '-', 1))" },
        { name: 'big', expression: 'pop > 1000' },
      ],
      target,
    );
    expect(values.zone).toEqual(['a', 'b', 'c']);
    expect(values.big).toEqual([true, false, false]);
  });

  it('hands integers back as numbers, not as BigInt the geojson cannot carry', async () => {
    const values = await evaluateFields(
      PARCELS.features.map((f) => ({ ...f.properties })),
      [{ name: 'doubled', expression: 'pop * 2' }],
      target,
    );
    expect(values.doubled).toEqual([2400, 800, 1800]);
    expect(() => JSON.stringify(values)).not.toThrow();
  });

  it('reports what the engine rejected instead of swallowing it', async () => {
    await expect(
      evaluateFields([{ pop: 1 }], [{ name: 'x', expression: 'nosuchcolumn + 1' }], target),
    ).rejects.toThrow(/nosuchcolumn/i);
  });

  it('leaves rows with a missing property null rather than failing them all', async () => {
    const values = await evaluateFields(
      [{ pop: 1 }, {}, { pop: 3 }],
      [{ name: 'x', expression: 'pop * 10' }],
      target,
    );
    expect(values.x).toEqual([10, null, 30]);
  });

  it('answers an empty layer without touching the engine', async () => {
    expect(await evaluateFields([], [{ name: 'x', expression: 'pop' }])).toEqual({ x: [] });
  });
});
