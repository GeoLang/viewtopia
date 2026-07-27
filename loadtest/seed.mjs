// Seed the fixtures the k6 scenarios measure against, and tear them down again.
//
//   node loadtest/seed.mjs                        # all depths + wide + external + tileset
//   node loadtest/seed.mjs --depths 100,1000      # nightly budget
//   node loadtest/seed.mjs --depths 10 --no-wide  # smoke
//   node loadtest/seed.mjs --teardown             # drop every loadtest-* fixture
//
// Talks to ptolemy and tiletopia through the nginx front (LOADTEST_BASE_URL,
// default http://localhost:5174) so the seeded state and the measured reads take
// the same path. Idempotent: a chain dataset already at the target depth is
// skipped, the wide dataset only gets the features it is missing, and a tileset
// asset that is already ready is left alone.
//
// Ptolemy has no DELETE /datasets route, so teardown goes through psql in the
// compose `db` container and leans on the schema's ON DELETE CASCADE. Without
// docker access it degrades to committing deletes, which empties the branches
// but leaves the datasets and every feature_versions row in place.

import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { platformAuthHeaders } from '../scripts/platform-token.mjs';
import {
  BUCKETS,
  CHAIN,
  DATASET_PREFIX,
  EXTERNAL,
  EXTERNAL_DATASET,
  EXTERNAL_TABLE,
  TILESET,
  TILESET_ASSET,
  WIDE,
  WIDE_DATASET,
  chainDataset,
  gridPoint,
} from './geo.js';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COMPOSE_FILE = resolve(REPO, 'docker-compose.platform.yml');
const BASE = (process.env.LOADTEST_BASE_URL ?? 'http://localhost:5174').replace(/\/$/, '');
const API = `${BASE}/api/v1`;
// nginx rewrites /tiles/<path> to tiletopia's /api/<path>
const TILES = `${BASE}/tiles/v1`;
// tiletopia scopes asset delete to the JWT `sub` that uploaded it, so every run
// has to present the same subject or teardown cannot reach its own fixture.
const AUTH = platformAuthHeaders({ role: 'editor', sub: 'loadtest' });

// One commit carries at most this many operations. Ptolemy applies operations
// one statement at a time inside the transaction, so a single 50k-op commit
// holds a write transaction open for minutes.
const OPS_PER_COMMIT = 2000;

// ─── CLI ────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = {
    depths: [100, 1000, 10000],
    wide: true,
    external: true,
    tileset: true,
    teardown: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--teardown') opts.teardown = true;
    else if (arg === '--no-wide') opts.wide = false;
    else if (arg === '--no-external') opts.external = false;
    else if (arg === '--no-tileset') opts.tileset = false;
    else if (arg === '--depths') {
      opts.depths = argv[++i]
        .split(',')
        .map((d) => Number(d.trim()))
        .filter((d) => Number.isInteger(d) && d > 0);
    } else throw new Error(`unknown argument ${arg}`);
  }
  if (!opts.depths.length && !opts.teardown) throw new Error('--depths parsed to nothing');
  return opts;
}

// ─── ptolemy API ────────────────────────────────────────────────────

