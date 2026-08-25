// Helpers both seed scripts use to write features into ptolemy: an authenticated
// client, WKB encoders, the region anchor, and the dataset/branch/commit calls.

import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { platformAuthHeaders } from './platform-token.mjs';

const BASE = (process.env.PTOLEMY_URL ?? 'http://localhost:3000').replace(/\/$/, '');
export const API = `${BASE}/api/v1`;
const GEOKODE = (process.env.GEOKODE_URL ?? 'http://localhost:3001').replace(/\/$/, '');
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PBF = process.env.REGION_PBF ?? resolve(REPO, 'data/region.osm.pbf');
// Monaco: the default region, and the fallback anchor when the pbf/geocoder are
// unavailable (e.g. seeding against a remote ptolemy with no local pbf).
export const MONACO = [7.42, 43.734];

// seeding writes, so it needs an editor token when the stack enforces auth
export function ptolemyClient(sub, base = API) {
  const auth = platformAuthHeaders({ role: 'editor', sub });
  return async function api(path, init) {
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...auth, ...(init?.headers ?? {}) },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`${init?.method ?? 'GET'} ${path} -> ${res.status}: ${body}`);
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  };
}

// ─── WKB encoders (little-endian, 2D, no SRID) ──────────────────────

export function pointWkbHex(x, y) {
  const b = Buffer.alloc(21);
  b.writeUInt8(1, 0);
  b.writeUInt32LE(1, 1);
  b.writeDoubleLE(x, 5);
  b.writeDoubleLE(y, 13);
  return b.toString('hex');
}

export function polygonWkbHex(ring) {
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
export async function regionAnchor() {
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

export async function ensureDataset(api, name, geometryType) {
  const datasets = await api('/datasets');
  const found = datasets.find((d) => d.name === name);
  if (found) return found.id;
  const created = await api('/datasets', {
    method: 'POST',
    body: JSON.stringify({ name, geometry_type: geometryType, srid: 4326, created_by: 'seed' }),
  });
  return created.id;
}

export async function ensureBranch(api, datasetId, name) {
  const branches = await api(`/datasets/${datasetId}/branches`);
  const found = branches.find((b) => b.name === name);
  if (found) return found.id;
  const created = await api(`/datasets/${datasetId}/branches`, {
    method: 'POST',
    body: JSON.stringify({ name, created_by: 'seed' }),
  });
  return created.id;
}

export async function existingKeys(api, branchId, keyProp) {
  const data = await api(`/branches/${branchId}/features`);
  return new Set(
    data.features.map((f) => f.properties?.[keyProp]).filter((k) => k != null),
  );
}

export async function commit(api, branchId, message, operations) {
  await api(`/branches/${branchId}/commit`, {
    method: 'POST',
    body: JSON.stringify({ message, author: 'seed', operations }),
  });
}
