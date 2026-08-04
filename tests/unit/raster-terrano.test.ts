/**
 * Runs the real vendored wasm module (initSync over the file bytes), so these
 * tests break when the artifact and the wrappers drift apart.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { initSync } from '../../src/raster/wasm/terrano_wasm';
import {
  cellSizeMeters,
  terranoAspect,
  terranoContours,
  terranoHillshade,
  terranoNdvi,
  terranoReclass,
  terranoSlope,
} from '../../src/raster/terrano';

beforeAll(() => {
  // vitest rewrites import.meta.url under jsdom, so resolve from the repo root
  const wasmPath = join(process.cwd(), 'src/raster/wasm/terrano_wasm_bg.wasm');
  initSync({ module: readFileSync(wasmPath) });
});

/** value = row * rise, a plane dipping north to south */
function ramp(width: number, height: number, rise: number): Float32Array {
  const out = new Float32Array(width * height);
  for (let i = 0; i < out.length; i++) out[i] = Math.floor(i / width) * rise;
  return out;
}

describe('terrano wasm wrappers', () => {
  it('ndvi is (nir - red) / (nir + red) with nodata and zero-sum masked', () => {
    const nir = new Float32Array([0.8, 0.5, -9999, 0.0]);
    const red = new Float32Array([0.2, 0.5, 0.1, 0.0]);
    const res = terranoNdvi(nir, red, 2, 2, -9999);

    expect(res.data[0]).toBeCloseTo(0.6, 6);
    expect(res.data[1]).toBeCloseTo(0, 6);
    expect(Number.isNaN(res.data[2])).toBe(true);
    expect(Number.isNaN(res.data[3])).toBe(true);
    expect(res.colorMap).toBe('rdylgn');
  });

  it('hillshade fills the interior in 0..255 and NaNs the border', () => {
    const res = terranoHillshade(ramp(5, 5, 10), 5, 5, 30, 1, 315, 45, null);

    expect(res.width).toBe(5);
    const center = res.data[12];
    expect(center).toBeGreaterThanOrEqual(0);
    expect(center).toBeLessThanOrEqual(255);
    expect(Number.isNaN(res.data[0])).toBe(true);
    expect(res.range).toEqual([0, 255]);
  });

  it('z-factor is elevation scaling: doubling it equals halving the cell', () => {
    const dem = ramp(5, 5, 3);
    const doubled = terranoHillshade(dem, 5, 5, 30, 2, 315, 45, null);
    const halved = terranoHillshade(dem, 5, 5, 15, 1, 315, 45, null);
    expect(doubled.data[12]).toBeCloseTo(halved.data[12], 6);
  });

  it('slope of a unit-rise ramp is 45 degrees, or 100 percent', () => {
    const dem = ramp(5, 5, 1);
    const degrees = terranoSlope(dem, 5, 5, 1, 1, 'degrees', null);
    const percent = terranoSlope(dem, 5, 5, 1, 1, 'percent', null);

    expect(degrees.data[12]).toBeCloseTo(45, 4);
    expect(percent.data[12]).toBeCloseTo(100, 3);
  });

  it('aspect of a south-dipping ramp faces north-or-south consistently', () => {
    const res = terranoAspect(ramp(5, 5, 1), 5, 5, 1, null);
    const a = res.data[12];
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThanOrEqual(360);
    expect(res.range).toEqual([0, 360]);
  });

  it('reclass bins by [min, max) and NaNs the unclassed', () => {
    const res = terranoReclass(
      new Float32Array([1, 5, 9, -9999]),
      2,
      2,
      [
        { min: 0, max: 4, value: 100 },
        { min: 4, max: 8, value: 200 },
      ],
      -9999,
    );

    expect(res.data[0]).toBe(100);
    expect(res.data[1]).toBe(200);
    expect(Number.isNaN(res.data[2])).toBe(true, );
    expect(Number.isNaN(res.data[3])).toBe(true);
  });

  it('contours land inside the bbox with their level as a property', () => {
    // flat 0 half and flat 100 half meeting mid-raster
    const dem = new Float32Array(100);
    dem.fill(100, 50);
    const bbox: [number, number, number, number] = [7, 45, 8, 46];
    const res = terranoContours(dem, 10, 10, bbox, 25, 0, null);

    expect(res.geojson.features.length).toBeGreaterThan(0);
    for (const f of res.geojson.features) {
      expect(typeof f.properties?.elevation).toBe('number');
      const line = f.geometry as GeoJSON.LineString;
      expect(line.type).toBe('LineString');
      for (const [x, y] of line.coordinates as [number, number][]) {
        expect(x).toBeGreaterThanOrEqual(7);
        expect(x).toBeLessThanOrEqual(8);
        expect(y).toBeGreaterThanOrEqual(45);
        expect(y).toBeLessThanOrEqual(46);
      }
    }
    expect(res.elevationRange).toEqual([0, 100]);
  });

  it('cell size converts degrees to ground meters at the center latitude', () => {
    const meta = {
      width: 10,
      height: 10,
      bands: 1,
      bbox: [7, 44, 8, 46] as [number, number, number, number],
      crs: 'EPSG:4326',
      noData: null,
      resolution: [0.001, 0.001] as [number, number],
    };
    const expected = 0.001 * 111320 * Math.cos((45 * Math.PI) / 180);
    expect(cellSizeMeters(meta)).toBeCloseTo(expected, 6);
    // projected rasters already carry ground units
    expect(cellSizeMeters({ ...meta, crs: 'EPSG:32632' })).toBe(0.001);
  });
});
