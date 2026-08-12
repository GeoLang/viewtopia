// Geometry for the vertical panels. ptolemy's vertical endpoints (/fields,
// /construction/surveys, /incidents) project attributes out of a branch's features
// and drop the geometry column, so a panel that wants to draw a row joins it back
// from /branches/{id}/features on the same feature id.

import { apiHeaders, noticeRefusal } from './apiAuth';
import { wkbHexToGeojson } from './wkb';

interface RawFeature {
  id: string;
  geometry_wkb: number[];
}

function toHex(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** feature id -> geometry, skipping features whose WKB type wkb.ts doesn't decode. */
export async function fetchBranchGeometry(
  branchId: string,
  limit = 500,
): Promise<Map<string, GeoJSON.Geometry>> {
  const res = await fetch(`/api/v1/branches/${branchId}/features?limit=${limit}`, {
    headers: apiHeaders(),
  });
  if (!res.ok) {
    noticeRefusal(res.status);
    throw new Error(`branch features failed: ${res.status} ${res.statusText}`);
  }
  const page = (await res.json()) as { features: RawFeature[] };
  const geometry = new Map<string, GeoJSON.Geometry>();
  for (const f of page.features) {
    if (!f.geometry_wkb?.length) continue;
    try {
      geometry.set(f.id, wkbHexToGeojson(toHex(f.geometry_wkb)));
    } catch {
      // wkb.ts covers Point, Polygon and MultiPolygon only
    }
  }
  return geometry;
}
