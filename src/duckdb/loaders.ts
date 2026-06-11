import { getDb, getConnection } from './worker';

export async function registerGeoJson(name: string, geojson: unknown): Promise<void> {
  const db = await getDb();
  const conn = await getConnection();
  const json = JSON.stringify(geojson);
  const fname = `${name}.geojson`;
  await db.registerFileText(fname, json);
  await conn.query(`CREATE OR REPLACE TABLE "${name}" AS SELECT * FROM ST_Read('${fname}');`);
}

export async function attachParquetUrl(name: string, url: string): Promise<void> {
  const conn = await getConnection();
  await conn.query(`CREATE OR REPLACE VIEW "${name}" AS SELECT * FROM read_parquet('${url}');`);
}

export async function attachCsvUrl(name: string, url: string): Promise<void> {
  const conn = await getConnection();
  await conn.query(`CREATE OR REPLACE VIEW "${name}" AS SELECT * FROM read_csv_auto('${url}');`);
}
