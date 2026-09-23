import { getConnection } from './worker';

export async function attachParquetUrl(name: string, url: string): Promise<void> {
  const conn = await getConnection();
  await conn.query(`CREATE OR REPLACE VIEW "${name}" AS SELECT * FROM read_parquet('${url}');`);
}

export async function attachCsvUrl(name: string, url: string): Promise<void> {
  const conn = await getConnection();
  await conn.query(`CREATE OR REPLACE VIEW "${name}" AS SELECT * FROM read_csv_auto('${url}');`);
}
