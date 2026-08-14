import type { AtlasPage } from './atlas';
import type { MapCapture } from './capture';
import { composePage, fitRect, type LegendGroup, mapFrameMm, type PageSetup } from './page';
import type { PdfPage } from './pdf';
import { type PrintCanvasSize, printCanvasSize, printResolutionCapture } from './printMap';

export interface PrintOptions {
  setup: PageSetup;
  title: string;
  legend: LegendGroup[];
  scaleBar: boolean;
  northArrow: boolean;
  /** null prints the view as it stands, otherwise one page per atlas entry */
  atlas: AtlasPage[] | null;
  /** the resolution the page asks the map for, where the renderer can draw for the page */
  dpi: number;
}

function captureSize(capture: MapCapture): { width: number; height: number } {
  const canvas = capture.canvas();
  // a hidden or headless canvas reports no layout size, but still has pixels
  return {
    width: canvas.clientWidth || canvas.width,
    height: canvas.clientHeight || canvas.height,
  };
}

/**
 * The canvas the page wants: the millimetres the map lands in, which is the
 * frame cut to the live view's aspect, at the requested DPI.
 */
function printCanvasFor(capture: MapCapture, options: PrintOptions): PrintCanvasSize {
  const frame = mapFrameMm(options.setup, {
    // every atlas page is titled, so the band is there whatever the panel's title is
    title: options.atlas?.[0]?.title ?? options.title,
    legend: options.legend,
  });
  const live = captureSize(capture);
  const rect = fitRect(frame, live.height > 0 ? live.width / live.height : 0);
  return printCanvasSize(rect.width, rect.height, options.dpi);
}

function pageFor(capture: MapCapture, options: PrintOptions, title: string): PdfPage {
  capture.renderFrame();
  const elements = composePage(options.setup, {
    title,
    legend: options.legend,
    camera: capture.camera(),
    scaleBar: options.scaleBar,
    northArrow: options.northArrow,
    mapSize: captureSize(capture),
  });
  return { setup: options.setup, elements, mapImage: capture.canvas().toDataURL('image/png') };
}

/**
 * Composes every page, moving the camera per atlas entry and putting it back
 * afterwards, including when a page fails: the map on screen is the user's, not
 * ours to leave somewhere else.
 */
async function composePages(capture: MapCapture, options: PrintOptions): Promise<PdfPage[]> {
  if (!options.atlas) return [pageFor(capture, options, options.title)];

  const restore = capture.saveView();
  try {
    const pages: PdfPage[] = [];
    for (const entry of options.atlas) {
      await capture.showBounds(entry.bounds);
      pages.push(pageFor(capture, options, entry.title));
    }
    return pages;
  } finally {
    await restore();
  }
}

/**
 * Pages off a map drawn at the page's resolution where the renderer has one,
 * off the live frame where it does not.
 */
export async function buildPdfPages(
  capture: MapCapture,
  options: PrintOptions,
): Promise<PdfPage[]> {
  const print = await printResolutionCapture(printCanvasFor(capture, options));
  try {
    return await composePages(print?.capture ?? capture, options);
  } finally {
    print?.dispose();
  }
}
