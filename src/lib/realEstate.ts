// Client for ptolemy's real-estate + geoprocessing endpoints (same-origin /api/v1 proxy).
// Parcel/comps search hit the real_estate module; split/merge use the geoprocessing
// module (PostGIS ST_Split / ST_Union) then commit the result back to the branch.

import * as turf from '@turf/turf';
import { geojsonToWkbHex, wkbHexToGeojson, geometryCentroid } from './wkb';

export const PARCELS_DATASET = 'demo_parcels';
export const SALES_DATASET = 'demo_sales';
export const DEFAULT_BRANCH = 'main';

const API = '/api/v1';

export interface ParcelRecord {
  id: string;
  apn: string;
  address: string;
  owner: string;
  zoning: string;
  sqft: number;
  properties: Record<string, unknown>;
  geometry: GeoJSON.Geometry | null;
}

interface RawParcel {
  id: string;
  apn: string | null;
  address: string | null;
  owner: string | null;
  zoning: string | null;
  sqft: number | null;
  properties: Record<string, unknown>;
  geometry_wkb_hex: string;
}

export interface CompRecord {
  id: string;
  address: string;
  salePrice: number;
  saleDate: string;
  sqft: number;
  pricePerSqft: number;
  distanceM: number;
  properties: Record<string, unknown>;
}

