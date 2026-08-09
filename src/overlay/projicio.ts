import init, { transform_coordinates } from './wasm/projicio_wasm';
import type { Corners } from './worldFile';

/**
 * Projections backed by projicio compiled to WASM (src/overlay/wasm/), the
 * same CRS engine the platform runs server-side. The module initializes on
 * first use with the bundled .wasm URL; tests use initSync over the file
 * bytes.
 */

let ready: Promise<unknown> | null = null;

async function projicioReady(): Promise<void> {
  ready ??= init({ module_or_path: new URL('./wasm/projicio_wasm_bg.wasm', import.meta.url) });
  await ready;
}

/** Corners through the .prj's coordinate system into lon/lat. */
export async function cornersToLonLat(
  corners: Corners,
  projectionWkt: string | null,
): Promise<Corners> {
  if (!projectionWkt) {
    for (const [x, y] of corners) {
      if (Math.abs(x) > 180 || Math.abs(y) > 90) {
        throw new Error(
          'world file coordinates are not lon/lat, include the .prj sidecar naming their coordinate system',
        );
      }
    }
    return corners;
  }
  await projicioReady();
  let flat: Float64Array;
  try {
    flat = transform_coordinates(projectionWkt, 'EPSG:4326', new Float64Array(corners.flat()));
  } catch (err) {
    throw new Error(
      `could not read the .prj coordinate system: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return [
    [flat[0], flat[1]],
    [flat[2], flat[3]],
    [flat[4], flat[5]],
    [flat[6], flat[7]],
  ];
}
