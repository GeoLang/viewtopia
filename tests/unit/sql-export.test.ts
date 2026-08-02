// @vitest-environment node
import { mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as duckdb from '@duckdb/duckdb-wasm/blocking';
import { exportQuery, type ExportTarget } from '../../src/duckdb/exportFile';

/** COPY into the wasm filesystem and back out, against the real engine. */

const require = createRequire(import.meta.url);
let target: ExportTarget;
let db: duckdb.DuckDB;
const cwd = process.cwd();

beforeAll(async () => {
  process.chdir(mkdtempSync(join(tmpdir(), 'viewtopia-export-')));
  db = await duckdb.createDuckDB(
    {
      mvp: { mainModule: require.resolve('@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm') },
      eh: { mainModule: require.resolve('@duckdb/duckdb-wasm/dist/duckdb-eh.wasm') },
    },
    new duckdb.ConsoleLogger(duckdb.LogLevel.ERROR),
    duckdb.NODE_RUNTIME,
  );
  await db.instantiate(() => {});
  const conn = db.connect();
  conn.query("CREATE TABLE cities AS SELECT * FROM (VALUES (1, 'Lisbon'), (2, 'Porto')) t(id, name)");
  target = { db, conn };
}, 120_000);

afterAll(() => process.chdir(cwd));

describe('exportQuery', () => {
  it('writes CSV with a header row', async () => {
    const bytes = await exportQuery('SELECT * FROM cities ORDER BY id;', 'csv', target);
    expect(new TextDecoder().decode(bytes)).toBe('id,name\n1,Lisbon\n2,Porto\n');
  });

  it('writes a parquet file', async () => {
    const bytes = await exportQuery('SELECT * FROM cities', 'parquet', target);
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('PAR1');
    expect(new TextDecoder().decode(bytes.slice(-4))).toBe('PAR1');

    // readable again, so the bytes are a real parquet file and not just a header
    db.registerFileBuffer('roundtrip.parquet', Uint8Array.from(bytes));
    const rows = db.connect().query("SELECT name FROM read_parquet('roundtrip.parquet') ORDER BY id");
    expect(rows.toArray().map((r) => r.toJSON()['name'])).toEqual(['Lisbon', 'Porto']);
  });

  // the node runtime writes COPY output to the real filesystem, so the drop is
  // only observable through the call itself
  it('drops the temp file it copied from', async () => {
    const seen: string[] = [];
    const watched: ExportTarget = {
      conn: target.conn,
      db: {
        copyFileToBuffer: (name) => {
          seen.push(name);
          return db.copyFileToBuffer(name);
        },
        dropFile: (name) => {
          seen.push(name);
          return db.dropFile(name);
        },
      },
    };
    await exportQuery('SELECT 1 AS x', 'csv', watched);
    expect(seen[0]).toMatch(/^viewtopia-export-.*\.csv$/);
    expect(seen).toHaveLength(2);
    expect(seen[1]).toBe(seen[0]);
  });

  it('reports a bad query instead of writing a file', async () => {
    await expect(exportQuery('SELECT * FROM nope', 'csv', target)).rejects.toThrow(/nope/);
  });
});
