// Vendor the DuckDB spatial extension under public/ so `INSTALL spatial` in
// src/duckdb/worker.ts resolves from the app origin and never reaches
// extensions.duckdb.org.
//
// The directory a browser asks for is the DuckDB version compiled into the wasm
// binary, not the @duckdb/duckdb-wasm npm version, so this reads it out of the
// installed binary. Re-run after bumping the dependency.

import { createRequire } from 'node:module';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESTINATION = join(REPO, 'public', 'duckdb-extensions');
const UPSTREAM_REPOSITORY = 'https://extensions.duckdb.org';
const EXTENSIONS = ['spatial'];

// the bundles src/duckdb/worker.ts ships, and the platform name each one puts
// in its extension urls
const PLATFORM_BY_BUNDLE = { mvp: 'wasm_mvp', eh: 'wasm_eh' };

const WASM_MAGIC = Buffer.from([0x00, 0x61, 0x73, 0x6d]);

const require = createRequire(import.meta.url);

async function pinnedDuckdbVersion() {
  // mvp rather than eh: outside a browser there is no WebAssembly.Tag import to
  // satisfy, so the eh module refuses to instantiate.
  const duckdb = require('@duckdb/duckdb-wasm/blocking');
  const bundles = {
    mvp: { mainModule: require.resolve('@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm'), mainWorker: null },
  };
  const db = await duckdb.createDuckDB(bundles, new duckdb.VoidLogger(), duckdb.NODE_RUNTIME);
  await db.instantiate(() => {});
  db.open({ path: ':memory:' });
  const connection = db.connect();
  const version = String(connection.query('SELECT version() AS version').toArray()[0].version);
  connection.close();
  return version;
}

async function alreadyFetched(path) {
  try {
    const head = await readFile(path);
    return head.subarray(0, WASM_MAGIC.length).equals(WASM_MAGIC);
  } catch {
    return false;
  }
}

async function fetchExtension(url, path) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  const body = Buffer.from(await response.arrayBuffer());
  if (!body.subarray(0, WASM_MAGIC.length).equals(WASM_MAGIC)) {
    throw new Error(`${url} is not a WebAssembly module`);
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, body);
  return body.length;
}

async function dropOtherVersions(keep) {
  const entries = await readdir(DESTINATION).catch(() => []);
  for (const entry of entries) {
    if (entry !== keep) await rm(join(DESTINATION, entry), { recursive: true, force: true });
  }
}

const version = await pinnedDuckdbVersion();
await dropOtherVersions(version);

for (const platform of Object.values(PLATFORM_BY_BUNDLE)) {
  for (const extension of EXTENSIONS) {
    const file = `${extension}.duckdb_extension.wasm`;
    const path = join(DESTINATION, version, platform, file);
    if (await alreadyFetched(path)) {
      console.log(`have ${version}/${platform}/${file}`);
      continue;
    }
    const url = `${UPSTREAM_REPOSITORY}/${version}/${platform}/${file}`;
    const bytes = await fetchExtension(url, path);
    console.log(`fetched ${version}/${platform}/${file} (${(bytes / 1e6).toFixed(1)} MB)`);
  }
}
