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

/** where scripts/fetch-duckdb-extensions.mjs vendors the extension binaries.
 *  duckdb appends /<duckdb version>/<wasm platform>/<name>.duckdb_extension.wasm */
export const EXTENSION_REPOSITORY = '/duckdb-extensions';
const UPSTREAM_EXTENSION_REPOSITORY = 'https://extensions.duckdb.org';

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

/** Installs spatial from the vendored copy, falling back to duckdb's CDN for a
 *  deploy that skipped the fetch script. Both failing leaves non-spatial SQL working. */
export async function loadSpatial(conn: { query(sql: string): Promise<unknown> }): Promise<void> {
  const repositories = [
    new URL(EXTENSION_REPOSITORY, location.origin).href,
    UPSTREAM_EXTENSION_REPOSITORY,
  ];
  for (const repository of repositories) {
    try {
      await conn.query(`SET custom_extension_repository = '${repository}';`);
      await conn.query(`INSTALL spatial; LOAD spatial;`);
      // the setting outlives this call, and only spatial is vendored: leaving it
      // set sends every later autoload (json, parquet) to the app origin, which
      // answers with index.html and fails the signature check
      await conn.query(`RESET custom_extension_repository;`);
      return;
    } catch (err) {
      console.warn(`[duckdb] spatial extension failed to load from ${repository}`, err);
    }
  }
}

export async function getConnection(): Promise<duckdb.AsyncDuckDBConnection> {
  if (!connPromise) {
    connPromise = (async () => {
      const db = await getDb();
      const conn = await db.connect();
      await loadSpatial(conn);
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
