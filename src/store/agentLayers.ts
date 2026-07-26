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
  addMarker: (marker: Omit<AgentMarker, 'id'>) => void;
  clearMarkers: () => void;
  clear: () => void;
}

export const useAgentLayerStore = create<AgentLayerState>((set) => ({
  layers: [],
  markers: [],
  generation: 0,
  setLayers: (layers) => set((s) => ({ layers, generation: s.generation + 1 })),
  addMarker: (marker) =>
    set((s) => ({ markers: [...s.markers, { ...marker, id: crypto.randomUUID() }] })),
  clearMarkers: () => set({ markers: [] }),
  clear: () => set({ layers: [], markers: [] }),
}));
