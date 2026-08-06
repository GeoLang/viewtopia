/**
 * The attribute table's SQL side. A calculated or virtual field is one DuckDB
 * expression evaluated over the rows' property bags; an attribute join is a
 * LEFT JOIN between two layers' properties. No geometry goes through here: the
 * rows carry a row index and the caller puts the results back on its own
 * features, so a join can duplicate a feature per match without duckdb ever
 * parsing the shape.
 */
import { getConnection, getDb } from '../../duckdb/worker';

/** Row indexes carried through the SQL, overwriting any column of the same name. */
const ROW = '__vt_row';
const RIGHT_ROW = '__vt_rrow';

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

export interface AttributeJoin {
  left: GeoJSON.FeatureCollection;
  right: GeoJSON.FeatureCollection;
  leftKey: string;
  rightKey: string;
  /** Put in front of a joined column whose name the left side already uses. */
  prefix: string;
}

/**
 * The left layer's features carrying the matched right-hand properties. Keys
 * are compared as text, because the two sides' types are inferred separately
 * and a parcel id read as a number on one side and a string on the other is
 * the ordinary case.
 */
export async function joinLayers(
  join: AttributeJoin,
  target?: AttributeTarget,
): Promise<GeoJSON.FeatureCollection> {
  if (join.left.features.length === 0) throw new Error('the table layer has no features to join');
  if (join.right.features.length === 0) throw new Error('the join layer has no features');

  const handle = await handleFor(target);
  const leftTable = tableName();
  const rightTable = tableName();
  const leftFile = await registerRows(
    handle,
    leftTable,
    join.left.features.map((f, i) => ({ ...f.properties, [ROW]: i })),
  );
  const rightFile = await registerRows(
    handle,
    rightTable,
    join.right.features.map((f, i) => {
      const props = { ...f.properties };
      delete props[ROW];
      return { ...props, [RIGHT_ROW]: i };
    }),
  );

  try {
    // both indexes order the result, so a left feature with several matches
    // comes out in the join layer's own order rather than the engine's
    const matched = await queryRows(
      handle,
      `SELECT l.${quote(ROW)} AS ${quote(ROW)}, r.* EXCLUDE (${quote(RIGHT_ROW)})
         FROM ${quote(leftTable)} l
         LEFT JOIN ${quote(rightTable)} r
           ON CAST(l.${quote(join.leftKey)} AS VARCHAR) = CAST(r.${quote(join.rightKey)} AS VARCHAR)
        ORDER BY l.${quote(ROW)}, r.${quote(RIGHT_ROW)}`,
    );
    const features = matched.map((row) => {
      const source = join.left.features[Number(row[ROW])];
      const properties: Record<string, unknown> = { ...source.properties };
      for (const [key, value] of Object.entries(row)) {
        if (key === ROW) continue;
        properties[key in properties ? `${join.prefix}${key}` : key] = value;
      }
      return { ...source, properties };
    });
    return { type: 'FeatureCollection', features };
  } finally {
    await dropTable(handle, leftTable, leftFile);
    await dropTable(handle, rightTable, rightFile);
  }
}
