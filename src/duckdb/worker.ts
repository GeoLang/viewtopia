import * as duckdb from '@duckdb/duckdb-wasm';
import mvpModule from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import mvpWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import ehModule from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import ehWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';

/** app-origin assets rather than duckdb's getJsDelivrBundles(), so SQL works with no CDN */
export const BUNDLES: duckdb.DuckDBBundles = {
  mvp: { mainModule: mvpModule, mainWorker: mvpWorker },
  eh: { mainModule: ehModule, mainWorker: ehWorker },
};

let dbPromise: Promise<duckdb.AsyncDuckDB> | null = null;
let connPromise: Promise<duckdb.AsyncDuckDBConnection> | null = null;

async function init(): Promise<duckdb.AsyncDuckDB> {
  const bundle = await duckdb.selectBundle(BUNDLES);

  const worker = new Worker(bundle.mainWorker!);
  const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
  const db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
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
