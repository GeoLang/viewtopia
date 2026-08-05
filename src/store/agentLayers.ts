import { create } from 'zustand';
import { applySymbology, clearSymbology, type Symbology } from '../features/symbology/symbology';

/**
 * Layers the agent asked us to draw (from a ui_spec). Held here rather than
 * pushed straight into one renderer, so every renderer can draw the same set
 * and switching between them keeps the results on screen.
 */
/** Per-layer drawing overrides, from a plugin's LayerOptions. */
export interface AgentLayerStyle {
  /** fill opacity, 0..1 */
  opacity?: number;
  lineWidth?: number;
  filled?: boolean;
  stroked?: boolean;
}

export interface AgentLayer {
  id: string;
  name: string;
  color: string;
  geojson: GeoJSON.FeatureCollection;
  style?: AgentLayerStyle;
  /**
   * Relative path of the file this layer was read from, e.g.
   * "outputs/venice_env_risk.gpkg". Unset for a layer with no file behind it
   * (a drawing, a SQL result, a plugin's own geometry).
   */
  path?: string;
  /** Set while the layer is styled by its data: the classes, for the legend. */
  symbology?: Symbology;
  /** The features before styling, so clearing it restores the single colour. */
  sourceGeojson?: GeoJSON.FeatureCollection;
}

/** Fills in what a layer left unset, so the three renderers draw it the same. */
export function layerStyle(layer: AgentLayer): Required<AgentLayerStyle> {
  return {
    opacity: layer.style?.opacity ?? 0.3,
    lineWidth: layer.style?.lineWidth ?? 2,
    filled: layer.style?.filled ?? true,
    stroked: layer.style?.stroked ?? true,
  };
}

/**
 * An image draped over a bbox: a raster analysis result, not features. Kept
 * apart from the vector layers because it shares none of their machinery
 * (symbology, PMTiles export, feature bounds) and because its data URL runs to
 * megabytes, which a saved project file has no business carrying.
 */
export interface AgentRasterLayer {
  id: string;
  name: string;
  /** data URL of the rendered image */
  url: string;
  /** [west, south, east, north] in lon/lat */
  bbox: [number, number, number, number];
  opacity: number;
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
  rasterLayers: AgentRasterLayer[];
  markers: AgentMarker[];
  /** Bumped each time a new spec lands, so renderers know to reframe. */
  generation: number;
  setLayers: (layers: AgentLayer[]) => void;
  /** Add one layer (add_geojson / sql_query / plugin); a known id replaces that layer, fit reframes the view. */
  addLayer: (layer: AgentLayer, fit?: boolean) => void;
  /** Drop one layer by id (a panel taking back what it added). */
  removeLayer: (id: string) => void;
  /** Fill opacity of one layer, which every renderer reads through layerStyle. */
  setLayerOpacity: (id: string, opacity: number) => void;
  /** Style one layer by its data, or null to go back to one colour. */
  setSymbology: (id: string, symbology: Symbology | null) => void;
  /** Drape an image over a bbox; a known id replaces that layer. */
  addRasterLayer: (layer: AgentRasterLayer) => void;
  removeRasterLayer: (id: string) => void;
  setRasterOpacity: (id: string, opacity: number) => void;
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

function coordsInRange(c: unknown): boolean {
  if (!Array.isArray(c)) return false;
  if (typeof c[0] === 'number') {
    return typeof c[1] === 'number' && Math.abs(c[0]) <= 180 && Math.abs(c[1]) <= 90;
  }
  return c.every(coordsInRange);
}

function geometryInRange(g: GeoJSON.Geometry | null | undefined): boolean {
  if (!g) return false;
  if (g.type === 'GeometryCollection') return g.geometries.every(geometryInRange);
  return coordsInRange((g as { coordinates?: unknown }).coordinates);
}

// a degrees-vs-metres tool mistake yields coordinates far outside lon/lat
// range, which throws inside maplibre's LngLat and takes down the viewer,
// so drop bad features before any renderer sees them
function sanitizeLayers(layers: AgentLayer[]): AgentLayer[] {
  const out: AgentLayer[] = [];
  for (const layer of layers) {
    const features = layer.geojson.features.filter((f) => geometryInRange(f.geometry));
    if (features.length === 0) {
      console.warn(`agent layer "${layer.name}" dropped: coordinates outside lon/lat range`);
      continue;
    }
    if (features.length < layer.geojson.features.length) {
      console.warn(`agent layer "${layer.name}": dropped ${layer.geojson.features.length - features.length} out-of-range features`);
    }
    out.push({ ...layer, geojson: { ...layer.geojson, features } });
  }
  return out;
}

export const useAgentLayerStore = create<AgentLayerState>((set) => ({
  layers: [],
  rasterLayers: [],
  markers: [],
  generation: 0,
  setLayers: (layers) => set((s) => ({ layers: sanitizeLayers(layers), generation: s.generation + 1 })),
  addLayer: (layer, fit = true) =>
    set((s) => {
      const clean = sanitizeLayers([layer]);
      const known = s.layers.some((l) => l.id === layer.id);
      return {
        layers: known
          ? s.layers.flatMap((l) => (l.id === layer.id ? clean : [l]))
          : [...s.layers, ...clean],
        generation: fit ? s.generation + 1 : s.generation,
      };
    }),
  removeLayer: (id) => set((s) => ({ layers: s.layers.filter((l) => l.id !== id) })),
  // generation is left alone: restyling must not reframe the view
  setLayerOpacity: (id, opacity) =>
    set((s) => ({
      layers: s.layers.map((l) =>
        l.id === id ? { ...l, style: { ...l.style, opacity } } : l,
      ),
    })),
  setSymbology: (id, symbology) =>
    set((s) => ({
      layers: s.layers.map((l) =>
        l.id !== id ? l : symbology ? applySymbology(l, symbology) : clearSymbology(l),
      ),
    })),
  addRasterLayer: (layer) =>
    set((s) => ({
      rasterLayers: s.rasterLayers.some((l) => l.id === layer.id)
        ? s.rasterLayers.map((l) => (l.id === layer.id ? layer : l))
        : [...s.rasterLayers, layer],
    })),
  removeRasterLayer: (id) =>
    set((s) => ({ rasterLayers: s.rasterLayers.filter((l) => l.id !== id) })),
  setRasterOpacity: (id, opacity) =>
    set((s) => ({
      rasterLayers: s.rasterLayers.map((l) => (l.id === id ? { ...l, opacity } : l)),
    })),
  addMarker: (marker) =>
    set((s) => {
      if (Math.abs(marker.lon) > 180 || Math.abs(marker.lat) > 90) {
        console.warn(`agent marker "${marker.label ?? ''}" dropped: out-of-range coordinates`);
        return s;
      }
      return { markers: [...s.markers, { ...marker, id: crypto.randomUUID() }] };
    }),
  clearMarkers: () => set({ markers: [] }),
  clear: () => set({ layers: [], rasterLayers: [], markers: [] }),
}));
