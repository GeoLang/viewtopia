/**
 * Runs the real vendored projicio wasm module (initSync over the file bytes), so
 * missing_grids and register_grid are the ones the app ships. Only fetch is faked.
 *
 * Grid registration lasts for the life of the wasm instance and a name can be
 * registered once, so every test uses grid names of its own.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { GridsUnavailableError, registerMissingGrids } from '../../src/overlay/grids';
import { cornersToLonLat } from '../../src/overlay/projicio';
import { initSync, registered_grids } from '../../src/overlay/wasm/projicio_wasm';
import { syntheticNtv2 } from './stubs/syntheticNtv2';

beforeAll(() => {
  const wasmPath = join(process.cwd(), 'src/overlay/wasm/projicio_wasm_bg.wasm');
  initSync({ module: readFileSync(wasmPath) });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const NAD27_PRJ =
  'GEOGCS["NAD27",DATUM["North_American_Datum_1927",SPHEROID["Clarke 1866",6378206.4,294.9786982138982,AUTHORITY["EPSG","7008"]],AUTHORITY["EPSG","6267"]],PRIMEM["Greenwich",0,AUTHORITY["EPSG","8901"]],UNIT["degree",0.0174532925199433,AUTHORITY["EPSG","9122"]],AUTHORITY["EPSG","4267"]]';

const ARC_SECOND = 1 / 3600;

/** A projstring needing every named grid, none of which any other test registers. */
function specNeeding(...gridNames: string[]): string {
  return `+proj=longlat +ellps=clrk66 +nadgrids=${gridNames.map((name) => `@${name}`).join(',')}`;
}

async function rejection(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof Error) {
      return err;
    }
    throw new Error(`expected an Error, got ${String(err)}`);
  }
  throw new Error('expected a rejection');
}

function serveGrids(available: Record<string, Uint8Array>) {
  const calls: string[] = [];
  const fetchGrid = vi.fn(async (url: RequestInfo | URL) => {
    const name = String(url).replace('/grids/', '');
    calls.push(name);
    const bytes = available[name];
    if (!bytes) {
      return new Response(null, { status: 404 });
    }
    return new Response(bytes, { status: 200 });
  });
  vi.stubGlobal('fetch', fetchGrid);
  return { fetchGrid, calls };
}

describe('registerMissingGrids', () => {
  it('rethrows the transform error when no grid is missing', async () => {
    const { fetchGrid } = serveGrids({});
    const original = new Error('the projection itself is broken');
    await expect(registerMissingGrids('EPSG:32618', original)).rejects.toBe(original);
    expect(fetchGrid).not.toHaveBeenCalled();
  });

  it('moves on to the next candidate when one is not served', async () => {
    const grid = syntheticNtv2(0, 4, 0, 4, 1, 1, 1);
    const { calls } = serveGrids({ 'served-second.gsb': grid });

    await registerMissingGrids(specNeeding('absent-first.gsb', 'served-second.gsb'), new Error('x'));

    expect(calls).toEqual(['absent-first.gsb', 'served-second.gsb']);
    expect(registered_grids()).toContain('served-second.gsb');
    expect(registered_grids()).not.toContain('absent-first.gsb');
  });

  it('names every grid it tried when none can be loaded', async () => {
    serveGrids({});
    const spec = specNeeding('nowhere-a.gsb', 'nowhere-b.gsb');

    const failure = await rejection(registerMissingGrids(spec, new Error('x')));

    expect(failure).toBeInstanceOf(GridsUnavailableError);
    expect(failure.message).toContain('nowhere-a.gsb');
    expect(failure.message).toContain('nowhere-b.gsb');
    expect(failure.message).toContain('/grids/');
    expect(failure.message).toContain('.gsb sidecar');
  });

  it('rejects a grid whose bytes do not parse', async () => {
    const { calls } = serveGrids({ 'garbage.gsb': new Uint8Array(500) });

    await expect(registerMissingGrids(specNeeding('garbage.gsb'), new Error('x'))).rejects.toThrow(
      GridsUnavailableError,
    );
    expect(calls).toEqual(['garbage.gsb']);
  });

  it('does not fetch a grid it already tried', async () => {
    const { fetchGrid } = serveGrids({});
    const spec = specNeeding('memo-a.gsb', 'memo-b.gsb');

    await expect(registerMissingGrids(spec, new Error('x'))).rejects.toThrow(GridsUnavailableError);
    expect(fetchGrid).toHaveBeenCalledTimes(2);

    await expect(registerMissingGrids(spec, new Error('x'))).rejects.toThrow(GridsUnavailableError);
    expect(fetchGrid).toHaveBeenCalledTimes(2);
  });
});

describe('cornersToLonLat with a datum shift grid', () => {
  it('fetches the grid a NAD27 .prj needs and applies its shift', async () => {
    // the lower 48, shifting every point 1 arc second north and 2 arc seconds west
    const conus = syntheticNtv2(20, 50, 60, 130, 10, 1, 2);
    const { calls } = serveGrids({ conus });

    const corners = await cornersToLonLat(
      [
        [-100, 35],
        [-99, 35],
        [-99, 34],
        [-100, 34],
      ],
      NAD27_PRJ,
    );

    expect(calls[0]).toBe('alaska');
    expect(calls).toContain('conus');
    expect(registered_grids()).toContain('conus');
    expect(corners[0][0]).toBeCloseTo(-100 - 2 * ARC_SECOND, 9);
    expect(corners[0][1]).toBeCloseTo(35 + 1 * ARC_SECOND, 9);
    expect(corners[2][0]).toBeCloseTo(-99 - 2 * ARC_SECOND, 9);
    expect(corners[2][1]).toBeCloseTo(34 + 1 * ARC_SECOND, 9);
  });
});
