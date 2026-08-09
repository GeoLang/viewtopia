import type { Corners } from './worldFile';
import { bboxOfCorners, type LonLatBbox } from './georeference';

/**
 * A rotated or reprojected image resampled north-up, because every renderer
 * drapes an AgentRasterLayer onto an axis-aligned bbox. The warp maps the
 * source onto the parallelogram spanned by three corners; the fourth corner's
 * residual from reprojection is accepted, it is negligible at site-plan
 * extents.
 */

const MAX_OUTPUT_DIMENSION = 4096;

export function resampleNorthUp(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  cornersLonLat: Corners,
): { url: string; bbox: LonLatBbox } {
  const bbox = bboxOfCorners(cornersLonLat);
  const [west, south, east, north] = bbox;
  const lonSpan = east - west;
  const latSpan = north - south;
  if (lonSpan <= 0 || latSpan <= 0) throw new Error('overlay has no extent');

  const sourceDiagonal = Math.hypot(sourceWidth, sourceHeight);
  const scale = Math.min(
    MAX_OUTPUT_DIMENSION / Math.max(lonSpan, latSpan),
    (sourceDiagonal / Math.hypot(lonSpan, latSpan)) * Math.SQRT2,
  );
  const outputWidth = Math.max(1, Math.round(lonSpan * scale));
  const outputHeight = Math.max(1, Math.round(latSpan * scale));

  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('canvas 2d context unavailable');

  const toCanvas = ([lng, lat]: [number, number]): [number, number] => [
    ((lng - west) / lonSpan) * outputWidth,
    ((north - lat) / latSpan) * outputHeight,
  ];
  const [topLeft, topRight, , bottomLeft] = cornersLonLat.map(toCanvas);

  context.setTransform(
    (topRight[0] - topLeft[0]) / sourceWidth,
    (topRight[1] - topLeft[1]) / sourceWidth,
    (bottomLeft[0] - topLeft[0]) / sourceHeight,
    (bottomLeft[1] - topLeft[1]) / sourceHeight,
    topLeft[0],
    topLeft[1],
  );
  context.drawImage(source, 0, 0, sourceWidth, sourceHeight);
  return { url: canvas.toDataURL('image/png'), bbox };
}
