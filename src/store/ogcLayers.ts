import { create } from 'zustand';

/**
 * OGC/XYZ raster services the user added (OGCLayersPanel). Held here rather than
 * pushed into one renderer, so Cesium and MapLibre draw the same set and
 * switching renderers keeps them on screen.
 */
export type OGCType = 'wms' | 'xyz';

export interface OGCLayer {
  id: string;
  name: string;
  type: OGCType;
  url: string;
}

interface OGCLayerState {
  layers: OGCLayer[];
  addLayer: (name: string, url: string, type: OGCType) => void;
  removeLayer: (id: string) => void;
}

/**
 * WMS layer names to request: whatever the pasted URL already asks for, else the
 * name the user gave the layer (the common case for a bare service endpoint).
 */
export function wmsLayerNames(layer: OGCLayer): string {
  const query = layer.url.split('?')[1];
  for (const [key, value] of new URLSearchParams(query ?? '')) {
    if (key.toLowerCase() === 'layers' && value) return value;
  }
  return layer.name;
}

/** Root-relative service URLs need an origin before a worker can request them. */
function absolute(url: string): string {
  return url.startsWith('/') ? `${window.location.origin}${url}` : url;
}

/**
 * A 256px raster tile template for MapLibre. XYZ services pass through; WMS gets
 * a GetMap query with MapLibre's bbox placeholder, keeping any extra parameters
 * the pasted URL carried (MapServer's `map=`, vendor keys, …).
 */
export function rasterTileTemplate(layer: OGCLayer): string {
  const url = absolute(layer.url);
  if (layer.type === 'xyz') return url;
  const [base, query] = url.split('?');
  const params = new URLSearchParams(query ?? '');
  const set = (key: string, value: string) => {
    for (const existing of [...params.keys()]) {
      if (existing.toLowerCase() === key) params.delete(existing);
    }
    params.set(key, value);
  };
  set('service', 'WMS');
  set('version', '1.1.1');
  set('request', 'GetMap');
  set('layers', wmsLayerNames(layer));
  set('styles', '');
  set('format', 'image/png');
  set('transparent', 'true');
  set('srs', 'EPSG:3857');
  set('width', '256');
  set('height', '256');
  // appended raw: the braces must survive for MapLibre to substitute the bbox
  return `${base}?${params}&bbox={bbox-epsg-3857}`;
}

export const useOgcLayerStore = create<OGCLayerState>((set) => ({
  layers: [],
  addLayer: (name, url, type) =>
    set((s) => ({ layers: [...s.layers, { id: crypto.randomUUID(), name, url, type }] })),
  removeLayer: (id) => set((s) => ({ layers: s.layers.filter((l) => l.id !== id) })),
}));
