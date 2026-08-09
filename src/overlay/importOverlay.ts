import { useAgentLayerStore } from '../store/agentLayers';
import { getActiveMapLibre } from '../viewer/registry';
import { getSharedCamera } from '../hooks/sharedCamera';
import { cornersAtCenter, type Corners, type LonLatBbox } from './georeference';
import { renderPdfPage } from './pdf';
import { overlayFileKind } from './worldFile';

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
