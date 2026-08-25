// Seed a demo real-estate dataset into ptolemy so the real-estate vertical is
// demonstrable end to end: ~10 parcel polygons + ~15 point sales on the current region.
//
// Talks directly to ptolemy (default http://localhost:3000). Override with
// PTOLEMY_URL. Idempotent: skips a dataset/branch that already holds features.
//
//   node scripts/seed-parcels.mjs

import { randomUUID } from 'node:crypto';
import {
  API,
  MONACO,
  commit,
  ensureBranch,
  ensureDataset,
  existingKeys,
  pointWkbHex,
  polygonWkbHex,
  ptolemyClient,
  regionAnchor,
} from './ptolemy-seed.mjs';

const api = ptolemyClient('seed-parcels');

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
  const datasetId = await ensureDataset(api, name, geometryType);
  const branchId = await ensureBranch(api, datasetId, 'main');
  if (process.env.SEED_RESET) {
    const all = await api(`/branches/${branchId}/features`);
    const dels = all.features.map((f) => ({ type: 'delete', feature_id: f.id }));
    if (dels.length) {
      await commit(api, branchId, `reset ${name} for new region`, dels);
      console.log(`${name}: cleared ${dels.length} stale features (region changed)`);
    }
  }
  const have = await existingKeys(api, branchId, keyProp);
  const ops = buildOps().filter((op) => !have.has(op.properties[keyProp]));
  if (ops.length === 0) {
    console.log(`${name}: all demo features present, nothing to insert`);
    return { datasetId, branchId, inserted: 0 };
  }
  await commit(api, branchId, `seed ${name}`, ops);
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
