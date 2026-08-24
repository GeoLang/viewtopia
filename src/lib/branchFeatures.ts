// Reads and writes for one ptolemy branch's features, shared by the panels that
// draw them and by the offline sync engine.
//
// The vertical endpoints (/fields, /construction/surveys, /incidents) project
// attributes out of a branch and drop the geometry column, so a panel that wants
// to draw a row joins it back from /branches/{id}/features on the same feature id.

import { apiHeaders, noticeRefusal } from './apiAuth';
import { geojsonToWkbHex, wkbHexToGeojson } from './wkb';

const API = '/api/v1';

export interface BranchFeature {
  id: string;
  properties: Record<string, unknown>;
  /** null when wkb.ts does not decode the feature's WKB type */
  geometry: GeoJSON.Geometry | null;
}

interface RawFeature {
  id: string;
  geometry_wkb: number[];
  properties: Record<string, unknown>;
}

function toHex(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function decode(hex: string): GeoJSON.Geometry | null {
  try {
    return wkbHexToGeojson(hex);
  } catch {
    // wkb.ts covers Point, Polygon and MultiPolygon only
    return null;
  }
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${API}${path}`, { ...init, headers: apiHeaders(init?.headers) });
  if (!res.ok) noticeRefusal(res.status);
  return res;
}

async function requestOk(path: string, init?: RequestInit): Promise<Response> {
  const res = await request(path, init);
  if (!res.ok) throw new Error(`${path} failed: ${res.status} ${res.statusText}`);
  return res;
}

export interface NamedRecord {
  id: string;
  name: string;
}

export async function fetchDatasets(): Promise<NamedRecord[]> {
  const res = await requestOk('/datasets');
  return (await res.json()) as NamedRecord[];
}

export async function fetchBranches(datasetId: string): Promise<NamedRecord[]> {
  const res = await requestOk(`/datasets/${datasetId}/branches`);
  return (await res.json()) as NamedRecord[];
}

/** The map layer one branch's features are drawn in. */
export function branchLayerId(branchId: string): string {
  return `ptolemy-branch-${branchId}`;
}

export async function fetchBranchFeatures(
  branchId: string,
  limit = 500,
): Promise<BranchFeature[]> {
  const res = await requestOk(`/branches/${branchId}/features?limit=${limit}`);
  const page = (await res.json()) as { features: RawFeature[] };
  return page.features.map((f) => ({
    id: f.id,
    properties: f.properties ?? {},
    geometry: f.geometry_wkb?.length ? decode(toHex(f.geometry_wkb)) : null,
  }));
}

/** feature id -> geometry, skipping features whose WKB type wkb.ts doesn't decode. */
export async function fetchBranchGeometry(
  branchId: string,
  limit = 500,
): Promise<Map<string, GeoJSON.Geometry>> {
  const geometry = new Map<string, GeoJSON.Geometry>();
  for (const feature of await fetchBranchFeatures(branchId, limit)) {
    if (feature.geometry) geometry.set(feature.id, feature.geometry);
  }
  return geometry;
}

/** One feature at the branch head, or null when it is not live there. */
export async function fetchBranchFeature(
  branchId: string,
  featureId: string,
): Promise<BranchFeature | null> {
  const res = await request(`/branches/${branchId}/features/${featureId}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(
      `/branches/${branchId}/features/${featureId} failed: ${res.status} ${res.statusText}`,
    );
  }
  const body = (await res.json()) as {
    feature_id: string;
    geometry_wkb_hex: string;
    properties: Record<string, unknown>;
  };
  return {
    id: body.feature_id,
    properties: body.properties ?? {},
    geometry: body.geometry_wkb_hex ? decode(body.geometry_wkb_hex) : null,
  };
}

export interface FeatureInsert {
  /** client-minted uuid, so the caller can find the feature again */
  id: string;
  properties: Record<string, unknown>;
  geometry: GeoJSON.Geometry;
}

/** Commit new features to the branch head, one insert per shape. */
export async function commitFeatureInserts(
  branchId: string,
  inserts: FeatureInsert[],
  message: string,
): Promise<void> {
  await requestOk(`/branches/${branchId}/commit`, {
    method: 'POST',
    body: JSON.stringify({
      message,
      author: 'viewtopia',
      operations: inserts.map((insert) => ({
        type: 'insert',
        feature_id: insert.id,
        geometry_wkb_hex: geojsonToWkbHex(insert.geometry),
        properties: insert.properties,
      })),
    }),
  });
}

/**
 * Commit one feature's new attributes. An update that omits the geometry keeps
 * the one already on the branch, so a property-only edit sends properties alone.
 */
export async function commitFeatureUpdate(
  branchId: string,
  featureId: string,
  properties: Record<string, unknown>,
  geometry?: GeoJSON.Geometry,
): Promise<void> {
  await requestOk(`/branches/${branchId}/commit`, {
    method: 'POST',
    body: JSON.stringify({
      message: `edit feature ${featureId}`,
      author: 'viewtopia',
      operations: [
        {
          type: 'update',
          feature_id: featureId,
          properties,
          ...(geometry ? { geometry_wkb_hex: geojsonToWkbHex(geometry) } : {}),
        },
      ],
    }),
  });
}
