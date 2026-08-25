// Reads and writes for one ptolemy branch's features, shared by the panels that
// draw them and by the offline sync engine.
//
// The vertical endpoints (/fields, /construction/surveys, /incidents) project
// attributes out of a branch and drop the geometry column, so a panel that wants
// to draw a row joins it back from /branches/{id}/features on the same feature id.

import { PtolemyRequestError } from '../projects/api';
import { apiHeaders, noticeRefusal } from './apiAuth';
import { geojsonToWkbHex, wkbHexToGeojson } from './wkb';

const API = '/api/v1';
/** who ptolemy records as the author of everything the viewer writes */
const BRANCH_AUTHOR = 'viewtopia';
/** the status of a request that never got a response */
const NO_RESPONSE = 0;

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
    // curve types and truncated bytes have no GeoJSON here
    return null;
  }
}

/** `{`, the first byte of the GeoJSON text /features/at puts in `geometry_wkb`. */
const GEOJSON_TEXT_FIRST_BYTE = 0x7b;

function geometryOf(bytes: number[] | undefined): GeoJSON.Geometry | null {
  if (!bytes?.length) return null;
  if (bytes[0] !== GEOJSON_TEXT_FIRST_BYTE) return decode(toHex(bytes));
  try {
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(bytes))) as GeoJSON.Geometry;
  } catch {
    return null;
  }
}

function toBranchFeature(raw: RawFeature): BranchFeature {
  return {
    id: raw.id,
    properties: raw.properties ?? {},
    geometry: geometryOf(raw.geometry_wkb),
  };
}

function methodOf(init?: RequestInit): string {
  return init?.method ?? 'GET';
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, { ...init, headers: apiHeaders(init?.headers) });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new PtolemyRequestError(NO_RESPONSE, reason, methodOf(init), path);
  }
  if (!res.ok) noticeRefusal(res.status);
  return res;
}

async function requestError(
  res: Response,
  path: string,
  init?: RequestInit,
): Promise<PtolemyRequestError> {
  return new PtolemyRequestError(res.status, await res.text(), methodOf(init), path);
}

async function requestOk(path: string, init?: RequestInit): Promise<Response> {
  const res = await request(path, init);
  if (!res.ok) throw await requestError(res, path, init);
  return res;
}

export interface NamedRecord {
  id: string;
  name: string;
}

export interface DatasetRecord extends NamedRecord {
  project_id: string | null;
  visibility: 'public' | 'private';
}

export async function fetchDatasets(): Promise<DatasetRecord[]> {
  const res = await requestOk('/datasets');
  return (await res.json()) as DatasetRecord[];
}

export async function fetchBranches(datasetId: string): Promise<NamedRecord[]> {
  const res = await requestOk(`/datasets/${datasetId}/branches`);
  return (await res.json()) as NamedRecord[];
}

const BRANCH_LAYER_PREFIX = 'ptolemy-branch-';

/** The map layer one branch's features are drawn in. */
export function branchLayerId(branchId: string): string {
  return `${BRANCH_LAYER_PREFIX}${branchId}`;
}

/** The branch a layer draws, or null when the layer is not a branch's. */
export function branchIdOfLayer(layerId: string): string | null {
  return layerId.startsWith(BRANCH_LAYER_PREFIX)
    ? layerId.slice(BRANCH_LAYER_PREFIX.length)
    : null;
}

export async function fetchBranchFeatures(
  branchId: string,
  limit = 500,
): Promise<BranchFeature[]> {
  const res = await requestOk(`/branches/${branchId}/features?limit=${limit}`);
  const page = (await res.json()) as { features: RawFeature[] };
  return page.features.map(toBranchFeature);
}

/** The branch as it stood at an RFC 3339 moment, rather than at its head. */
export async function fetchBranchFeaturesAt(
  branchId: string,
  at: string,
  limit = 500,
): Promise<BranchFeature[]> {
  const query = `at=${encodeURIComponent(at)}&limit=${limit}`;
  const res = await requestOk(`/branches/${branchId}/features/at?${query}`);
  const page = (await res.json()) as { features: RawFeature[] };
  return page.features.map(toBranchFeature);
}

/** A new branch of the dataset, forked from an existing one. */
export async function createBranch(
  datasetId: string,
  name: string,
  forkFromBranchId: string,
): Promise<NamedRecord> {
  const res = await requestOk(`/datasets/${datasetId}/branches`, {
    method: 'POST',
    body: JSON.stringify({
      name,
      created_by: BRANCH_AUTHOR,
      fork_from_branch: forkFromBranchId,
    }),
  });
  return (await res.json()) as NamedRecord;
}

/** How much ground the branch's live features cover once buffered by a distance. */
export interface BranchCoverage {
  featureCount: number;
  squareMeters: number;
}

export async function fetchBranchCoverage(
  branchId: string,
  distanceMeters: number,
): Promise<BranchCoverage> {
  const res = await requestOk(
    `/branches/${branchId}/analytics/coverage?distance=${distanceMeters}`,
  );
  const body = (await res.json()) as { feature_count: number; coverage_sq_meters: number };
  return { featureCount: body.feature_count, squareMeters: body.coverage_sq_meters };
}

/** The branch's features as a layer's GeoJSON, without the ones that have no geometry. */
export function branchFeatureCollection(
  features: BranchFeature[],
): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: features.flatMap((feature) =>
      feature.geometry
        ? [
            {
              type: 'Feature' as const,
              geometry: feature.geometry,
              properties: feature.properties,
            },
          ]
        : [],
    ),
  };
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
  const path = `/branches/${branchId}/features/${featureId}`;
  const res = await request(path);
  if (res.status === 404) return null;
  if (!res.ok) throw await requestError(res, path);
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
      author: BRANCH_AUTHOR,
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
      author: BRANCH_AUTHOR,
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
