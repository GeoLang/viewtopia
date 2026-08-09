import { missing_grids, register_grid } from './wasm/projicio_wasm';

/**
 * Datum shift grids, fetched when a transform turns out to need one.
 *
 * projicio ships no grid data, so a CRS like NAD27 only transforms once a `.gsb`
 * is registered with the wasm module. The names projicio reports are alternatives:
 * any single one of them satisfies the definition, so the first that loads wins.
 * Registration lasts for the life of the page.
 */

const GRID_URL_PREFIX = '/grids/';

/** Thrown when the CRS needs a grid and none of its alternatives could be loaded. */
export class GridsUnavailableError extends Error {
  readonly gridsTried: string[];

  constructor(gridsTried: string[]) {
    super(
      `this coordinate system needs a datum shift grid: tried ${gridsTried.join(', ')} under ` +
        `${GRID_URL_PREFIX}, any one of which would do. supply one as a .gsb sidecar ` +
        'alongside the .prj',
    );
    this.name = 'GridsUnavailableError';
    this.gridsTried = gridsTried;
  }
}

const attempts = new Map<string, Promise<boolean>>();

async function fetchAndRegister(name: string): Promise<boolean> {
  const response = await fetch(`${GRID_URL_PREFIX}${name}`);
  if (!response.ok) {
    return false;
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  try {
    register_grid(name, bytes);
  } catch {
    return false;
  }
  return true;
}

function attemptOnce(name: string): Promise<boolean> {
  let attempt = attempts.get(name);
  if (!attempt) {
    attempt = fetchAndRegister(name).catch(() => false);
    attempts.set(name, attempt);
  }
  return attempt;
}

/**
 * Register a grid the spec is missing, so the caller can retry the transform.
 *
 * Returns once one is registered. Rethrows `transformError` when the spec needs no
 * grid at all, and throws {@link GridsUnavailableError} when every alternative failed.
 */
export async function registerMissingGrids(spec: string, transformError: unknown): Promise<void> {
  const missing = missing_grids(spec);
  if (missing.length === 0) {
    throw transformError;
  }
  for (const name of missing) {
    if (await attemptOnce(name)) {
      return;
    }
  }
  throw new GridsUnavailableError(missing);
}
