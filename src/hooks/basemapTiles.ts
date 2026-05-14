/**
 * Canonical basemap tile URL definitions used by all renderers.
 */
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
  dark: {
    url: 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
    attr: '© CARTO',
  },
};

/**
 * MapLibre style object for a given basemap.
 */
export function maplibreRasterStyle(basemap: string) {
  const tile = BASEMAP_TILES[basemap] ?? BASEMAP_TILES.dark;
  return {
    version: 8 as const,
    sources: {
      basemap: {
        type: 'raster' as const,
        tiles: [tile.url],
        tileSize: 256,
        attribution: tile.attr,
      },
    },
    layers: [
      {
        id: 'basemap',
        type: 'raster' as const,
        source: 'basemap',
      },
    ],
  };
}
