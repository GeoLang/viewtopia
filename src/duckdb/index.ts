import type { Table } from 'apache-arrow';
import { getConnection, close as closeInternal } from './worker';

export { getDb, getConnection } from './worker';
export { queryAsGeoJson } from './spatial';

export interface QueryResult {
  rows: Record<string, unknown>[];
  columns: string[];
  rowCount: number;
  table: Table;
}

export async function query(sql: string): Promise<QueryResult> {
  const conn = await getConnection();
  const table = await conn.query(sql);
  const rows = table.toArray().map((r) => r.toJSON() as Record<string, unknown>);
  const columns = table.schema.fields.map((f) => f.name);
  return { rows, columns, rowCount: rows.length, table: table as unknown as Table };
}

export async function exec(sql: string): Promise<void> {
  const conn = await getConnection();
  await conn.query(sql);
}

export async function close(): Promise<void> {
  return closeInternal();
}

export async function queryRows(sql: string): Promise<unknown[]> {
  const result = await query(sql);
  return result.rows;
}