async function api(path, init) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...AUTH, ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    throw new Error(`${init?.method ?? 'GET'} ${path} -> ${res.status}: ${await res.text()}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// Same idea for tiletopia, minus the JSON content type: its writes are multipart
// and fetch has to set the boundary itself.
async function tiles(path, init) {
  const res = await fetch(`${TILES}${path}`, {
    ...init,
    headers: { ...AUTH, ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${init?.method ?? 'GET'} /tiles/v1${path} -> ${res.status}: ${body}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function findDataset(name) {
  const datasets = await api('/datasets');
  return datasets.find((d) => d.name === name) ?? null;
}

async function ensureDataset(name, body) {
  const found = await findDataset(name);
  if (found) return found.id;
  const created = await api('/datasets', {
    method: 'POST',
    body: JSON.stringify({ name, srid: 4326, created_by: 'loadtest', ...body }),
  });
  return created.id;
}

async function ensureBranch(datasetId, name) {
  const branches = await api(`/datasets/${datasetId}/branches`);
  const found = branches.find((b) => b.name === name);
  if (found) return found.id;
  const created = await api(`/datasets/${datasetId}/branches`, {
    method: 'POST',
    body: JSON.stringify({ name, created_by: 'loadtest' }),
  });
  return created.id;
}

async function commit(branchId, message, operations) {
  await api(`/branches/${branchId}/commit`, {
    method: 'POST',
    body: JSON.stringify({ message, author: 'loadtest', operations }),
  });
}

async function featureCount(branchId) {
  const { count } = await api(`/branches/${branchId}/features/count`);
  return count;
}

// ─── WKB ────────────────────────────────────────────────────────────

// little-endian 2D point, the shape ptolemy's geometry_wkb_hex expects
function pointWkbHex(x, y) {
  const b = Buffer.alloc(21);
  b.writeUInt8(1, 0);
  b.writeUInt32LE(1, 1);
  b.writeDoubleLE(x, 5);
  b.writeDoubleLE(y, 13);
  return b.toString('hex');
}

function insertOp(grid, i) {
  const [lng, lat] = gridPoint(grid, i);
  return {
    type: 'insert',
    feature_id: randomUUID(),
    geometry_wkb_hex: pointWkbHex(lng, lat),
    properties: {
      idx: i,
      name: `feature-${i}`,
      bucket: String(i % BUCKETS),
      value: i * 1.5,
      lng,
      lat,
    },
  };
}

// ─── psql (teardown + the external table) ───────────────────────────

// psql inside the compose db container: the unix socket is trusted there, so
// this needs no password and never touches .env.platform.
function psql(sql) {
  return execFileSync(
    'docker',
    [
      'compose', '-f', COMPOSE_FILE, 'exec', '-T', 'db',
      'psql', '-U', 'ptolemy', '-d', 'ptolemy',
      '-v', 'ON_ERROR_STOP=1', '-qtA', '-c', sql,
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  ).trim();
}

function psqlAvailable() {
  try {
    return psql('select 1') === '1';
  } catch {
    return false;
  }
}

// ─── Chain datasets ─────────────────────────────────────────────────

// `depth` sequential changesets on main over a constant feature set. The commit
// counter rides in feature 0's properties, because GET /branches/{id}/history
// caps at 100 rows and so cannot report a depth past 100.
async function seedChain(depth) {
  const name = chainDataset(depth);
  const datasetId = await ensureDataset(name, { geometry_type: 'point' });
  const branchId = await ensureBranch(datasetId, 'main');

  const page = await api(`/branches/${branchId}/features?limit=${CHAIN.features}`);
  const anchor = page.features.find((f) => f.properties?.idx === 0);
  let done = anchor ? Number(anchor.properties.commits ?? 1) : 0;

  if (done >= depth) {
    console.log(`${name}: already at depth ${done}, skipping`);
    return { name, datasetId, branchId, depth: done, commits: 0 };
  }

  let anchorId = anchor?.id;
  if (!anchorId) {
    const ops = Array.from({ length: CHAIN.features }, (_, i) => insertOp(CHAIN, i));
    ops[0].properties.commits = 1;
    anchorId = ops[0].feature_id;
    await commit(branchId, `${name} base features`, ops);
    done = 1;
  }

  const [lng, lat] = gridPoint(CHAIN, 0);
  for (let n = done + 1; n <= depth; n++) {
    await commit(branchId, `${name} edit ${n}`, [
      {
        type: 'update',
        feature_id: anchorId,
        geometry_wkb_hex: pointWkbHex(lng, lat),
        properties: {
          idx: 0,
          name: 'feature-0',
          bucket: '0',
          value: n * 1.5,
          commits: n,
          lng,
          lat,
        },
      },
    ]);
    if (n % 500 === 0) console.log(`${name}: ${n}/${depth} commits`);
  }
  console.log(`${name}: depth ${depth} (${depth - done} new commits)`);
  return { name, datasetId, branchId, depth, commits: depth - done };
}

// ─── Wide dataset ───────────────────────────────────────────────────

async function seedWide() {
  const datasetId = await ensureDataset(WIDE_DATASET, { geometry_type: 'point' });
  const branchId = await ensureBranch(datasetId, 'main');
  const have = await featureCount(branchId);
  if (have >= WIDE.features) {
    console.log(`${WIDE_DATASET}: already holds ${have} features, skipping`);
    return { name: WIDE_DATASET, datasetId, branchId, features: have, inserted: 0 };
  }
  for (let i = have; i < WIDE.features; i += OPS_PER_COMMIT) {
    const end = Math.min(i + OPS_PER_COMMIT, WIDE.features);
    const ops = [];
    for (let j = i; j < end; j++) ops.push(insertOp(WIDE, j));
    await commit(branchId, `${WIDE_DATASET} ${i}-${end}`, ops);
    console.log(`${WIDE_DATASET}: ${end}/${WIDE.features} features`);
  }
  return {
    name: WIDE_DATASET,
    datasetId,
    branchId,
    features: WIDE.features,
    inserted: WIDE.features - have,
  };
}

// ─── External dataset ───────────────────────────────────────────────

// Registration probes the relation, so the table has to exist first. That needs
// SQL, which the HTTP API does not offer: without docker access this falls back
// to an ordinary versioned dataset so the scenario still has a target, and says
// so, because the two do not measure the same read path.
async function seedExternal() {
  const existing = await findDataset(EXTERNAL_DATASET);
  if (existing) {
    console.log(`${EXTERNAL_DATASET}: already registered, skipping`);
    return { name: EXTERNAL_DATASET, datasetId: existing.id, mode: 'existing' };
  }
  if (!psqlAvailable()) {
    console.log(
      `${EXTERNAL_DATASET}: no psql via compose, substituting a versioned dataset ` +
        '(external read path NOT measured)',
    );
    const datasetId = await ensureDataset(EXTERNAL_DATASET, { geometry_type: 'point' });
    const branchId = await ensureBranch(datasetId, 'main');
    const ops = Array.from({ length: CHAIN.features }, (_, i) => insertOp(EXTERNAL, i));
    await commit(branchId, `${EXTERNAL_DATASET} substitute`, ops);
    return { name: EXTERNAL_DATASET, datasetId, branchId, mode: 'substituted' };
  }

  psql(`CREATE TABLE IF NOT EXISTS ${EXTERNAL_TABLE} (
          gid serial PRIMARY KEY,
          name text,
          bucket text,
          value double precision,
          geom geometry(Point, 4326))`);
  const rows = Number(psql(`SELECT count(*) FROM ${EXTERNAL_TABLE}`));
  if (rows < EXTERNAL.features) {
    psql(`INSERT INTO ${EXTERNAL_TABLE} (name, bucket, value, geom)
          SELECT 'feature-' || i,
                 (i % ${BUCKETS})::text,
                 i * 1.5,
                 ST_SetSRID(ST_MakePoint(
                   ${EXTERNAL.cell} * (i % ${EXTERNAL.cols}) + ${gridPoint(EXTERNAL, 0)[0]},
                   ${EXTERNAL.cell} * (i / ${EXTERNAL.cols}) + ${gridPoint(EXTERNAL, 0)[1]}), 4326)
          FROM generate_series(${rows}, ${EXTERNAL.features - 1}) AS i`);
    psql(`CREATE INDEX IF NOT EXISTS ${EXTERNAL_TABLE}_geom_idx
          ON ${EXTERNAL_TABLE} USING gist (geom)`);
    psql(`ANALYZE ${EXTERNAL_TABLE}`);
  }
  const datasetId = await ensureDataset(EXTERNAL_DATASET, {
    external_table: `public.${EXTERNAL_TABLE}`,
    external_id_column: 'gid',
    external_geometry_column: 'geom',
  });
  console.log(`${EXTERNAL_DATASET}: registered over ${EXTERNAL_TABLE} (${EXTERNAL.features} rows)`);
  return { name: EXTERNAL_DATASET, datasetId, mode: 'external' };
}

// ─── tiletopia tileset ──────────────────────────────────────────────

// The job worker polls every 2s, and a 200-point cloud tiles in one pass, so this
// bound is generous. It exists so a wedged worker fails the seed instead of
// hanging CI until the job timeout.
const TILING_TIMEOUT_MS = 120_000;
const TILING_POLL_MS = 2000;

// ascii ply on the shared grid. A point cloud, because that is the one asset type
// tiletopia tiles on upload rather than waiting for a separate job request.
function plyFixture() {
  const lines = [
    'ply',
    'format ascii 1.0',
    `element vertex ${TILESET.features}`,
    'property float x',
    'property float y',
    'property float z',
    'end_header',
  ];
  for (let i = 0; i < TILESET.features; i++) {
    const [lng, lat] = gridPoint(TILESET, i);
    lines.push(`${lng} ${lat} ${10 + (i % 5)}`);
  }
  return lines.join('\n');
}

async function waitForTiling(id) {
  const deadline = Date.now() + TILING_TIMEOUT_MS;
  for (;;) {
    const asset = await tiles(`/assets/${id}`);
    if (asset.status === 'ready') return asset;
    if (asset.status === 'error') throw new Error(`${TILESET_ASSET}: tiling failed`);
    if (Date.now() >= deadline) {
      throw new Error(
        `${TILESET_ASSET}: still ${asset.status} after ${TILING_TIMEOUT_MS / 1000}s, ` +
          'the tiling worker is not draining its queue',
      );
    }
    await sleep(TILING_POLL_MS);
  }
}

// One asset under a fixed name, tiled and serving. Reruns keep the ready one and
// drop any leftovers, so an interrupted seed self-heals instead of leaving the
// scenario to pick between two assets with the same name.
async function seedTileset() {
  const mine = (await tiles('/assets')).filter((a) => a.name === TILESET_ASSET);
  const ready = mine.find((a) => a.status === 'ready');
  for (const a of mine) {
    if (a.id !== ready?.id) await tiles(`/assets/${a.id}`, { method: 'DELETE' });
  }
  if (ready) {
    console.log(`${TILESET_ASSET}: already ready (${ready.id}), skipping`);
    return { name: TILESET_ASSET, asset: ready.id, tileCount: ready.tile_count, uploaded: false };
  }

  const form = new FormData();
  form.append('name', TILESET_ASSET);
  form.append('file', new Blob([plyFixture()]), 'cloud.ply');
  const created = await tiles('/assets', { method: 'POST', body: form });
  const asset = await waitForTiling(created.id);
  console.log(`${TILESET_ASSET}: uploaded and tiled (${asset.id}, ${asset.tile_count} tiles)`);
  return { name: TILESET_ASSET, asset: asset.id, tileCount: asset.tile_count, uploaded: true };
}

async function teardownTileset() {
  const mine = (await tiles('/assets')).filter((a) => a.name === TILESET_ASSET);
  for (const a of mine) await tiles(`/assets/${a.id}`, { method: 'DELETE' });
  console.log(`${TILESET_ASSET}: deleted ${mine.length} asset(s)`);
  return { name: TILESET_ASSET, deleted: mine.length };
}

// ─── Teardown ───────────────────────────────────────────────────────

// Every statement is scoped to the loadtest- prefix. Nothing here may touch a
// dataset the harness did not create.
function hardTeardown() {
  const like = `${DATASET_PREFIX}%`;
  const before = Number(
    psql(`SELECT count(*) FROM feature_versions fv JOIN datasets d ON d.id = fv.dataset_id
          WHERE d.name LIKE '${like}'`),
  );
  const names = psql(`SELECT name FROM datasets WHERE name LIKE '${like}' ORDER BY name`);
  psql(`DELETE FROM datasets WHERE name LIKE '${like}'`);
  psql(`DROP TABLE IF EXISTS ${EXTERNAL_TABLE}`);
  const after = Number(
    psql(`SELECT count(*) FROM feature_versions fv JOIN datasets d ON d.id = fv.dataset_id
          WHERE d.name LIKE '${like}'`),
  );
  const orphans = Number(
    psql(`SELECT count(*) FROM feature_versions fv
          LEFT JOIN datasets d ON d.id = fv.dataset_id WHERE d.id IS NULL`),
  );
  console.log(`dropped: ${names ? names.split('\n').join(', ') : '(none)'}`);
  console.log(`feature_versions for loadtest datasets: ${before} -> ${after}`);
  console.log(`feature_versions with no dataset row (orphans, whole table): ${orphans}`);
  return { mode: 'hard', datasets: names ? names.split('\n') : [], before, after, orphans };
}

// No SQL: empty the branches through commits. The datasets survive and so does
// every feature_versions row, because a delete is another version, not a purge.
async function softTeardown() {
  const datasets = (await api('/datasets')).filter((d) => d.name.startsWith(DATASET_PREFIX));
  let emptied = 0;
  for (const d of datasets) {
    for (const b of await api(`/datasets/${d.id}/branches`)) {
      const page = await api(`/branches/${b.id}/features?limit=10000`);
      if (!page.features.length) continue;
      const ops = page.features.map((f) => ({ type: 'delete', feature_id: f.id }));
      await commit(b.id, `loadtest teardown ${d.name}`, ops);
      emptied += ops.length;
    }
  }
  console.log(
    `soft teardown: emptied ${emptied} features across ${datasets.length} datasets. ` +
      'The datasets and all feature_versions rows REMAIN: ptolemy has no dataset delete, ' +
      'and a delete op appends a version rather than reclaiming rows.',
  );
  return { mode: 'soft', datasets: datasets.map((d) => d.name), emptied };
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.teardown) {
    console.log(`tearing down loadtest fixtures via ${BASE}`);
    const datasets = psqlAvailable() ? hardTeardown() : await softTeardown();
    const tileset = await teardownTileset();
    console.log(JSON.stringify({ datasets, tileset }, null, 2));
    return;
  }

  console.log(`seeding loadtest fixtures into ${BASE}`);
  const chains = [];
  for (const depth of opts.depths) chains.push(await seedChain(depth));
  const wide = opts.wide ? await seedWide() : null;
  const external = opts.external ? await seedExternal() : null;
  const tileset = opts.tileset ? await seedTileset() : null;
  console.log(JSON.stringify({ chains, wide, external, tileset }, null, 2));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
