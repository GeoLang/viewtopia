/**
 * Heatmaps drawn with MapLibre's own `heatmap` layer, shared by the Heatmap panel
 * and the agent's add_heatmap command.
 *
 * deck.gl's HeatmapLayer aggregates in screen space and draws nothing under the
 * globe projection the map uses, so heatmaps go through maplibre instead. Specs
 * are held here rather than pushed straight at the map: a renderer switch rebuilds
 * the map and a basemap swap rebuilds its style, and useHeatmapsMapLibre re-adds
 * them from this store either way.
 */
import { create } from 'zustand';
import type { LayerSpecification, Map as MapLibreMap } from 'maplibre-gl';
import { useAppStore } from '../store/app';

type HeatmapPaint = Extract<LayerSpecification, { type: 'heatmap' }>['paint'];

/** Both the source and the layer of one heatmap carry this prefix. */
export const HEATMAP_PREFIX = 'native-heatmap-';

export const DEFAULT_COLOR_LOW = '#0000ff';
export const DEFAULT_COLOR_HIGH = '#ff0000';

export interface HeatmapPoint {
  position: [number, number];
  weight: number;
}

export interface HeatmapSpec {
  /** Owner key, one per panel or agent command; re-adding replaces the spec. */
  id: string;
  points: HeatmapPoint[];
  /** Kernel radius in px, deck's radiusPixels. */
  radius: number;
  intensity: number;
  colorLow?: string;
  colorHigh?: string;
}

/** Style id of a spec's source and layer (maplibre keeps the two namespaces apart). */
export const heatmapStyleId = (id: string): string => `${HEATMAP_PREFIX}${id}`;

export function heatmapFeatures(
  points: HeatmapPoint[],
): GeoJSON.FeatureCollection<GeoJSON.Point, { weight: number }> {
  return {
    type: 'FeatureCollection',
    features: points.map((p) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: p.position },
      properties: { weight: p.weight },
    })),
  };
}

/**
 * radius/intensity/weight onto maplibre's paint properties. The colour ramp has to
 * start transparent at density 0 or the layer tints the whole viewport. maplibre
 * weighs raw values where deck normalized by the largest weight, so the same data
 * reads hotter here at equal intensity.
 */
export function heatmapPaint(spec: HeatmapSpec): HeatmapPaint {
  return {
    'heatmap-radius': spec.radius,
    'heatmap-intensity': spec.intensity,
    'heatmap-weight': ['to-number', ['get', 'weight'], 1],
    'heatmap-color': [
      'interpolate',
      ['linear'],
      ['heatmap-density'],
      0,
      'rgba(0,0,0,0)',
      0.1,
      spec.colorLow ?? DEFAULT_COLOR_LOW,
      1,
      spec.colorHigh ?? DEFAULT_COLOR_HIGH,
    ],
  };
}

/**
 * Take off every heatmap we put on this style, then draw the given specs. Also the
 * cleanup path: an empty list leaves the style as we found it.
 */
export function applyHeatmaps(map: MapLibreMap, specs: HeatmapSpec[]): void {
  for (const layer of map.getStyle()?.layers ?? []) {
    if (layer.id.startsWith(HEATMAP_PREFIX)) map.removeLayer(layer.id);
  }
  for (const id of Object.keys(map.getStyle()?.sources ?? {})) {
    if (id.startsWith(HEATMAP_PREFIX)) map.removeSource(id);
  }
  for (const spec of specs) {
    if (spec.points.length === 0) continue;
    const styleId = heatmapStyleId(spec.id);
    map.addSource(styleId, { type: 'geojson', data: heatmapFeatures(spec.points) });
    map.addLayer({ id: styleId, type: 'heatmap', source: styleId, paint: heatmapPaint(spec) });
  }
}

interface HeatmapState {
  heatmaps: HeatmapSpec[];
  setHeatmap: (spec: HeatmapSpec) => void;
  dropHeatmap: (id: string) => void;
}

export const useHeatmapStore = create<HeatmapState>((set) => ({
  heatmaps: [],
  setHeatmap: (spec) =>
    set((s) => ({ heatmaps: [...s.heatmaps.filter((h) => h.id !== spec.id), spec] })),
  dropHeatmap: (id) => set((s) => ({ heatmaps: s.heatmaps.filter((h) => h.id !== id) })),
}));

/** Draw a heatmap, showing the renderer that draws it (as showPanelDeckLayer does). */
export function showHeatmap(spec: HeatmapSpec): void {
  useHeatmapStore.getState().setHeatmap(spec);
  const app = useAppStore.getState();
  app.setActiveTab('globe');
  app.setRenderer('maplibre');
}

export function clearHeatmap(id: string): void {
  useHeatmapStore.getState().dropHeatmap(id);
}
