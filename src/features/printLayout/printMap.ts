import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl';
import { readMapLibreCamera } from '../../hooks/cameraSync';
import { useAppStore } from '../../store/app';
import { getActiveMapLibre } from '../../viewer/registry';
import { type MapCapture, maplibreCapture, maplibreSettled } from './capture';
import { CSS_DPI, MAX_SIDE } from './imageExport';

const MM_PER_INCH = 25.4;

/** The print map draws off to the side of the window, where the user cannot see it. */
const OFFSCREEN_LEFT_PX = -20000;

/**
 * The print canvas holds a different number of pixels than the screen, so the
 * zoom that keeps the same ground under it can land outside the live map's range.
 */
const MAX_PRINT_ZOOM = 24;

export interface PrintCanvasSize {
  /** css pixels, which is what decides how much ground the canvas covers */
  cssWidth: number;
  cssHeight: number;
  /** how many device pixels each css pixel becomes, which is where the print detail comes from */
  pixelRatio: number;
}

export interface PrintCapture {
  capture: MapCapture;
  dispose(): void;
}

/**
 * A page box in millimetres as a canvas to draw it in. The css size is the box
 * at the CSS reference resolution and the pixel ratio carries the DPI, so a
 * higher DPI buys detail rather than more ground.
 */
export function printCanvasSize(
  widthMm: number,
  heightMm: number,
  dpi: number,
): PrintCanvasSize {
  const cssWidth = Math.max(1, Math.round((widthMm * CSS_DPI) / MM_PER_INCH));
  const cssHeight = Math.max(1, Math.round((heightMm * CSS_DPI) / MM_PER_INCH));
  const wanted = Math.max(dpi, 1) / CSS_DPI;
  return {
    cssWidth,
    cssHeight,
    pixelRatio: Math.min(wanted, MAX_SIDE / Math.max(cssWidth, cssHeight)),
  };
}

/**
 * The zoom that leaves the same ground under a canvas of a different css width.
 * Both canvases share an aspect ratio, so the width settles both sides.
 */
export function printZoom(
  liveZoom: number,
  liveCssWidth: number,
  printCssWidth: number,
): number {
  if (!(liveCssWidth > 0) || !(printCssWidth > 0)) return liveZoom;
  return liveZoom + Math.log2(printCssWidth / liveCssWidth);
}

/** Runtime icons live on the map rather than in its style, so they have to be carried over. */
function copyRuntimeImages(live: MapLibreMap, print: MapLibreMap): void {
  for (const id of live.listImages()) {
    if (print.hasImage(id)) continue;
    const image = live.getImage(id);
    print.addImage(id, image.data, image);
  }
}

/**
 * A second MapLibre map, off screen at the page's own pixel size, so the page
 * carries print detail instead of the screen's. Null when the live view is not
 * MapLibre, which leaves the caller on its live frame.
 */
export async function printResolutionCapture(
  size: PrintCanvasSize,
): Promise<PrintCapture | null> {
  if (useAppStore.getState().renderer !== 'maplibre') return null;
  const live = getActiveMapLibre();
  if (!live) return null;

  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = `${OFFSCREEN_LEFT_PX}px`;
  container.style.top = '0';
  container.style.width = `${size.cssWidth}px`;
  container.style.height = `${size.cssHeight}px`;
  container.style.pointerEvents = 'none';
  document.body.appendChild(container);

  const view = readMapLibreCamera(live);
  const liveCanvas = live.getCanvas();
  const map = new maplibregl.Map({
    container,
    style: { ...live.getStyle(), projection: live.getProjection() },
    center: [view.longitude, view.latitude],
    zoom: printZoom(view.zoom, liveCanvas.clientWidth || liveCanvas.width, size.cssWidth),
    pitch: view.pitch,
    bearing: view.bearing,
    maxPitch: live.getMaxPitch(),
    minZoom: null,
    maxZoom: MAX_PRINT_ZOOM,
    pixelRatio: size.pixelRatio,
    maxCanvasSize: [MAX_SIDE, MAX_SIDE],
    interactive: false,
    attributionControl: false,
    fadeDuration: 0,
    canvasContextAttributes: { preserveDrawingBuffer: true },
  });
  map.once('style.load', () => copyRuntimeImages(live, map));

  const dispose = () => {
    map.remove();
    container.remove();
  };
  try {
    await maplibreSettled(map);
  } catch (error) {
    dispose();
    throw error;
  }
  return { capture: maplibreCapture(map), dispose };
}
