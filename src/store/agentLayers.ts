import { create } from 'zustand';

/**
 * Layers the agent asked us to draw (from a ui_spec). Held here rather than
 * pushed straight into one renderer, so every renderer can draw the same set
 * and switching between them keeps the results on screen.
 */
export interface AgentLayer {
  id: string;
  name: string;
  color: string;
  geojson: GeoJSON.FeatureCollection;
}

/** A point the agent dropped via add_marker. Accumulates until clear_entities. */
export interface AgentMarker {
  id: string;
  lon: number;
  lat: number;
  color: string;
  label?: string;
}

interface AgentLayerState {
  layers: AgentLayer[];
  markers: AgentMarker[];
  /** Bumped each time a new spec lands, so renderers know to reframe. */
  generation: number;
  setLayers: (layers: AgentLayer[]) => void;
  /** Append one layer (add_geojson / sql_query); fit reframes the view to it. */
  addLayer: (layer: AgentLayer, fit?: boolean) => void;
  /** Drop one layer by id (a panel taking back what it added). */
  removeLayer: (id: string) => void;
  addMarker: (marker: Omit<AgentMarker, 'id'>) => void;
  clearMarkers: () => void;
  clear: () => void;
}

/** Normalize any GeoJSON root (FeatureCollection | Feature | geometry) to a FeatureCollection. */
export function toFeatureCollection(data: unknown): GeoJSON.FeatureCollection | null {
  const g = data as { type?: string } | null;
  if (!g?.type) return null;
  if (g.type === 'FeatureCollection') return g as GeoJSON.FeatureCollection;
  if (g.type === 'Feature')
    return { type: 'FeatureCollection', features: [g as GeoJSON.Feature] };
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: g as GeoJSON.Geometry, properties: {} }],
  };
}

export const useAgentLayerStore = create<AgentLayerState>((set) => ({
  layers: [],
  markers: [],
  generation: 0,
  setLayers: (layers) => set((s) => ({ layers, generation: s.generation + 1 })),
  addLayer: (layer, fit = true) =>
    set((s) => ({
      layers: [...s.layers, layer],
      generation: fit ? s.generation + 1 : s.generation,
    })),
  removeLayer: (id) => set((s) => ({ layers: s.layers.filter((l) => l.id !== id) })),
  addMarker: (marker) =>
    set((s) => ({ markers: [...s.markers, { ...marker, id: crypto.randomUUID() }] })),
  clearMarkers: () => set({ markers: [] }),
  clear: () => set({ layers: [], markers: [] }),
}));
