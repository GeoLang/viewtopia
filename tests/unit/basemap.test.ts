import { describe, it, expect } from 'vitest';
import type { StyleSpecification } from 'maplibre-gl';
import {
  BASEMAP_TILES,
  BASEMAP_OPTIONS,
  BASEMAP_SELECT_GROUPS,
  VECTOR_BASEMAPS,
  isPmtilesUrl,
  isVectorBasemap,
  maplibreRasterStyle,
  maplibreStyle,
  pmtilesStyle,
  rasterTiles,
} from '../../src/hooks/basemapTiles';
import { useAppStore } from '../../src/store/app';

const asStyle = (s: StyleSpecification | string): StyleSpecification => {
  expect(typeof s).toBe('object');
  return s as StyleSpecification;
};

describe('vector basemaps', () => {
  it('are OpenFreeMap styles that need no API key', () => {
    expect(Object.keys(VECTOR_BASEMAPS)).toEqual(['liberty', 'bright', 'positron']);
    for (const [name, def] of Object.entries(VECTOR_BASEMAPS)) {
      expect(def.styleUrl).toBe(`https://tiles.openfreemap.org/styles/${name}`);
      expect(def.styleUrl).not.toMatch(/[?&]|key|token/i);
    }
  });

  it('resolve to a style URL string for MapLibre', () => {
    expect(maplibreStyle('liberty')).toBe('https://tiles.openfreemap.org/styles/liberty');
    expect(maplibreStyle('bright')).toBe('https://tiles.openfreemap.org/styles/bright');
    expect(maplibreStyle('positron')).toBe('https://tiles.openfreemap.org/styles/positron');
  });

  it('are reported as vector, raster ones are not', () => {
    expect(isVectorBasemap('liberty')).toBe(true);
    expect(isVectorBasemap('selfhosted')).toBe(true);
    expect(isVectorBasemap('osm')).toBe(false);
    expect(isVectorBasemap('dark')).toBe(false);
  });
});

describe('raster basemaps', () => {
  it('keeps the four raster sources for Cesium, deck.gl and Leaflet', () => {
    expect(Object.keys(BASEMAP_TILES)).toEqual(['osm', 'satellite', 'topo', 'dark']);
  });

  it('builds a raster style with the tile URL and attribution', () => {
    const style = asStyle(maplibreStyle('osm'));
    expect(style.sources.basemap).toMatchObject({
      type: 'raster',
      tiles: [BASEMAP_TILES.osm.url],
      attribution: BASEMAP_TILES.osm.attr,
    });
    expect(style.layers).toEqual([{ id: 'basemap', type: 'raster', source: 'basemap' }]);
  });

  it('falls back to dark tiles for vector and unknown basemaps', () => {
    expect(rasterTiles('liberty')).toBe(BASEMAP_TILES.dark);
    expect(rasterTiles('selfhosted')).toBe(BASEMAP_TILES.dark);
    expect(rasterTiles('nope')).toBe(BASEMAP_TILES.dark);
    expect(rasterTiles('topo')).toBe(BASEMAP_TILES.topo);
  });

  it('keeps maplibreRasterStyle usable on its own', () => {
    const style = maplibreRasterStyle('satellite');
    expect(style.sources.basemap).toMatchObject({ tiles: [BASEMAP_TILES.satellite.url] });
  });
});

describe('pmtiles basemaps', () => {
  const url = 'https://files.example.com/planet.pmtiles';

  it('detects .pmtiles URLs, including query and fragment forms', () => {
    expect(isPmtilesUrl(url)).toBe(true);
    expect(isPmtilesUrl('https://x/PLANET.PMTILES')).toBe(true);
    expect(isPmtilesUrl('https://x/planet.pmtiles?v=2')).toBe(true);
    expect(isPmtilesUrl('https://x/planet.pmtiles#z')).toBe(true);
    expect(isPmtilesUrl('  https://x/planet.pmtiles  ')).toBe(true);
    expect(isPmtilesUrl('https://x/style.json')).toBe(false);
    expect(isPmtilesUrl('https://x/pmtiles/style.json')).toBe(false);
  });

  it('builds a Protomaps style around the archive', () => {
    const style = asStyle(maplibreStyle('selfhosted', url));
    expect(style.sources.protomaps).toMatchObject({
      type: 'vector',
      url: `pmtiles://${url}`,
    });
    expect(style.glyphs).toContain('{fontstack}');
    expect(style.sprite).toBe('https://protomaps.github.io/basemaps-assets/sprites/v4/dark');
    expect(style.layers.length).toBeGreaterThan(10);
    expect(style.layers.map((l) => l.id)).toContain('background');
  });

  it('points every non-background layer at the pmtiles source', () => {
    const style = pmtilesStyle(url);
    const sources = new Set(
      style.layers.filter((l) => l.type !== 'background').map((l) => 'source' in l && l.source),
    );
    expect([...sources]).toEqual(['protomaps']);
  });

  it('matches the sprite to the flavor', () => {
    expect(pmtilesStyle(url, 'light').sprite).toBe(
      'https://protomaps.github.io/basemaps-assets/sprites/v4/light',
    );
  });

  it('trims whitespace out of the pmtiles:// URL', () => {
    const style = asStyle(maplibreStyle('selfhosted', `  ${url} `));
    expect(style.sources.protomaps).toMatchObject({ url: `pmtiles://${url}` });
  });
});

describe('self-hosted basemap URLs', () => {
  it('passes a style JSON URL straight to MapLibre', () => {
    expect(maplibreStyle('selfhosted', 'https://tiles.internal/style.json')).toBe(
      'https://tiles.internal/style.json',
    );
  });

  it('falls back to the default vector style when unset', () => {
    expect(maplibreStyle('selfhosted')).toBe('https://tiles.openfreemap.org/styles/liberty');
    expect(maplibreStyle('selfhosted', '   ')).toBe(
      'https://tiles.openfreemap.org/styles/liberty',
    );
  });
});

describe('basemap select groups', () => {
  it('splits vector and raster so the UI can say which renderers apply', () => {
    expect(BASEMAP_SELECT_GROUPS.map((g) => g.group)).toEqual([
      'Vector (MapLibre only)',
      'Raster (all renderers)',
    ]);
    const grouped = BASEMAP_SELECT_GROUPS.flatMap((g) => g.items.map((i) => i.value));
    expect(grouped.sort()).toEqual(BASEMAP_OPTIONS.map((o) => o.value).sort());
    expect(BASEMAP_SELECT_GROUPS[0].items.map((i) => i.value)).toContain('selfhosted');
  });
});

describe('basemap defaults', () => {
  it('starts MapLibre on an OpenFreeMap vector style', () => {
    expect(useAppStore.getState().basemap).toBe('liberty');
    expect(useAppStore.getState().settings.defaultBasemap).toBe('liberty');
    expect(maplibreStyle(useAppStore.getState().basemap)).toBe(
      VECTOR_BASEMAPS.liberty.styleUrl,
    );
  });

  it('leaves the other renderers on raster tiles by default', () => {
    expect(rasterTiles(useAppStore.getState().basemap)).toBe(BASEMAP_TILES.dark);
  });
});
