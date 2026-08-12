import { create } from 'zustand';
import { applySymbology, clearSymbology, type Symbology } from '../features/symbology/symbology';
import { asColor } from '../lib/color';
import type { Corners } from '../overlay/georeference';

/** Fallback for a layer or marker colour the browser cannot read. */
export const DEFAULT_LAYER_COLOR = '#38bdf8';

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

/**
 * Zoom levels a layer draws over: min inclusive, max exclusive, the way
 * MapLibre reads minzoom/maxzoom. 0 to 24 is the whole span, which is what a
 * layer with no range set draws over.
 */
export interface ZoomRange {
  min: number;
  max: number;
}

export const ZOOM_LIMITS: ZoomRange = { min: 0, max: 24 };

export interface AgentLayer {
  id: string;
  name: string;
  /** Unset means nobody chose a colour, and the renderers fall back. */
  color?: string;
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
  /** Unset counts as visible. */
  visible?: boolean;
  /** Unset means the layer draws at every zoom. */
  zoomRange?: ZoomRange;
}

/** What the renderers draw: everything the layer switch has not turned off. */
export function visibleLayers(layers: AgentLayer[]): AgentLayer[] {
  return layers.filter((layer) => layer.visible !== false);
}

/** Whether a layer's scale range lets it draw at this zoom. */
export function drawnAtZoom(layer: AgentLayer, zoom: number): boolean {
  const range = layer.zoomRange;
  if (!range) return true;
  return zoom >= range.min && zoom < range.max;
}

/**
 * A range every renderer can take: whole zoom levels inside the limits, with
 * room for at least one level, since MapLibre rejects a maxzoom at or under its
 * minzoom. The whole span is no restriction at all, so it comes back as null.
 */
export function normalizeZoomRange(range: ZoomRange | null | undefined): ZoomRange | null {
  if (!range || !Number.isFinite(range.min) || !Number.isFinite(range.max)) return null;
  const min = Math.min(Math.max(Math.round(range.min), ZOOM_LIMITS.min), ZOOM_LIMITS.max - 1);
  const max = Math.min(Math.max(Math.round(range.max), min + 1), ZOOM_LIMITS.max);
  if (min === ZOOM_LIMITS.min && max === ZOOM_LIMITS.max) return null;
  return { min, max };
}

function withZoomRange(layer: AgentLayer, range: ZoomRange | null | undefined): AgentLayer {
  const normalized = normalizeZoomRange(range);
  if (!normalized) {
    const { zoomRange: _cleared, ...rest } = layer;
    return rest;
  }
  return { ...layer, zoomRange: normalized };
}

/** The colour to draw a layer in, whether or not anyone chose one. */
export function layerColor(layer: AgentLayer): string {
  return layer.color ?? DEFAULT_LAYER_COLOR;
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
 * An image draped over the map: an uploaded plan or PDF page, or a raster
 * analysis result. Kept apart from the vector layers because it shares none of
 * their machinery (symbology, PMTiles export, feature bounds) and because its
 * data URL runs to megabytes, which a saved project file has no business
 * carrying: the bitmap goes to IndexedDB instead, see overlay/overlayImages.
 */
export interface AgentRasterLayer {
  id: string;
  name: string;
  /** data URL of the image */
  url: string;
  corners: Corners;
  opacity: number;
  visible: boolean;
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
  editingRasterId: string | null;
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
  /** Single colour of one layer, which any symbology class overrides per feature. */
  setLayerColor: (id: string, color: string) => void;
  /** Style one layer by its data, or null to go back to one colour. */
  setSymbology: (id: string, symbology: Symbology | null) => void;
  /** Limit one layer to a zoom range, or null to draw it at every zoom. */
  setZoomRange: (id: string, range: ZoomRange | null) => void;
  /** Drape an image over the map; a known id replaces that layer. */
  addRasterLayer: (layer: AgentRasterLayer) => void;
  removeRasterLayer: (id: string) => void;
  setRasterOpacity: (id: string, opacity: number) => void;
  /** Move one image's corners, which is what dragging a corner handle does. */
  setRasterCorners: (id: string, corners: Corners) => void;
  /** Show or hide one layer, vector or image, in whichever list holds the id. */
  setLayerVisible: (id: string, visible: boolean) => void;
  /** Later in the list draws on top, so this is the stacking order. */
  reorderRasterLayers: (from: number, to: number) => void;
  /** The image whose corner handles are on the map, or null for none. */
  setEditingRaster: (id: string | null) => void;
  addMarker: (marker: Omit<AgentMarker, 'id'>) => void;
  /** Put back a saved set, ids and all, where addMarker would mint new ones. */
  setMarkers: (markers: AgentMarker[]) => void;
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
    out.push(
      withZoomRange(
        {
          ...layer,
          // a colour nobody chose stays unchosen, or it would be published to peers
          ...(layer.color === undefined ? {} : { color: asColor(layer.color, DEFAULT_LAYER_COLOR) }),
          geojson: { ...layer.geojson, features },
        },
        layer.zoomRange,
      ),
    );
  }
  return out;
}

