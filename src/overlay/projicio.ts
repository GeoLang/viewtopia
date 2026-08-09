import { GridsUnavailableError, registerMissingGrids } from './grids';
import init, { register_grid, transform_coordinates } from './wasm/projicio_wasm';
import type { Corners } from './georeference';

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

/** Register a user supplied datum grid under its filename, which is the name a
 * definition's +nadgrids list matches against. */
export async function registerDroppedGrid(name: string, bytes: Uint8Array): Promise<void> {
  await projicioReady();
  register_grid(name, bytes);
}

async function toLonLat(projectionWkt: string, flat: Float64Array): Promise<Float64Array> {
  try {
    return transform_coordinates(projectionWkt, 'EPSG:4326', flat);
  } catch (err) {
    try {
      await registerMissingGrids(projectionWkt, err);
      return transform_coordinates(projectionWkt, 'EPSG:4326', flat);
    } catch (afterGrids) {
      if (afterGrids instanceof GridsUnavailableError) {
        throw afterGrids;
      }
      throw new Error(
        `could not read the .prj coordinate system: ${afterGrids instanceof Error ? afterGrids.message : String(afterGrids)}`,
      );
    }
  }
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
  const flat = await toLonLat(projectionWkt, new Float64Array(corners.flat()));
  return [
    [flat[0], flat[1]],
    [flat[2], flat[3]],
    [flat[4], flat[5]],
    [flat[6], flat[7]],
  ];
}
