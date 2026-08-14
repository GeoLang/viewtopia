import type { MapCapture } from './capture';

/** CSS reference resolution: at 96 DPI the requested pixels are the output pixels. */
const CSS_DPI = 96;

/** Chrome refuses to encode a canvas larger than this on a side. */
const MAX_SIDE = 8192;

export type ImageFormat = 'png' | 'jpg';

/**
 * Output pixels for a width/height in CSS pixels at the requested DPI. Both sides
 * shrink by the same factor when the DPI would take one past MAX_SIDE, so the
 * aspect ratio survives the clamp.
 */
export function exportPixelSize(
  width: number,
  height: number,
  dpi: number,
): { width: number; height: number } {
  const scale = Math.max(dpi, 1) / CSS_DPI;
  const w = Math.max(1, width) * scale;
  const h = Math.max(1, height) * scale;
  const clamp = Math.min(1, MAX_SIDE / Math.max(w, h));
  return { width: Math.round(w * clamp), height: Math.round(h * clamp) };
}

/**
 * The live frame scaled to the output size, so a bigger export is the same view
 * rather than more detail.
 */
export function mapImageDataUrl(
  capture: MapCapture,
  format: ImageFormat,
  size: { width: number; height: number },
): string {
  capture.renderFrame();
  const out = document.createElement('canvas');
  out.width = size.width;
  out.height = size.height;
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('Export failed, the browser gave no 2D context');
  if (format === 'jpg') {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, out.width, out.height);
  }
  ctx.drawImage(capture.canvas(), 0, 0, out.width, out.height);
  return out.toDataURL(format === 'jpg' ? 'image/jpeg' : 'image/png');
}
