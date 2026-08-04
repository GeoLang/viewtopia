import { create } from 'zustand';
import { useAgentLayerStore, toFeatureCollection } from './agentLayers';
import { addRemotePmtiles, type PmtilesInfo } from '../features/pmtiles/source';

/**
 * OGC services the user added (OGCLayersPanel). Raster services (WMS, WMTS, XYZ)
 * are held here so Cesium and MapLibre draw the same set and switching renderers
 * keeps them on screen. WFS is vector: its features go into the agent layers,
 * which every renderer already draws, and the entry here is the handle for them.
 * PMTiles archives also live here, but only MapLibre can draw them.
 */
export type OGCType = 'wms' | 'wmts' | 'wfs' | 'xyz' | 'pmtiles';

export interface OGCLayer {
  id: string;
  name: string;
  type: OGCType;
  url: string;
  /** Set once the archive's header has been read; unset means not drawable yet. */
  pmtiles?: PmtilesInfo;
}

interface OGCLayerState {
  layers: OGCLayer[];
  addLayer: (name: string, url: string, type: OGCType) => OGCLayer;
  /** Add an XYZ layer, or return the one already drawing the same tile URL. */
  addXyzLayer: (name: string, url: string) => OGCLayer;
  removeLayer: (id: string) => void;
  setPmtilesInfo: (id: string, info: PmtilesInfo) => void;
}

/** Root-relative service URLs need an origin before a worker can request them. */
function absolute(url: string): string {
  return url.startsWith('/') ? `${window.location.origin}${url}` : url;
}

/** First value of any of `names` in the url's query, case-insensitively. */
function urlParam(url: string, names: string[]): string | null {
  const query = url.split('?')[1];
  for (const [key, value] of new URLSearchParams(query ?? '')) {
    if (names.includes(key.toLowerCase()) && value) return value;
  }
  return null;
}

/** Set a query parameter, replacing it whatever case the url spelled it in. */
function setParam(params: URLSearchParams, key: string, value: string): void {
  for (const existing of [...params.keys()]) {
    if (existing.toLowerCase() === key) params.delete(existing);
  }
  params.set(key, value);
}

/**
 * WMS layer names to request: whatever the pasted URL already asks for, else the
 * name the user gave the layer (the common case for a bare service endpoint).
 */
export function wmsLayerNames(layer: OGCLayer): string {
  return urlParam(layer.url, ['layers']) ?? layer.name;
}

/** WFS feature types to request, same rule as the WMS layer names. */
export function wfsTypeNames(layer: OGCLayer): string {
  return urlParam(layer.url, ['typenames', 'typename', 'layers']) ?? layer.name;
}

/** Tile matrix set for a WMTS template that still carries the placeholder. */
export function wmtsMatrixSet(layer: OGCLayer): string {
  return urlParam(layer.url, ['tilematrixset']) ?? 'WebMercatorQuad';
}

/**
 * A RESTful WMTS template turned into the {z}/{x}/{y} form both renderers speak.
 * TileRow is the y axis and TileCol the x axis, and in WebMercatorQuad both count
 * from the top, so they map straight onto XYZ. A template already in XYZ form
 * passes through unchanged.
 */
export function wmtsTileTemplate(layer: OGCLayer): string {
  return absolute(layer.url)
    .replace(/\{TileMatrixSet\}/gi, wmtsMatrixSet(layer))
    .replace(/\{TileMatrix\}/gi, '{z}')
    .replace(/\{TileRow\}/gi, '{y}')
    .replace(/\{TileCol\}/gi, '{x}');
}

/**
 * A 256px raster tile template. XYZ passes through, WMTS is rewritten to XYZ, and
 * WMS gets a GetMap query with MapLibre's bbox placeholder, keeping any extra
 * parameters the pasted URL carried (MapServer's `map=`, vendor keys, …).
 */
