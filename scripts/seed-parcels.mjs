// Seed a demo real-estate dataset into ptolemy so the real-estate vertical is
// demonstrable end to end: ~10 parcel polygons + ~15 point sales on the current region.
//
// Talks directly to ptolemy (default http://localhost:3000). Override with
// PTOLEMY_URL. Idempotent: skips a dataset/branch that already holds features.
//
//   node scripts/seed-parcels.mjs

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { platformAuthHeaders } from './platform-token.mjs';

const BASE = (process.env.PTOLEMY_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const API = `${BASE}/api/v1`;
const GEOKODE = (process.env.GEOKODE_URL ?? 'http://localhost:3001').replace(/\/$/, '');
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PBF = process.env.REGION_PBF ?? resolve(REPO, 'data/region.osm.pbf');
// Monaco: the default region, and the fallback anchor when the pbf/geocoder are
// unavailable (e.g. seeding against a remote ptolemy with no local pbf).
const MONACO = [7.42, 43.734];
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

// ─── Region anchor ──────────────────────────────────────────────────
//
// Place the demo on the current region instead of hardcoded Monaco. Read the
// bbox from the OSM pbf header, then snap its center to the nearest ingested
// address via geokode (Geofabrik pads bboxes, so the raw center can sit offshore
// / outside the data). Any step failing falls back to Monaco, keeping the demo
// robust when seeding against a remote ptolemy with no local pbf/geocoder.

function readVarint(buf, pos) {
  let shift = 0n, result = 0n, b;
  do {
    b = buf[pos++];
    result |= BigInt(b & 0x7f) << shift;
    shift += 7n;
  } while (b & 0x80);
  return [result, pos];
}

// minimal protobuf: field number -> BigInt (varint) or Buffer (length-delimited)
function protoFields(buf) {
  const out = {};
  let pos = 0;
  while (pos < buf.length) {
    let key;
    [key, pos] = readVarint(buf, pos);
    const field = Number(key >> 3n);
    switch (Number(key & 7n)) {
      case 0: { let v; [v, pos] = readVarint(buf, pos); out[field] = v; break; }
      case 2: { let len; [len, pos] = readVarint(buf, pos); const l = Number(len); out[field] = buf.subarray(pos, pos + l); pos += l; break; }
      case 1: pos += 8; break;
      case 5: pos += 4; break;
      default: return out;
    }
  }
  return out;
}

// center [lng, lat] of the pbf header bbox, or null if it can't be read
function pbfBboxCenter(path) {
  let buf;
  try { buf = readFileSync(path); } catch { return null; }
  try {
    const hdrLen = buf.readUInt32BE(0);
    const blobHeader = protoFields(buf.subarray(4, 4 + hdrLen));
    if (blobHeader[1]?.toString('utf8') !== 'OSMHeader') return null;
    const start = 4 + hdrLen;
    const blob = protoFields(buf.subarray(start, start + Number(blobHeader[3])));
    const block = blob[1] ?? (blob[3] && inflateSync(blob[3]));
    if (!block) return null;
    const bboxBytes = protoFields(block)[1]; // HeaderBlock field 1 = HeaderBBox
    if (!bboxBytes) return null;
    const bbox = protoFields(bboxBytes); // fields 1..4 = left,right,top,bottom (sint64 nanodeg)
    const zz = (v) => (v >> 1n) ^ -(v & 1n);
    const dec = (v) => (v === undefined ? NaN : Number(zz(v)) / 1e9);
    const [left, right, top, bottom] = [dec(bbox[1]), dec(bbox[2]), dec(bbox[3]), dec(bbox[4])];
    if ([left, right, top, bottom].some((n) => !Number.isFinite(n))) return null;
    return [(left + right) / 2, (top + bottom) / 2];
  } catch { return null; }
}

// [lng, lat] plus the street the anchor address sits on, so parcel addresses read
// like the region instead of a hardcoded city.
async function regionAnchor() {
  const center = pbfBboxCenter(PBF);
  if (!center) {
    console.log(`no readable pbf at ${PBF}; anchoring demo on Monaco`);
    return { anchor: MONACO, street: null };
  }
  try {
    const res = await fetch(`${GEOKODE}/reverse?lon=${center[0]}&lat=${center[1]}&limit=1`);
    const hit = res.ok ? (await res.json()).results?.[0] : null;
    if (hit && Number.isFinite(hit.lon) && Number.isFinite(hit.lat)) {
      console.log(`region anchor ${hit.lon.toFixed(5)},${hit.lat.toFixed(5)} (nearest address to pbf center)`);
      return { anchor: [hit.lon, hit.lat], street: hit.address?.street ?? null };
    }
  } catch {
    // geokode down: bbox center still lands in-region for a well-cropped extract
  }
  console.log(`geokode unavailable; anchoring demo on pbf bbox center ${center[0].toFixed(5)},${center[1].toFixed(5)}`);
  return { anchor: center, street: null };
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

// region anchor, set from regionAnchor() before any ops are built
let ORIGIN_LNG = MONACO[0];
let ORIGIN_LAT = MONACO[1];
// street the anchor address sits on; PARCEL_STREET_FALLBACK when geokode can't say
let PARCEL_STREET = null;
const CELL = 0.0009; // ~70m, parcels in a row share an edge so merges are contiguous

const ZONINGS = ['R-1', 'R-2', 'R-3', 'C-1', 'C-2'];
// region-neutral placeholders: the demo must read the same on any extract
const OWNERS = [
  'Harborview Holdings Ltd',
  'Meridian Property Group',
  'Northgate Land Trust',
  'Silverbrook Estates',
];
const PARCEL_STREET_FALLBACK = 'Waterfront Way';
// sales addresses are the dedup key in seedDataset, so they stay fixed: a
// region-derived street would re-insert the whole set whenever it changed.
const SALES_STREET = 'Market Street';

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
        address: `${10 + i} ${PARCEL_STREET ?? PARCEL_STREET_FALLBACK}`,
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
        address: `${20 + i} ${SALES_STREET}`,
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
// SEED_RESET (set by platform-up.sh on a region change) first wipes the branch so
// stale features from the previous region don't linger at the old coordinates.
async function seedDataset(name, geometryType, keyProp, buildOps) {
  const datasetId = await ensureDataset(name, geometryType);
  const branchId = await ensureBranch(datasetId, 'main');
  if (process.env.SEED_RESET) {
    const all = await api(`/branches/${branchId}/features`);
    const dels = all.features.map((f) => ({ type: 'delete', feature_id: f.id }));
    if (dels.length) {
      await commit(branchId, `reset ${name} for new region`, dels);
      console.log(`${name}: cleared ${dels.length} stale features (region changed)`);
    }
  }
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
  const { anchor, street } = await regionAnchor();
  [ORIGIN_LNG, ORIGIN_LAT] = anchor;
  PARCEL_STREET = street;
  const parcels = await seedDataset('demo_parcels', 'polygon', 'apn', buildParcels);
  const sales = await seedDataset('demo_sales', 'point', 'address', buildSales);
  console.log(JSON.stringify({ parcels, sales }, null, 2));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
