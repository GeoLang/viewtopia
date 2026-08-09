import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// bundled worker, so PDF import works offline like the rest of the app
GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/** Wide enough that plan text stays readable when draped over the map. */
const PDF_RENDER_WIDTH = 2048;

export interface RenderedPdfPage {
  canvas: HTMLCanvasElement;
  pageCount: number;
}

export async function renderPdfPage(
  data: ArrayBuffer,
  pageNumber: number,
): Promise<RenderedPdfPage> {
  const loadingTask = getDocument({ data });
  try {
    const pdf = await loadingTask.promise;
    const pageCount = pdf.numPages;
    const page = await pdf.getPage(Math.min(Math.max(1, pageNumber), pageCount));
    const baseViewport = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: PDF_RENDER_WIDTH / baseViewport.width });

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    await page.render({ canvas, viewport }).promise;
    return { canvas, pageCount };
  } finally {
    void loadingTask.destroy();
  }
}
