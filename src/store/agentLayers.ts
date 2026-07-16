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

interface AgentLayerState {
  layers: AgentLayer[];
  /** Bumped each time a new spec lands, so renderers know to reframe. */
  generation: number;
  setLayers: (layers: AgentLayer[]) => void;
  clear: () => void;
}

export const useAgentLayerStore = create<AgentLayerState>((set) => ({
  layers: [],
  generation: 0,
  setLayers: (layers) => set((s) => ({ layers, generation: s.generation + 1 })),
  clear: () => set({ layers: [] }),
}));
