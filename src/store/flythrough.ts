import { create } from 'zustand';

interface FlythroughState {
  /** route handed to the flythrough panel by the routing panel, [lng, lat] pairs */
  routeGeometry: [number, number][] | null;
  setRouteGeometry: (geometry: [number, number][]) => void;
  clearRouteGeometry: () => void;
}

export const useFlythroughStore = create<FlythroughState>((set) => ({
  routeGeometry: null,
  setRouteGeometry: (routeGeometry) => set({ routeGeometry }),
  clearRouteGeometry: () => set({ routeGeometry: null }),
}));
