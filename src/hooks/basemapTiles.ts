/**
 * Canonical basemap definitions used by all renderers.
 *
 * Raster basemaps work everywhere. Vector styles are MapLibre-only, so the
 * other renderers substitute the closest raster (VECTOR_APPROX_RASTER) for them.
 * A local .pmtiles archive has no stand-in at all: rasterTiles returns null and
 * the renderers that cannot read it draw no basemap.
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
  | 'custom'
  | 'local';

/** XYZ raster tiles and the attribution they have to show. */
export interface BasemapTiles {
  url: string;
  attr: string;
}

/** Raster tiles picked outside the built-in list, e.g. by the basemap catalog plugin. */
export type CustomBasemap = BasemapTiles;

/**
 * A .pmtiles archive the user picked off their own disk. It is read through a
 * browser File, which dies with the tab, so a reload keeps the name and asks
 * for the file again instead of drawing something else.
 */
export type LocalBasemap =
  | { name: string; status: 'loaded'; kind: 'vector' | 'raster' }
  | { name: string; status: 'needs-file' };

export const BASEMAP_TILES: Record<string, BasemapTiles> = {
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
export const VECTOR_APPROX_RASTER: Record<string, BasemapTiles> = {
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

/** What a view draws before anyone picks something else. */
export const DEFAULT_BASEMAP: Basemap = 'dark';

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

/** Select group for the archive on disk, kept with the other group labels. */
export function localBasemapSelectGroup(local: LocalBasemap | null) {
  return {
    group: 'Local file (MapLibre only)',
    items: [{ value: 'local', label: local?.name ?? 'PMTiles archive' }],
  };
}

/**
 * Groups for a basemap picker showing `basemap`. A plugin can set tiles outside
 * the built-in list, and a select renders blank on a value with no option, so
 * the local archive and the plugin's entry are added when they are the value.
 */
export function basemapSelectGroups(
  basemap: Basemap,
  local: LocalBasemap | null,
  groups = BASEMAP_SELECT_GROUPS,
) {
  return [
    ...groups,
    ...(local || basemap === 'local' ? [localBasemapSelectGroup(local)] : []),
    ...(basemap === 'custom'
      ? [{ group: 'Plugin', items: [{ value: 'custom', label: 'Custom' }] }]
      : []),
  ];
}

export function isVectorBasemap(basemap: string): boolean {
  return basemap in VECTOR_BASEMAPS || basemap === 'selfhosted';
}

/**
 * Raster tiles for a basemap, a vector selection resolving to its closest
 * raster. Null for a local archive, which no hosted raster can stand in for.
 */
export function rasterTiles(
  basemap: string,
  custom?: CustomBasemap | null,
): BasemapTiles | null {
  return basemap === 'local' ? null : hostedRasterTiles(basemap, custom);
}

/** What every export that writes a page for another machine says about `local`. */
export const LOCAL_BASEMAP_REFUSAL =
  'A local .pmtiles basemap stays on this machine, so it cannot go in the page.';

function hostedRasterTiles(basemap: string, custom?: CustomBasemap | null): BasemapTiles {
  if (basemap === 'custom' && custom) return custom;
  return BASEMAP_TILES[basemap] ?? VECTOR_APPROX_RASTER[basemap] ?? VECTOR_APPROX_RASTER.liberty;
}

export function isPmtilesUrl(url: string): boolean {
  const path = url.trim().split(/[?#]/)[0];
  return path.toLowerCase().endsWith('.pmtiles');
}

function rasterStyle(tileUrl: string, attribution: string): StyleSpecification {
  return {
    version: 8,
    sources: {
      basemap: { type: 'raster', tiles: [tileUrl], tileSize: 256, attribution },
    },
    layers: [{ id: 'basemap', type: 'raster', source: 'basemap' }],
  };
}

/** MapLibre raster style over one XYZ tile template. */
export function maplibreRasterStyle(tile: BasemapTiles): StyleSpecification {
  // cached:// falls back to the offline tile cache when the network fails
  return rasterStyle(cachedTileUrl(tile.url), tile.attr);
}

/**
 * Same tiles for a page running outside the app, which has no cached://
 * protocol registered and would draw no basemap at all with those URLs.
 */
export function standaloneRasterStyle(tile: BasemapTiles): StyleSpecification {
  return rasterStyle(tile.url, tile.attr);
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

/** Draws an empty map, so a basemap that cannot be shown shows as missing. */
export const NO_BASEMAP_STYLE: StyleSpecification = { version: 8, sources: {}, layers: [] };

/**
 * Style over a .pmtiles archive picked off disk. The pmtiles protocol keys the
 * archive by its file name, which is what `pmtiles://` resolves against. A
 * vector archive is drawn with the Protomaps layer set, so it has to be on the
 * v4 schema. Anything else belongs in an overlay layer instead.
 */
export function localBasemapStyle(local: LocalBasemap | null): StyleSpecification {
  if (!local || local.status === 'needs-file') return NO_BASEMAP_STYLE;
  if (local.kind === 'vector') return pmtilesStyle(local.name);
  return {
    version: 8,
    sources: {
      basemap: { type: 'raster', url: `pmtiles://${local.name}`, tileSize: 256 },
    },
    layers: [{ id: 'basemap', type: 'raster', source: 'basemap' }],
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
  local?: LocalBasemap | null,
): StyleSpecification | string {
  if (basemap === 'local') return localBasemapStyle(local ?? null);
  if (basemap === 'selfhosted') {
    const url = selfHostedUrl.trim();
    if (!url) return VECTOR_BASEMAPS[DEFAULT_VECTOR_BASEMAP].styleUrl;
    return isPmtilesUrl(url) ? pmtilesStyle(url) : url;
  }
  const vector = VECTOR_BASEMAPS[basemap];
  if (vector) return vector.styleUrl;
  return maplibreRasterStyle(hostedRasterTiles(basemap, custom));
}
