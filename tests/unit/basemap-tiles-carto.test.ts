import { afterEach, describe, expect, it, vi } from 'vitest';
import { cartoTiles, VECTOR_APPROX_RASTER } from '../../src/hooks/basemapTiles';

afterEach(() => vi.unstubAllEnvs());

describe('cartoTiles', () => {
  it('appends the carto api key when one is configured', () => {
    vi.stubEnv('VITE_CARTO_API_KEY', 'abc123');
    expect(cartoTiles('dark_all')).toBe('https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png?key=abc123');
  });

  it('leaves the url keyless when nothing is configured', () => {
    vi.stubEnv('VITE_CARTO_API_KEY', '');
    expect(cartoTiles('dark_all')).toBe('https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png');
  });

  it('is what the 2d renderer draws for the dark vector style', () => {
    expect(VECTOR_APPROX_RASTER.dark.url).toContain('basemaps.cartocdn.com/dark_all/');
  });
});
