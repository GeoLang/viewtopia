import type { Corners } from './worldFile';

/**
 * Pure placement math for image overlays. The projection call sits in
 * projicio.ts and the canvas work in rasterize.ts, so this file stays
 * testable under jsdom.
 */

export type LonLatBbox = [number, number, number, number];

export function bboxOfCorners(corners: Corners): LonLatBbox {
  const xs = corners.map(([x]) => x);
  const ys = corners.map(([, y]) => y);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/**
 * Whether the corners already trace an axis-aligned rectangle, in which case
 * the image drapes onto its bbox as-is and needs no resampling.
 */
export function cornersAxisAligned(corners: Corners): boolean {
  const [topLeft, topRight, bottomRight, bottomLeft] = corners;
  const width = Math.abs(topRight[0] - topLeft[0]);
  const height = Math.abs(bottomLeft[1] - topLeft[1]);
  const tolerance = Math.max(width, height) * 1e-9;
  return (
    Math.abs(topRight[1] - topLeft[1]) <= tolerance &&
    Math.abs(bottomLeft[0] - topLeft[0]) <= tolerance &&
    Math.abs(bottomRight[0] - topRight[0]) <= tolerance &&
    Math.abs(bottomRight[1] - bottomLeft[1]) <= tolerance
  );
}

/**
 * Bbox for a manual two-click placement: the first click is the north-west
 * corner, the second sets the east edge, and the south edge follows from the
 * image's aspect ratio so ground proportions hold at that latitude.
 */
export function bboxFromTwoClicks(
  northWest: { lng: number; lat: number },
  target: { lng: number; lat: number },
  imageWidth: number,
  imageHeight: number,
): LonLatBbox | null {
  const west = northWest.lng;
  const north = northWest.lat;
  const east = target.lng;
  if (east <= west) return null;
  const metersAspect = imageHeight / imageWidth;
  const latitudeShrink = Math.cos((north * Math.PI) / 180);
  const south = north - (east - west) * latitudeShrink * metersAspect;
  if (south <= -90) return null;
  return [west, south, east, north];
}

const MIN_OVERLAY_ZOOM = 2;
const MAX_OVERLAY_ZOOM = 18;

/** A camera framing the bbox with a little margin around it. */
export function cameraForBbox(bbox: LonLatBbox): { lng: number; lat: number; zoom: number } {
  const [west, south, east, north] = bbox;
  const span = Math.max(east - west, (north - south) * 2, 1e-6);
  const zoom = Math.min(
    MAX_OVERLAY_ZOOM,
    Math.max(MIN_OVERLAY_ZOOM, Math.log2(360 / span) - 0.5),
  );
  return { lng: (west + east) / 2, lat: (south + north) / 2, zoom };
}