export function rasterTileTemplate(layer: OGCLayer): string {
  if (layer.type === 'xyz') return absolute(layer.url);
  if (layer.type === 'wmts') return wmtsTileTemplate(layer);
  const [base, query] = absolute(layer.url).split('?');
  const params = new URLSearchParams(query ?? '');
  setParam(params, 'service', 'WMS');
  setParam(params, 'version', '1.1.1');
  setParam(params, 'request', 'GetMap');
  setParam(params, 'layers', wmsLayerNames(layer));
  setParam(params, 'styles', '');
  setParam(params, 'format', 'image/png');
  setParam(params, 'transparent', 'true');
  setParam(params, 'srs', 'EPSG:3857');
  setParam(params, 'width', '256');
  setParam(params, 'height', '256');
  // appended raw: the braces must survive for MapLibre to substitute the bbox
  return `${base}?${params}&bbox={bbox-epsg-3857}`;
}

/** GetFeature URL asking for GeoJSON, keeping the pasted URL's own parameters. */
export function wfsFeatureUrl(layer: OGCLayer): string {
  const [base, query] = absolute(layer.url).split('?');
  const params = new URLSearchParams(query ?? '');
  setParam(params, 'service', 'WFS');
  setParam(params, 'version', '2.0.0');
  setParam(params, 'request', 'GetFeature');
  setParam(params, 'typenames', wfsTypeNames(layer));
  setParam(params, 'outputformat', 'application/json');
  return `${base}?${params}`;
}

/** The style-facing URL of a PMTiles layer. A dropped file is already pmtiles://. */
export function pmtilesStyleUrl(layer: OGCLayer): string {
  return layer.url.startsWith('pmtiles://') ? layer.url : `pmtiles://${absolute(layer.url)}`;
}

/**
 * Read a remote archive's header so the renderer knows how to draw it. Resolves
 * with the info and throws a message the panel can show.
 */
export async function loadPmtilesLayer(layer: OGCLayer): Promise<PmtilesInfo> {
  const info = await addRemotePmtiles(absolute(layer.url));
  useOgcLayerStore.getState().setPmtilesInfo(layer.id, info);
  return info;
}

/** Agent-layer id holding a WFS layer's features, so removal can find them. */
export function wfsAgentLayerId(layer: OGCLayer): string {
  return `ogc-${layer.id}`;
}

/**
 * Fetch a WFS layer's features into the agent layers. Resolves with the feature
 * count and throws a message the panel can show.
 */
export async function loadWfsLayer(layer: OGCLayer): Promise<number> {
  const response = await fetch(wfsFeatureUrl(layer));
  if (!response.ok) throw new Error(`WFS returned ${response.status}`);
  const collection = toFeatureCollection(await response.json());
  if (!collection || collection.features.length === 0) {
    throw new Error('WFS returned no features');
  }
  useAgentLayerStore
    .getState()
    .addLayer(
      { id: wfsAgentLayerId(layer), name: layer.name, color: '#38bdf8', geojson: collection },
      true,
    );
  return collection.features.length;
}

export const useOgcLayerStore = create<OGCLayerState>((set, get) => ({
  layers: [],
  addLayer: (name, url, type) => {
    const layer: OGCLayer = { id: crypto.randomUUID(), name, url, type };
    set((s) => ({ layers: [...s.layers, layer] }));
    return layer;
  },
  addXyzLayer: (name, url) => {
    const template = absolute(url);
    const existing = get().layers.find((l) => rasterTileTemplate(l) === template);
    return existing ?? get().addLayer(name, url, 'xyz');
  },
  removeLayer: (id) => {
    const layer = get().layers.find((l) => l.id === id);
    // a WFS layer's geometry lives in the agent layers, so it goes with it
    if (layer?.type === 'wfs') {
      useAgentLayerStore.getState().removeLayer(wfsAgentLayerId(layer));
    }
    set((s) => ({ layers: s.layers.filter((l) => l.id !== id) }));
  },
  setPmtilesInfo: (id, info) =>
    set((s) => ({
      layers: s.layers.map((l) => (l.id === id ? { ...l, pmtiles: info } : l)),
    })),
}));
