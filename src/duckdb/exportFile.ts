import { getConnection, getDb } from './worker';

export type ExportFormat = 'csv' | 'parquet';

interface DbLike {
  copyFileToBuffer(name: string): Uint8Array | Promise<Uint8Array>;
  dropFile(name: string): unknown;
}

interface ConnLike {
  query(sql: string): unknown;
}

/** DuckDB handles, injectable so tests can drive the node bundle directly. */
export interface ExportTarget {
  db: DbLike;
  conn: ConnLike;
}

const COPY_OPTIONS: Record<ExportFormat, string> = {
  csv: '(HEADER)',
  parquet: '(FORMAT PARQUET)',
};

/** COPY the query into the wasm filesystem, then hand back the bytes. */
export async function exportQuery(
  sql: string,
  format: ExportFormat,
  target?: ExportTarget,
): Promise<Uint8Array> {
  const handle = target ?? { db: await getDb(), conn: await getConnection() };
  const body = sql.trim().replace(/;+\s*$/, '');
  const name = `viewtopia-export-${crypto.randomUUID()}.${format}`;
  await handle.conn.query(`COPY (${body}) TO '${name}' ${COPY_OPTIONS[format]}`);
  try {
    return await handle.db.copyFileToBuffer(name);
  } finally {
    await handle.db.dropFile(name);
  }
}