interface CompsResponse {
  results: Array<{
    id: string;
    address: string | null;
    sale_price: number | null;
    sale_date: string | null;
    sqft: number | null;
    price_per_sqft: number | null;
    distance_m: number;
    properties: Record<string, unknown>;
  }>;
  summary: {
    count: number;
    avg_price: number;
    median_price: number;
    min_price: number;
    max_price: number;
  } | null;
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  if (!res.ok) {
    throw new Error(`${path} failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// Resolve a branch id from human names so panels don't need hardcoded UUIDs.
export async function discoverBranch(
  datasetName: string,
  branchName = DEFAULT_BRANCH,
): Promise<string | null> {
  const datasets = await apiJson<Array<{ id: string; name: string }>>('/datasets');
  const ds = datasets.find((d) => d.name === datasetName);
  if (!ds) return null;
  const branches = await apiJson<Array<{ id: string; name: string }>>(
    `/datasets/${ds.id}/branches`,
  );
  const branch = branches.find((b) => b.name === branchName) ?? branches[0];
  return branch?.id ?? null;
}

export async function searchParcels(
  branchId: string,
  searchType: string,
  q: string,
  limit = 10,
): Promise<ParcelRecord[]> {
  const params = new URLSearchParams({
    branch_id: branchId,
    type: searchType,
    q,
    limit: String(limit),
  });
  const raw = await apiJson<RawParcel[]>(`/parcels/search?${params}`);
  return raw.map((r) => ({
    id: r.id,
    apn: r.apn ?? '',
    address: r.address ?? '',
    owner: r.owner ?? '',
    zoning: r.zoning ?? '',
    sqft: r.sqft ?? 0,
    properties: r.properties,
    geometry: r.geometry_wkb_hex ? wkbHexToGeojson(r.geometry_wkb_hex) : null,
  }));
}

export interface CompsQuery {
  lng: number;
  lat: number;
  radiusM: number;
  maxDays: number;
  minSqft?: number;
  maxSqft?: number;
  limit?: number;
}

export async function searchComps(
  branchId: string,
  q: CompsQuery,
): Promise<{ comps: CompRecord[]; summary: CompsResponse['summary'] }> {
  const params = new URLSearchParams({
    branch_id: branchId,
    lng: String(q.lng),
    lat: String(q.lat),
    radius_m: String(q.radiusM),
    max_days: String(q.maxDays),
    limit: String(q.limit ?? 50),
  });
  if (q.minSqft != null) params.set('min_sqft', String(q.minSqft));
  if (q.maxSqft != null) params.set('max_sqft', String(q.maxSqft));

  const data = await apiJson<CompsResponse>(`/comps/search?${params}`);
  const comps = data.results.map((r) => ({
    id: r.id,
    address: r.address ?? '',
    salePrice: r.sale_price ?? 0,
    saleDate: r.sale_date ?? '',
    sqft: r.sqft ?? 0,
    pricePerSqft: r.price_per_sqft ?? 0,
    distanceM: r.distance_m,
    properties: r.properties,
  }));
  return { comps, summary: data.summary };
}

interface CommitOp {
  type: 'insert' | 'delete';
  feature_id: string;
  geometry_wkb_hex?: string;
  properties?: Record<string, unknown>;
}

async function commit(
  branchId: string,
  message: string,
  author: string,
  operations: CommitOp[],
): Promise<void> {
  await apiJson(`/branches/${branchId}/commit`, {
    method: 'POST',
    body: JSON.stringify({ message, author, operations }),
  });
}

// Merge >= 2 parcels: union the polygons with turf, then commit the union as a
// new feature and delete the originals in a single changeset. Returns the new APN.
// (ptolemy's geoprocessing/merge is used for split via ST_Split but its own merge
// path has a broken ST_Union(geography) cast, so the union runs client-side here.)
export async function mergeParcels(
  branchId: string,
  parcels: ParcelRecord[],
  author = 'viewtopia',
): Promise<{ newId: string; newApn: string }> {
  if (parcels.length < 2) throw new Error('need at least 2 parcels to merge');

  const featureIds = parcels.map((p) => p.id);
  const polys = parcels.map((p) => {
    if (!p.geometry || (p.geometry.type !== 'Polygon' && p.geometry.type !== 'MultiPolygon')) {
      throw new Error(`parcel ${p.apn} is not a polygon`);
    }
    return turf.feature(p.geometry);
  });
  const merged = turf.union(turf.featureCollection(polys));
  if (!merged) throw new Error('union produced no geometry');
  const mergedGeometry = merged.geometry as GeoJSON.Geometry;

  const newId = crypto.randomUUID();
  const newApn = `${parcels[0].apn}-M`;
  const acres = parcels.reduce(
    (s, p) => s + (typeof p.properties.acres === 'number' ? p.properties.acres : 0),
    0,
  );

  const ops: CommitOp[] = [
    {
      type: 'insert',
      feature_id: newId,
      geometry_wkb_hex: geojsonToWkbHex(mergedGeometry),
      properties: {
        apn: newApn,
        address: parcels[0].address,
        owner: parcels[0].owner,
        zoning: parcels[0].zoning,
        acres,
        merged_from: parcels.map((p) => p.apn),
      },
    },
    ...featureIds.map((id): CommitOp => ({ type: 'delete', feature_id: id })),
  ];
  await commit(branchId, `merge ${featureIds.length} parcels`, author, ops);
  return { newId, newApn };
}

// Horizontal blade across the parcel's bbox, used when no line was drawn on the map.
function bisectorLine(geom: GeoJSON.Geometry): GeoJSON.LineString {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const rings =
    geom.type === 'Polygon'
      ? geom.coordinates
      : geom.type === 'MultiPolygon'
        ? geom.coordinates.flat()
        : [];
  for (const ring of rings) {
    for (const [x, y] of ring) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  const midY = (minY + maxY) / 2;
  const pad = (maxX - minX) * 0.1 || 0.0001;
  return {
    type: 'LineString',
    coordinates: [
      [minX - pad, midY],
      [maxX + pad, midY],
    ],
  };
}

// Split one parcel by a line (defaults to a bbox bisector): PostGIS ST_Split
// server-side, then commit the pieces as new features and delete the original.
export async function splitParcel(
  branchId: string,
  parcel: ParcelRecord,
  splitLine?: GeoJSON.LineString,
  author = 'viewtopia',
): Promise<{ newApns: string[] }> {
  if (!parcel.geometry) throw new Error('parcel has no geometry to split');
  const line = splitLine ?? bisectorLine(parcel.geometry);

  const fc = await apiJson<{ features: Array<{ geometry: GeoJSON.Geometry }> }>(
    `/branches/${branchId}/geoprocessing/split`,
    {
      method: 'POST',
      body: JSON.stringify({ feature_id: parcel.id, split_line: line }),
    },
  );
  if (fc.features.length < 2) {
    throw new Error('split produced fewer than 2 pieces');
  }

  const newApns = fc.features.map((_, i) => `${parcel.apn}-${i + 1}`);
  const ops: CommitOp[] = [
    ...fc.features.map((f, i): CommitOp => ({
      type: 'insert',
      feature_id: crypto.randomUUID(),
      geometry_wkb_hex: geojsonToWkbHex(f.geometry),
      properties: {
        apn: newApns[i],
        address: parcel.address,
        owner: parcel.owner,
        zoning: parcel.zoning,
        split_from: parcel.apn,
      },
    })),
    { type: 'delete', feature_id: parcel.id },
  ];
  await commit(branchId, `split parcel ${parcel.apn}`, author, ops);
  return { newApns };
}

export async function featureCount(branchId: string): Promise<number> {
  const data = await apiJson<{ features: unknown[] }>(`/branches/${branchId}/features`);
  return data.features.length;
}

export function parcelCentroid(parcel: ParcelRecord): [number, number] | null {
  return parcel.geometry ? geometryCentroid(parcel.geometry) : null;
}
