/**
 * Current view bounds as a lon/lat box, read from the renderer that is on
 * screen. ViewerArea keeps every renderer container mounted and toggles
 * display, and only the displayed one holds a live instance, so asking a
 * single renderer (Cesium) leaves the other two with no bounds at all.
 */
import { Math as CesiumMath } from 'cesium';
import { useAppStore, type Renderer } from '../store/app';
import { getActiveCesiumViewer, getActiveDeck, getActiveMapLibre } from '../viewer/registry';
import { getSharedCamera } from '../hooks/sharedCamera';

export interface ViewBounds {
  west: number;
  south: number;
  east: number;
  north: number;
  centerLng: number;
  centerLat: number;
}

/** A box, or null when the numbers are unusable (non-finite or zero area). */
function box(west: number, south: number, east: number, north: number): ViewBounds | null {
  if (![west, south, east, north].every(Number.isFinite)) return null;
  if (east <= west || north <= south) return null;
  return { west, south, east, north, centerLng: (west + east) / 2, centerLat: (south + north) / 2 };
}

function cesiumBounds(): ViewBounds | null {
  const viewer = getActiveCesiumViewer();
  const rect = viewer?.camera.computeViewRectangle();
  if (!rect) return null;
  return box(
    CesiumMath.toDegrees(rect.west),
    CesiumMath.toDegrees(rect.south),
    CesiumMath.toDegrees(rect.east),
    CesiumMath.toDegrees(rect.north),
  );
}

function maplibreBounds(): ViewBounds | null {
  const map = getActiveMapLibre();
  if (!map) return null;
  const b = map.getBounds();
  return box(b.getWest(), b.getSouth(), b.getEast(), b.getNorth());
}

function deckBounds(): ViewBounds | null {
  const viewport = getActiveDeck()?.getViewports()[0];
  if (!viewport) return null;
  const [west, south, east, north] = viewport.getBounds();
  // deck's tilted camera can see past the antimeridian and the mercator limit
  return box(
    Math.max(west, -180),
    Math.max(south, -85),
    Math.min(east, 180),
    Math.min(north, 85),
  );
}

const READERS: Record<Renderer, () => ViewBounds | null> = {
  cesium: cesiumBounds,
  maplibre: maplibreBounds,
  deckgl: deckBounds,
};

/** Displayed renderer's bounds, else any other live one, else the shared camera. */
export function getViewBounds(): ViewBounds {
  const displayed = useAppStore.getState().renderer;
  const order: Renderer[] = [
    displayed,
    ...(Object.keys(READERS) as Renderer[]).filter((r) => r !== displayed),
  ];
  for (const r of order) {
    const bounds = READERS[r]();
    if (bounds) return bounds;
  }
  // fallback: a box around the shared camera sized by zoom
  const cam = getSharedCamera();
  const span = 180 / 2 ** cam.zoom;
  return {
    west: cam.longitude - span,
    south: cam.latitude - span,
    east: cam.longitude + span,
    north: cam.latitude + span,
    centerLng: cam.longitude,
    centerLat: cam.latitude,
  };
}