function sanitizeMarkers(markers: AgentMarker[]): AgentMarker[] {
  return markers
    .filter((marker) => Math.abs(marker.lon) <= 180 && Math.abs(marker.lat) <= 90)
    .map((marker) => ({ ...marker, color: asColor(marker.color, DEFAULT_LAYER_COLOR) }));
}

export const useAgentLayerStore = create<AgentLayerState>((set) => ({
  layers: [],
  rasterLayers: [],
  editingRasterId: null,
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
  setLayerColor: (id, color) =>
    set((s) => ({
      layers: s.layers.map((l) =>
        l.id === id ? { ...l, color: asColor(color, DEFAULT_LAYER_COLOR) } : l,
      ),
    })),
  setSymbology: (id, symbology) =>
    set((s) => ({
      layers: s.layers.map((l) =>
        l.id !== id ? l : symbology ? applySymbology(l, symbology) : clearSymbology(l),
      ),
    })),
  setZoomRange: (id, range) =>
    set((s) => ({
      layers: s.layers.map((l) => (l.id === id ? withZoomRange(l, range) : l)),
    })),
  addRasterLayer: (layer) =>
    set((s) => ({
      rasterLayers: s.rasterLayers.some((l) => l.id === layer.id)
        ? s.rasterLayers.map((l) => (l.id === layer.id ? layer : l))
        : [...s.rasterLayers, layer],
    })),
  removeRasterLayer: (id) =>
    set((s) => ({
      rasterLayers: s.rasterLayers.filter((l) => l.id !== id),
      editingRasterId: s.editingRasterId === id ? null : s.editingRasterId,
    })),
  setRasterOpacity: (id, opacity) =>
    set((s) => ({
      rasterLayers: s.rasterLayers.map((l) => (l.id === id ? { ...l, opacity } : l)),
    })),
  setRasterCorners: (id, corners) =>
    set((s) => ({
      rasterLayers: s.rasterLayers.map((l) => (l.id === id ? { ...l, corners } : l)),
    })),
  setLayerVisible: (id, visible) =>
    set((s) => ({
      layers: s.layers.map((l) => (l.id === id ? { ...l, visible } : l)),
      rasterLayers: s.rasterLayers.map((l) => (l.id === id ? { ...l, visible } : l)),
    })),
  reorderRasterLayers: (from, to) =>
    set((s) => {
      if (from === to || from < 0 || to < 0) return s;
      if (from >= s.rasterLayers.length || to >= s.rasterLayers.length) return s;
      const rasterLayers = [...s.rasterLayers];
      const [moved] = rasterLayers.splice(from, 1);
      rasterLayers.splice(to, 0, moved);
      return { rasterLayers };
    }),
  setEditingRaster: (id) => set({ editingRasterId: id }),
  addMarker: (marker) =>
    set((s) => {
      if (Math.abs(marker.lon) > 180 || Math.abs(marker.lat) > 90) {
        console.warn(`agent marker "${marker.label ?? ''}" dropped: out-of-range coordinates`);
        return s;
      }
      return {
        markers: [
          ...s.markers,
          { ...marker, color: asColor(marker.color, DEFAULT_LAYER_COLOR), id: crypto.randomUUID() },
        ],
      };
    }),
  setMarkers: (markers) => set({ markers: sanitizeMarkers(markers) }),
  clearMarkers: () => set({ markers: [] }),
  clear: () => set({ layers: [], rasterLayers: [], editingRasterId: null, markers: [] }),
}));
