/**
 * Canonical basemap definitions used by all renderers.
 *
 * Raster basemaps work everywhere. Vector styles are MapLibre-only, so the
 * other renderers substitute the closest raster (VECTOR_APPROX_RASTER) for them.
 */
import type { StyleSpecification } from 'maplibre-gl';
import { layers, namedFlavor } from '@protomaps/basemaps';
import { cachedTileUrl } from '../offline/tileProtocol';

export type Basemap =
  | 'osm'
  | 'satellite'
  | 'topo'
  | 'dark'
  | 'liberty'
  | 'bright'
  | 'positron'
  | 'selfhosted'
  | 'custom';

/** Raster tiles picked outside the built-in list, e.g. by the basemap catalog plugin. */
export type CustomBasemap = { url: string; attr: string };

export const BASEMAP_TILES: Record<string, { url: string; attr: string }> = {
  osm: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attr: '© OpenStreetMap',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attr: '© Esri',
  },
  topo: {
    url: 'https://tile.opentopomap.org/{z}/{x}/{y}.png',
    attr: '© OpenTopoMap',
  },
};

/**
 * Cesium and deck.gl can't render vector styles, so when a vector basemap is
 * selected they show the raster below that looks closest to it, keeping all
 * three renderers approximately the same. Carto voyager/light/dark are global,
 * key-free XYZ rasters. 'selfhosted' pmtiles renders with the dark flavor.
 */
export const VECTOR_APPROX_RASTER: Record<string, { url: string; attr: string }> = {
  liberty: {
    url: 'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
    attr: '© CARTO © OpenStreetMap',
  },
  bright: {
    url: 'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
    attr: '© CARTO © OpenStreetMap',
  },
  positron: {
    url: 'https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
    attr: '© CARTO © OpenStreetMap',
  },
  dark: {
    url: 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
    attr: '© CARTO © OpenStreetMap',
  },
  selfhosted: {
    url: 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
    attr: '© CARTO © OpenStreetMap',
  },
};

/**
 * OpenFreeMap hosted vector styles: no registration, no API key, no request
 * limits, attribution required (MapLibre adds it from the style).
 * https://openfreemap.org/quick_start/
 */
export const VECTOR_BASEMAPS: Record<string, { styleUrl: string }> = {
  liberty: { styleUrl: 'https://tiles.openfreemap.org/styles/liberty' },
  bright: { styleUrl: 'https://tiles.openfreemap.org/styles/bright' },
  positron: { styleUrl: 'https://tiles.openfreemap.org/styles/positron' },
  dark: { styleUrl: 'https://tiles.openfreemap.org/styles/dark' },
};

/** Vector style MapLibre falls back to when 'selfhosted' has no URL set. */
export const DEFAULT_VECTOR_BASEMAP = 'liberty';

export interface BasemapOption {
  value: Basemap;
  label: string;
  /** raster works in every renderer, vector is MapLibre-only */
  kind: 'raster' | 'vector';
}

export const BASEMAP_OPTIONS: BasemapOption[] = [
  { value: 'liberty', label: 'Liberty', kind: 'vector' },
  { value: 'bright', label: 'Bright', kind: 'vector' },
  { value: 'positron', label: 'Positron', kind: 'vector' },
  { value: 'dark', label: 'Dark', kind: 'vector' },
  { value: 'selfhosted', label: 'Self-hosted', kind: 'vector' },
  { value: 'osm', label: 'OSM', kind: 'raster' },
  { value: 'satellite', label: 'Satellite', kind: 'raster' },
  { value: 'topo', label: 'Topo', kind: 'raster' },
];

/** Mantine Select groups, so the UI says which renderers each group covers. */
export const BASEMAP_SELECT_GROUPS = [
  {
    group: 'Vector (MapLibre only)',
    items: BASEMAP_OPTIONS.filter((o) => o.kind === 'vector').map((o) => ({
      value: o.value,
      label: o.label,
    })),
  },
  {
    group: 'Raster (all renderers)',
    items: BASEMAP_OPTIONS.filter((o) => o.kind === 'raster').map((o) => ({
      value: o.value,
      label: o.label,
    })),
  },
];

export function isVectorBasemap(basemap: string): boolean {
  return basemap in VECTOR_BASEMAPS || basemap === 'selfhosted';
}

/** Raster tiles for a basemap; a vector selection resolves to its closest raster. */
export function rasterTiles(
  basemap: string,
  custom?: CustomBasemap | null,
): { url: string; attr: string } {
  if (basemap === 'custom' && custom) return custom;
  return BASEMAP_TILES[basemap] ?? VECTOR_APPROX_RASTER[basemap] ?? VECTOR_APPROX_RASTER.liberty;
}

export function isPmtilesUrl(url: string): boolean {
  const path = url.trim().split(/[?#]/)[0];
  return path.toLowerCase().endsWith('.pmtiles');
}

/** MapLibre raster style for a basemap. */
export function maplibreRasterStyle(
  basemap: string,
  custom?: CustomBasemap | null,
): StyleSpecification {
  const tile = rasterTiles(basemap, custom);
  return {
    version: 8,
    sources: {
      basemap: {
        type: 'raster',
        // cached:// falls back to the offline tile cache when the network fails
        tiles: [cachedTileUrl(tile.url)],
        tileSize: 256,
        attribution: tile.attr,
      },
    },
    layers: [{ id: 'basemap', type: 'raster', source: 'basemap' }],
  };
}

/** protomaps/basemaps-assets vendored into public/, see scripts/fetch-basemap-assets.sh */
const BASEMAP_ASSETS = '/basemaps-assets';

/**
 * Style for a basemap served from a static .pmtiles archive, using the
 * Protomaps basemap layer set. Needs the pmtiles protocol registered and an
 * archive on the Protomaps v4 tile schema.
 * https://docs.protomaps.com/basemaps/maplibre
 */
export function pmtilesStyle(url: string, flavor = 'dark'): StyleSpecification {
  return {
    version: 8,
    glyphs: `${BASEMAP_ASSETS}/fonts/{fontstack}/{range}.pbf`,
    sprite: `${BASEMAP_ASSETS}/sprites/v4/${flavor}`,
    sources: {
      protomaps: {
        type: 'vector',
        url: `pmtiles://${url.trim()}`,
        attribution:
          '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org">OpenStreetMap</a>',
      },
    },
    layers: layers('protomaps', namedFlavor(flavor), { lang: 'en' }),
  };
}

/**
 * MapLibre style for a basemap. Returns a style URL string for hosted vector
 * styles and a built style object for raster and pmtiles basemaps.
 */
export function maplibreStyle(
  basemap: string,
  selfHostedUrl = '',
  custom?: CustomBasemap | null,
): StyleSpecification | string {
  if (basemap === 'selfhosted') {
    const url = selfHostedUrl.trim();
    if (!url) return VECTOR_BASEMAPS[DEFAULT_VECTOR_BASEMAP].styleUrl;
    return isPmtilesUrl(url) ? pmtilesStyle(url) : url;
  }
  const vector = VECTOR_BASEMAPS[basemap];
  if (vector) return vector.styleUrl;
  return maplibreRasterStyle(basemap, custom);
}
