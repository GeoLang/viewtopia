// Seed a demo real-estate dataset into ptolemy so the real-estate vertical is
// demonstrable end to end: ~10 Monaco-area parcel polygons + ~15 point sales.
//
// Talks directly to ptolemy (default http://localhost:3000). Override with
// PTOLEMY_URL. Idempotent: skips a dataset/branch that already holds features.
//
//   node scripts/seed-parcels.mjs

import { randomUUID } from 'node:crypto';
import { platformAuthHeaders } from './platform-token.mjs';

const BASE = (process.env.PTOLEMY_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const API = `${BASE}/api/v1`;
// seeding writes, so it needs an editor token when the stack enforces auth
const AUTH = platformAuthHeaders({ role: 'editor', sub: 'seed-parcels' });

async function api(path, init) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...AUTH, ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${init?.method ?? 'GET'} ${path} -> ${res.status}: ${body}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ─── WKB encoders (little-endian, 2D, no SRID) ──────────────────────

function pointWkbHex(x, y) {
  const b = Buffer.alloc(21);
  b.writeUInt8(1, 0);
  b.writeUInt32LE(1, 1);
  b.writeDoubleLE(x, 5);
  b.writeDoubleLE(y, 13);
  return b.toString('hex');
}

function polygonWkbHex(ring) {
  const parts = [Buffer.from([1])];
  const type = Buffer.alloc(4);
  type.writeUInt32LE(3, 0);
  parts.push(type);
  const nRings = Buffer.alloc(4);
  nRings.writeUInt32LE(1, 0);
  parts.push(nRings);
  const nPts = Buffer.alloc(4);
  nPts.writeUInt32LE(ring.length, 0);
  parts.push(nPts);
  for (const [x, y] of ring) {
    const p = Buffer.alloc(16);
    p.writeDoubleLE(x, 0);
    p.writeDoubleLE(y, 8);
    parts.push(p);
  }
  return Buffer.concat(parts).toString('hex');
}

// ─── ptolemy helpers ────────────────────────────────────────────────

async function ensureDataset(name, geometryType) {
  const datasets = await api('/datasets');
  const found = datasets.find((d) => d.name === name);
  if (found) return found.id;
  const created = await api('/datasets', {
    method: 'POST',
    body: JSON.stringify({ name, geometry_type: geometryType, srid: 4326, created_by: 'seed' }),
  });
  return created.id;
}

async function ensureBranch(datasetId, name) {
  const branches = await api(`/datasets/${datasetId}/branches`);
  const found = branches.find((b) => b.name === name);
  if (found) return found.id;
  const created = await api(`/datasets/${datasetId}/branches`, {
    method: 'POST',
    body: JSON.stringify({ name, created_by: 'seed' }),
  });
  return created.id;
}

async function existingKeys(branchId, keyProp) {
  const data = await api(`/branches/${branchId}/features`);
  return new Set(
    data.features.map((f) => f.properties?.[keyProp]).filter((k) => k != null),
  );
}

async function commit(branchId, message, operations) {
  await api(`/branches/${branchId}/commit`, {
    method: 'POST',
    body: JSON.stringify({ message, author: 'seed', operations }),
  });
}

// ─── Demo data ──────────────────────────────────────────────────────

const ORIGIN_LNG = 7.42;
const ORIGIN_LAT = 43.734;
const CELL = 0.0009; // ~70m, parcels in a row share an edge so merges are contiguous

const ZONINGS = ['R-1', 'R-2', 'R-3', 'C-1', 'C-2'];
const OWNERS = ['Grimaldi Holdings', 'Monte Carlo SCI', 'Port Hercule Ltd', 'Larvotto Estates'];

function buildParcels() {
  const ops = [];
  for (let i = 0; i < 10; i++) {
    const col = i % 5;
    const row = Math.floor(i / 5);
    const x0 = ORIGIN_LNG + col * CELL;
    const y0 = ORIGIN_LAT + row * CELL;
    const x1 = x0 + CELL;
    const y1 = y0 + CELL;
    const ring = [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
      [x0, y0],
    ];
    const apn = `06-${1000 + i}`;
    ops.push({
      type: 'insert',
      feature_id: randomUUID(),
      geometry_wkb_hex: polygonWkbHex(ring),
      properties: {
        apn,
        address: `${10 + i} Avenue de Monaco`,
        owner: OWNERS[i % OWNERS.length],
        zoning: ZONINGS[i % ZONINGS.length],
        acres: 1.2,
        sqft: 52272,
        land_use: 'Residential',
        assessed_value: 850000 + i * 25000,
        market_value: 1200000 + i * 40000,
        year_built: 1975 + i,
        building_sqft: 3200 + i * 150,
        flood_zone: i % 4 === 0 ? 'AE' : 'X',
        lng: (x0 + x1) / 2,
        lat: (y0 + y1) / 2,
      },
    });
  }
  return ops;
}

function buildSales() {
  const ops = [];
  const today = new Date();
  for (let i = 0; i < 15; i++) {
    const lng = ORIGIN_LNG + (i % 5) * CELL * 0.7 + 0.0002;
    const lat = ORIGIN_LAT + Math.floor(i / 5) * CELL * 0.7 + 0.0002;
    const daysAgo = 20 + i * 20; // spread across the last ~10 months
    const d = new Date(today.getTime() - daysAgo * 86400000);
    const saleDate = d.toISOString().slice(0, 10);
    const sqft = 1800 + (i % 6) * 350;
    const pricePerSqft = 900 + (i % 5) * 60;
    ops.push({
      type: 'insert',
      feature_id: randomUUID(),
      geometry_wkb_hex: pointWkbHex(lng, lat),
      properties: {
        address: `${20 + i} Rue des Ventes`,
        sale_price: Math.round(sqft * pricePerSqft),
        sale_date: saleDate,
        sqft,
        bedrooms: 2 + (i % 4),
        bathrooms: 1 + (i % 3),
        year_built: 1980 + i,
        lng,
        lat,
      },
    });
  }
  return ops;
}

// ─── Main ───────────────────────────────────────────────────────────

// Idempotent per feature: only inserts demo features whose key (apn/address) is
// missing, so it restores the full demo set even after merges/splits removed some.
async function seedDataset(name, geometryType, keyProp, buildOps) {
  const datasetId = await ensureDataset(name, geometryType);
  const branchId = await ensureBranch(datasetId, 'main');
  const have = await existingKeys(branchId, keyProp);
  const ops = buildOps().filter((op) => !have.has(op.properties[keyProp]));
  if (ops.length === 0) {
    console.log(`${name}: all demo features present, nothing to insert`);
    return { datasetId, branchId, inserted: 0 };
  }
  await commit(branchId, `seed ${name}`, ops);
  console.log(`${name}: committed ${ops.length} features (branch ${branchId})`);
  return { datasetId, branchId, inserted: ops.length };
}

async function main() {
  console.log(`seeding real-estate demo data into ${API}`);
  const parcels = await seedDataset('demo_parcels', 'polygon', 'apn', buildParcels);
  const sales = await seedDataset('demo_sales', 'point', 'address', buildSales);
  console.log(JSON.stringify({ parcels, sales }, null, 2));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
