/**
 * The COG write with the wasm module stubbed, so what is asserted is the call
 * the wrapper builds: sample format, nodata and the geo frame. The writer
 * itself is covered by terrano's own GDAL-validated tests.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/raster/wasm/terrano_wasm', () => ({ writeCog: vi.fn() }));

import { terranoWriteCog } from '../../src/raster/terrano';
import { writeCog } from '../../src/raster/wasm/terrano_wasm';

const BBOX: [number, number, number, number] = [10, 40, 12, 44];

/** the positional arguments terrano-wasm takes, by name */
function lastCall() {
  const [
    data,
    width,
    height,
    nodata,
    epsg,
    originX,
    originY,
    pixelWidth,
    pixelHeight,
    tileSize,
    overviewLevels,
    deflate,
    sampleFormat,
  ] = vi.mocked(writeCog).mock.calls.at(-1) ?? [];
  return {
    data,
    width,
    height,
    nodata,
    epsg,
    originX,
    originY,
    pixelWidth,
    pixelHeight,
    tileSize,
    overviewLevels,
    deflate,
    sampleFormat,
  };
}

beforeEach(() => {
  vi.mocked(writeCog).mockReset();
  vi.mocked(writeCog).mockReturnValue(new Uint8Array([73, 73, 42, 0]));
});

describe('writing a loaded raster as a COG', () => {
  it('writes an 8-bit band as u8 rather than widening it', () => {
    const band = new Float32Array([0, 1, 2, 3]);

    terranoWriteCog(band, 2, 2, BBOX, 'EPSG:4326', 'u8', null);

    expect(lastCall().sampleFormat).toBe('u8');
    expect(Array.from(lastCall().data ?? [])).toEqual([0, 1, 2, 3]);
  });

  it('writes a float band as f32 with NaN for absent', () => {
    const band = new Float32Array([1.5, Number.NaN, 3.5, 4.5]);

    terranoWriteCog(band, 2, 2, BBOX, 'EPSG:4326', 'f32', null);

    expect(lastCall().sampleFormat).toBe('f32');
    expect(Number.isNaN(lastCall().nodata)).toBe(true);
  });

  it('takes an unused sample as nodata on an integer format', () => {
    const band = new Float32Array([0, 1, 2, 3]);

    terranoWriteCog(band, 2, 2, BBOX, 'EPSG:4326', 'u8', null);
    expect(lastCall().nodata).toBe(255);

    terranoWriteCog(band, 2, 2, BBOX, 'EPSG:4326', 'i16', null);
    expect(lastCall().nodata).toBe(-32768);
  });

  it('steps past a sample the band uses', () => {
    const band = new Float32Array([255, 254, 1, 2]);

    terranoWriteCog(band, 2, 2, BBOX, 'EPSG:4326', 'u8', null);

    expect(lastCall().nodata).toBe(253);
  });

  it('keeps the source nodata when the format can hold it', () => {
    const band = new Float32Array([100, -9999, 300, 400]);

    terranoWriteCog(band, 2, 2, BBOX, 'EPSG:4326', 'i16', -9999);

    expect(lastCall().nodata).toBe(-9999);
  });

  it('drops a source nodata the format cannot hold', () => {
    const band = new Float32Array([0, 1, 2, 3]);

    terranoWriteCog(band, 2, 2, BBOX, 'EPSG:4326', 'u8', -9999);

    expect(lastCall().nodata).toBe(255);
  });

  it('georeferences from the bbox and the size actually read', () => {
    const band = new Float32Array(8);

    terranoWriteCog(band, 4, 2, BBOX, 'EPSG:32632', 'f32', null);

    const call = lastCall();
    expect(call.epsg).toBe(32632);
    expect(call.originX).toBe(10);
    expect(call.originY).toBe(44);
    expect(call.pixelWidth).toBe(0.5);
    expect(call.pixelHeight).toBe(2);
    expect(call.tileSize).toBe(512);
    expect(call.overviewLevels).toBeGreaterThan(0);
    expect(call.deflate).toBe(true);
  });

  it('refuses a raster whose CRS is not an EPSG code', () => {
    const band = new Float32Array(4);

    expect(() => terranoWriteCog(band, 2, 2, BBOX, 'unknown', 'f32', null)).toThrow(/EPSG/);
    expect(writeCog).not.toHaveBeenCalled();
  });

  it('lets a writer failure through to the caller', () => {
    vi.mocked(writeCog).mockImplementation(() => {
      throw new Error('unknown sample format q8, expected one of u8, i8');
    });

    expect(() =>
      terranoWriteCog(new Float32Array(4), 2, 2, BBOX, 'EPSG:4326', 'f32', null),
    ).toThrow('unknown sample format q8, expected one of u8, i8');
  });
});
