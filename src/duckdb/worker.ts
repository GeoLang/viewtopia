import * as duckdb from '@duckdb/duckdb-wasm';

let dbPromise: Promise<duckdb.AsyncDuckDB> | null = null;
let connPromise: Promise<duckdb.AsyncDuckDBConnection> | null = null;

async function init(): Promise<duckdb.AsyncDuckDB> {
  const bundles = duckdb.getJsDelivrBundles();
  const bundle = await duckdb.selectBundle(bundles);

  const workerUrl = URL.createObjectURL(
    new Blob([`importScripts("${bundle.mainWorker!}");`], { type: 'text/javascript' }),
  );
  const worker = new Worker(workerUrl);
  const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
  const db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  URL.revokeObjectURL(workerUrl);
  return db;
}

export function getDb(): Promise<duckdb.AsyncDuckDB> {
  if (!dbPromise) dbPromise = init();
  return dbPromise;
}

export async function getConnection(): Promise<duckdb.AsyncDuckDBConnection> {
  if (!connPromise) {
    connPromise = (async () => {
      const db = await getDb();
      const conn = await db.connect();
      try {
        await conn.query(`INSTALL spatial; LOAD spatial;`);
      } catch (err) {
        console.warn('[duckdb] spatial extension failed to load', err);
      }
      return conn;
    })();
  }
  return connPromise;
}

export async function close(): Promise<void> {
  if (connPromise) {
    const conn = await connPromise;
    await conn.close();
    connPromise = null;
  }
  if (dbPromise) {
    const db = await dbPromise;
    await db.terminate();
    dbPromise = null;
  }
}
