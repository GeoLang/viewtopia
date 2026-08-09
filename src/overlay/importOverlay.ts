import { useAgentLayerStore } from '../store/agentLayers';
import { getActiveMapLibre } from '../viewer/registry';
import { getSharedCamera } from '../hooks/sharedCamera';
import {
  cornersAtCenter,
  cornersAxisAligned,
  cornersOfBbox,
  type Corners,
  type LonLatBbox,
} from './georeference';
import { cornersToLonLat, registerDroppedGrid } from './projicio';
import { resampleNorthUp } from './rasterize';
import { imageCorners, overlayFileKind, parseWorldFile } from './worldFile';

/** An image or PDF page decoded and ready to drape. */
export interface OverlaySource {
  name: string;
  dataUrl: string;
  element: CanvasImageSource;
  width: number;
  height: number;
  pdfFile?: File;
  pageCount?: number;
  page?: number;
}

export const DEFAULT_OVERLAY_OPACITY = 0.8;

/** Degrees either side of the camera when no map is on screen to ask. */
const FALLBACK_VIEW_SPAN = 0.05;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

async function loadImageSource(file: File): Promise<OverlaySource> {
  const dataUrl = await readAsDataUrl(file);
  const element = new Image();
  element.src = dataUrl;
  await element.decode();
  return {
    name: file.name,
    dataUrl,
    element,
    width: element.naturalWidth,
    height: element.naturalHeight,
  };
}

export async function loadPdfSource(file: File, page: number): Promise<OverlaySource> {
  // loaded here rather than up top: pdfjs is large, and it wants browser APIs
  // at import time that nothing else in the import path needs
  const { renderPdfPage } = await import('./pdf');
  // a fresh buffer per render: pdfjs transfers the one it is given to its worker
  const { canvas, pageCount } = await renderPdfPage(await file.arrayBuffer(), page);
  return {
    name: file.name,
    dataUrl: canvas.toDataURL('image/png'),
    element: canvas,
    width: canvas.width,
    height: canvas.height,
    pdfFile: file,
    pageCount,
    page,
  };
}

/** Decode an image or PDF, or null when the file is neither. */
export async function loadOverlaySource(file: File): Promise<OverlaySource | null> {
  const kind = overlayFileKind(file.name);
  if (kind === 'image') return loadImageSource(file);
  if (kind === 'pdf') return loadPdfSource(file, 1);
  return null;
}

/** What the user can see, from the map if there is one and the camera if not. */
function visibleBounds(): LonLatBbox {
  const map = getActiveMapLibre();
  if (map) {
    const bounds = map.getBounds();
    return [
      bounds.getWest(),
      bounds.getSouth(),
      bounds.getEast(),
      bounds.getNorth(),
    ];
  }
  const camera = getSharedCamera();
  return [
    camera.longitude - FALLBACK_VIEW_SPAN,
    camera.latitude - FALLBACK_VIEW_SPAN,
    camera.longitude + FALLBACK_VIEW_SPAN,
    camera.latitude + FALLBACK_VIEW_SPAN,
  ];
}

export function centerCorners(source: OverlaySource): Corners {
  return cornersAtCenter(visibleBounds(), source.width, source.height);
}

/**
 * Drop an overlay on the middle of the view and open its corner handles, which
 * is what a plain image with no world file needs before it means anything.
 */
export function addOverlayAtCenter(source: OverlaySource, id = crypto.randomUUID()): string {
  const store = useAgentLayerStore.getState();
  store.addRasterLayer({
    id,
    name: source.name,
    url: source.dataUrl,
    corners: centerCorners(source),
    opacity: DEFAULT_OVERLAY_OPACITY,
    visible: true,
  });
  store.setEditingRaster(id);
  return id;
}

export interface OverlayPlacement {
  url: string;
  corners: Corners;
}

/**
 * Where a world file puts the image, through the .prj's coordinate system when
 * the numbers are not already lon/lat. A rotated result is resampled north-up
 * so Cesium and Leaflet, which drape onto a rectangle, place it right too.
 */
export async function georeferenceOverlay(
  source: OverlaySource,
  worldFileText: string,
  projectionText: string | null,
): Promise<OverlayPlacement> {
  const transform = parseWorldFile(worldFileText);
  const corners = await cornersToLonLat(
    imageCorners(transform, source.width, source.height),
    projectionText,
  );
  if (cornersAxisAligned(corners)) return { url: source.dataUrl, corners };
  const flat = resampleNorthUp(source.element, source.width, source.height, corners);
  return { url: flat.url, corners: cornersOfBbox(flat.bbox) };
}

/** What one dropped batch turned out to hold. Absent fields were not in it. */
export interface OverlayBatch {
  source?: OverlaySource;
  worldFile?: string;
  projection?: string;
  /** Datum grids, already registered with projicio, named for the caller to show. */
  grids: string[];
  /** Names of files that play no part in an overlay. */
  unsupported: string[];
}

/**
 * Sort a dropped batch by what each file is for. Kept apart from placing the
 * result so the panel, which shows the pieces as they arrive and remembers
 * sidecars across drops, reads the same batch as the plain drop path.
 */
export async function sortOverlayBatch(files: File[]): Promise<OverlayBatch> {
  const batch: OverlayBatch = { grids: [], unsupported: [] };
  for (const file of files) {
    switch (overlayFileKind(file.name)) {
      case 'image':
      case 'pdf':
        batch.source = (await loadOverlaySource(file)) ?? undefined;
        break;
      case 'worldFile':
        batch.worldFile = await file.text();
        break;
      case 'projection':
        batch.projection = await file.text();
        break;
      case 'grid':
        await registerDroppedGrid(file.name, new Uint8Array(await file.arrayBuffer()));
        batch.grids.push(file.name);
        break;
      default:
        batch.unsupported.push(file.name);
    }
  }
  return batch;
}

/**
 * One dropped batch: an image or PDF, with its world file, .prj and datum grid
 * if they came along. Georeferenced when the sidecars allow it, dropped on the
 * middle of the view when they do not.
 */
export async function importOverlayFiles(files: File[]): Promise<string> {
  const { source, worldFile: worldFileText, projection: projectionText } =
    await sortOverlayBatch(files);
  if (!source) throw new Error('no image or PDF in the dropped files');

  const id = addOverlayAtCenter(source);
  if (!worldFileText) return `${source.name}: drag its corners to place it`;

  const placement = await georeferenceOverlay(source, worldFileText, projectionText ?? null);
  const store = useAgentLayerStore.getState();
  store.addRasterLayer({
    id,
    name: source.name,
    url: placement.url,
    corners: placement.corners,
    opacity: DEFAULT_OVERLAY_OPACITY,
    visible: true,
  });
  return `${source.name}: placed by its world file`;
}
