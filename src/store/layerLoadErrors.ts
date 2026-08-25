import { create } from 'zustand';

/**
 * Why a layer is not drawing, keyed by the layer id its panel row uses. A tile
 * request that fails leaves the layer blank, so the reason has to be held
 * somewhere the row can read it.
 */
interface LayerLoadErrorState {
  errors: Record<string, string>;
  /**
   * Bumped by retry. The MapLibre OGC layers effect watches it and re-adds its
   * sources, which is what makes the tiles be requested again.
   */
  reloadRequests: number;
  setError: (layerId: string, message: string) => void;
  clearError: (layerId: string) => void;
  retry: (layerId: string) => void;
}

export const useLayerLoadErrorStore = create<LayerLoadErrorState>((set, get) => ({
  errors: {},
  reloadRequests: 0,

  // every failing tile fires its own error, so an unchanged message must not
  // make a new state object
  setError: (layerId, message) =>
    set((state) =>
      state.errors[layerId] === message
        ? state
        : { errors: { ...state.errors, [layerId]: message } },
    ),

  clearError: (layerId) =>
    set((state) => {
      if (!(layerId in state.errors)) return state;
      const errors = { ...state.errors };
      delete errors[layerId];
      return { errors };
    }),

  retry: (layerId) => {
    get().clearError(layerId);
    set((state) => ({ reloadRequests: state.reloadRequests + 1 }));
  },
}));
