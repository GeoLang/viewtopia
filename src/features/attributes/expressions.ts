/**
 * The attribute table's SQL side. A calculated or virtual field is one DuckDB
 * expression evaluated over the rows' property bags. No geometry goes through
 * here: the rows carry a row index and the caller puts the results back on its
 * own features.
 */
import { getConnection, getDb } from '../../duckdb/worker';

/** Row index carried through the SQL, overwriting any column of the same name. */
const ROW = '__vt_row';

export interface VirtualField {
  name: string;
  expression: string;
}

interface DbLike {
  registerFileText(name: string, text: string): unknown;
  dropFile(name: string): unknown;
}

interface ConnLike {
  query(sql: string): unknown;
}

/** DuckDB handles, injectable so tests can drive the node bundle directly. */
export interface AttributeTarget {
  db: DbLike;
  conn: ConnLike;
}

const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;

const tableName = () => `vt_attr_${crypto.randomUUID().replace(/-/g, '')}`;

/** arrow hands integers back as BigInt, which JSON.stringify refuses */
const plain = (v: unknown) => (typeof v === 'bigint' ? Number(v) : v);

async function handleFor(target?: AttributeTarget): Promise<AttributeTarget> {
  return target ?? { db: await getDb(), conn: await getConnection() };
}

async function queryRows(
  target: AttributeTarget,
  sql: string,
): Promise<Record<string, unknown>[]> {
  const table = (await target.conn.query(sql)) as {
    toArray(): { toJSON(): Record<string, unknown> }[];
  };
  return table.toArray().map((row) => {
    const json = row.toJSON();
    return Object.fromEntries(Object.entries(json).map(([k, v]) => [k, plain(v)]));
  });
}

async function registerRows(
  target: AttributeTarget,
  table: string,
  records: Record<string, unknown>[],
): Promise<string> {
  const file = `${table}.json`;
  await target.db.registerFileText(file, JSON.stringify(records));
  await target.conn.query(
    `CREATE OR REPLACE TABLE ${quote(table)} AS SELECT * FROM read_json_auto('${file}', sample_size=-1)`,
  );
  return file;
}

async function dropTable(target: AttributeTarget, table: string, file: string): Promise<void> {
  await target.conn.query(`DROP TABLE IF EXISTS ${quote(table)}`);
  await target.db.dropFile(file);
}

/**
 * One value per row for each field, in row order. The expressions run in a
 * single query, so a bad one fails them all with the binder's message.
 */
export async function evaluateFields(
  attrs: Record<string, unknown>[],
  fields: VirtualField[],
  target?: AttributeTarget,
): Promise<Record<string, unknown[]>> {
  const empty = Object.fromEntries(fields.map((f) => [f.name, [] as unknown[]]));
  if (fields.length === 0 || attrs.length === 0) return empty;

  const handle = await handleFor(target);
  const table = tableName();
  const file = await registerRows(
    handle,
    table,
    attrs.map((a, i) => ({ ...a, [ROW]: i })),
  );
  try {
    const selected = fields.map((f, i) => `(${f.expression}) AS "c${i}"`).join(', ');
    const rows = await queryRows(
      handle,
      `SELECT ${selected} FROM ${quote(table)} ORDER BY ${quote(ROW)}`,
    );
    return Object.fromEntries(fields.map((f, i) => [f.name, rows.map((r) => r[`c${i}`])]));
  } finally {
    await dropTable(handle, table, file);
  }
}
