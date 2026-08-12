import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import type { StyleSpecification } from 'maplibre-gl';
import {
  BASEMAP_TILES,
  BASEMAP_OPTIONS,
  BASEMAP_SELECT_GROUPS,
  VECTOR_BASEMAPS,
  VECTOR_APPROX_RASTER,
  isPmtilesUrl,
  isVectorBasemap,
  maplibreRasterStyle,
  maplibreStyle,
  pmtilesStyle,
  rasterTiles,
} from '../../src/hooks/basemapTiles';
import { cachedTileUrl } from '../../src/offline/tileProtocol';
import { useAppStore } from '../../src/store/app';

const asStyle = (s: StyleSpecification | string): StyleSpecification => {
  expect(typeof s).toBe('object');
  return s as StyleSpecification;
};

describe('vector basemaps', () => {
  it('are OpenFreeMap styles that need no API key', () => {
    expect(Object.keys(VECTOR_BASEMAPS)).toEqual(['liberty', 'bright', 'positron', 'dark']);
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
    expect(isVectorBasemap('dark')).toBe(true);
    expect(isVectorBasemap('osm')).toBe(false);
    expect(isVectorBasemap('satellite')).toBe(false);
  });
});

describe('raster basemaps', () => {
  it('keeps the three raster sources for Cesium, deck.gl and Leaflet', () => {
    expect(Object.keys(BASEMAP_TILES)).toEqual(['osm', 'satellite', 'topo']);
  });

  it('builds a raster style with the cache-backed tile URL and attribution', () => {
    const style = asStyle(maplibreStyle('osm'));
    expect(style.sources.basemap).toMatchObject({
      type: 'raster',
      tiles: [cachedTileUrl(BASEMAP_TILES.osm.url)],
      attribution: BASEMAP_TILES.osm.attr,
    });
    expect(style.layers).toEqual([{ id: 'basemap', type: 'raster', source: 'basemap' }]);
  });

  it('resolves vector selections to their approximating raster, unknown to liberty', () => {
    expect(rasterTiles('liberty')).toBe(VECTOR_APPROX_RASTER.liberty);
    expect(rasterTiles('selfhosted')).toBe(VECTOR_APPROX_RASTER.selfhosted);
    expect(rasterTiles('nope')).toBe(VECTOR_APPROX_RASTER.liberty);
    expect(rasterTiles('topo')).toBe(BASEMAP_TILES.topo);
  });

  it('keeps maplibreRasterStyle usable on its own', () => {
    const style = maplibreRasterStyle('satellite');
    expect(style.sources.basemap).toMatchObject({
      tiles: [cachedTileUrl(BASEMAP_TILES.satellite.url)],
    });
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
    expect(style.sprite).toBe('/basemaps-assets/sprites/v4/dark');
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
    expect(pmtilesStyle(url, 'light').sprite).toBe('/basemaps-assets/sprites/v4/light');
  });

  it('trims whitespace out of the pmtiles:// URL', () => {
    const style = asStyle(maplibreStyle('selfhosted', `  ${url} `));
    expect(style.sources.protomaps).toMatchObject({ url: `pmtiles://${url}` });
  });
});

describe('bundled Protomaps glyphs and sprites', () => {
  const url = 'https://example.org/planet.pmtiles';
  const publicDir = join(dirname(fileURLToPath(import.meta.url)), '../../public');
  const publicPath = (path: string) => join(publicDir, path);

  /** font names sit inside ["literal", [...]] once the style switches font by script */
  const literalArrays = (node: unknown, found: string[][]): string[][] => {
    if (!Array.isArray(node)) return found;
    if (node[0] === 'literal' && Array.isArray(node[1])) {
      found.push(node[1]);
      return found;
    }
    for (const child of node) literalArrays(child, found);
    return found;
  };

  const fontstacks = (textFont: unknown): string[] => {
    if (!Array.isArray(textFont)) return [];
    if (textFont.every((entry) => typeof entry === 'string')) return textFont;
    return literalArrays(textFont, []).flat();
  };

  it('ships every font the style asks for', () => {
    const fonts = new Set(
      pmtilesStyle(url).layers.flatMap((layer) =>
        'layout' in layer ? fontstacks(layer.layout?.['text-font']) : [],
      ),
    );
    expect(fonts.size).toBeGreaterThan(0);
    for (const font of fonts) {
      expect(readdirSync(publicPath(`/basemaps-assets/fonts/${font}`)).length).toBeGreaterThan(0);
    }
  });

  it('ships the sprite sheet each flavor points at', () => {
    for (const flavor of ['dark', 'light']) {
      const sprite = pmtilesStyle(url, flavor).sprite as string;
      expect(existsSync(publicPath(`${sprite}.json`))).toBe(true);
      expect(existsSync(publicPath(`${sprite}.png`))).toBe(true);
    }
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
  it('starts MapLibre on the OpenFreeMap dark vector style', () => {
    expect(useAppStore.getState().renderer).toBe('maplibre');
    expect(useAppStore.getState().basemap).toBe('dark');
    expect(useAppStore.getState().settings.defaultRenderer).toBe('maplibre');
    expect(useAppStore.getState().settings.defaultBasemap).toBe('dark');
    expect(maplibreStyle(useAppStore.getState().basemap)).toBe(VECTOR_BASEMAPS.dark.styleUrl);
  });

  it('approximates the default vector style with a raster for the other renderers', () => {
    // MapLibre shows the dark vector style; Cesium/deck.gl show the closest
    // raster so all three look approximately the same.
    expect(rasterTiles(useAppStore.getState().basemap)).toBe(VECTOR_APPROX_RASTER.dark);
  });

  it('maps each vector style to a distinct approximating raster', () => {
    expect(rasterTiles('positron')).toBe(VECTOR_APPROX_RASTER.positron);
    expect(rasterTiles('bright')).toBe(VECTOR_APPROX_RASTER.bright);
    expect(rasterTiles('dark')).toBe(VECTOR_APPROX_RASTER.dark);
    // raster basemaps resolve to themselves
    expect(rasterTiles('satellite')).toBe(BASEMAP_TILES.satellite);
    expect(rasterTiles('topo')).toBe(BASEMAP_TILES.topo);
  });
});
