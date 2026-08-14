import type { AtlasPage } from './atlas';
import type { MapCapture } from './capture';
import { composePage, type LegendGroup, type PageSetup } from './page';
import type { PdfPage } from './pdf';

export interface PrintOptions {
  setup: PageSetup;
  title: string;
  legend: LegendGroup[];
  scaleBar: boolean;
  northArrow: boolean;
  /** null prints the view as it stands, otherwise one page per atlas entry */
  atlas: AtlasPage[] | null;
}

function pageFor(capture: MapCapture, options: PrintOptions, title: string): PdfPage {
  capture.renderFrame();
  const canvas = capture.canvas();
  const elements = composePage(options.setup, {
    title,
    legend: options.legend,
    camera: capture.camera(),
    scaleBar: options.scaleBar,
    northArrow: options.northArrow,
    mapSize: {
      // a hidden or headless canvas reports no layout size, but still has pixels
      width: canvas.clientWidth || canvas.width,
      height: canvas.clientHeight || canvas.height,
    },
  });
  return { setup: options.setup, elements, mapImage: canvas.toDataURL('image/png') };
}

/**
 * Composes every page, moving the camera per atlas entry and putting it back
 * afterwards, including when a page fails: the map on screen is the user's, not
 * ours to leave somewhere else.
 */
export async function buildPdfPages(
  capture: MapCapture,
  options: PrintOptions,
): Promise<PdfPage[]> {
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
