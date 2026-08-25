import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import type maplibregl from 'maplibre-gl';
import {
  useDrawStore,
  geometryVertices,
  geometryWithMovedVertex,
  type DrawMode,
  type DrawnFeature,
} from '../store/draw';
import { useAppStore } from '../store/app';

const SRC = 'draw-features';
const SRC_PENDING = 'draw-pending';
const LINE_LAYER = 'draw-lines';
const FILL_LAYER = 'draw-fills';
const POINT_LAYER = 'draw-points';
const PENDING_LINE = 'draw-pending-line';
const PENDING_POINT = 'draw-pending-pts';
const VERTEX_SRC = 'draw-vertex-edit';
const VERTEX_LAYER = 'draw-vertex-handles';

function featuresToGeoJSON(features: DrawnFeature[]): GeoJSON.FeatureCollection {
  const geoFeatures: GeoJSON.Feature[] = [];
  for (const f of features) {
    if (f.type === 'Point') {
      geoFeatures.push({
        type: 'Feature',
        properties: { color: f.color, width: f.lineWidth },
        geometry: { type: 'Point', coordinates: f.coords[0] },
      });
    } else if (f.type === 'LineString') {
      geoFeatures.push({
        type: 'Feature',
        properties: { color: f.color, width: f.lineWidth },
        geometry: { type: 'LineString', coordinates: f.coords },
      });
    } else if (f.type === 'Polygon') {
      const ring = [...f.coords, f.coords[0]]; // close
      geoFeatures.push({
        type: 'Feature',
        properties: { color: f.color, width: f.lineWidth },
        geometry: { type: 'Polygon', coordinates: [ring] },
      });
    } else if (f.type === 'Circle' && f.radius) {
      // Approximate circle as 64-point polygon
      const [cx, cy] = f.coords[0];
      const points: [number, number][] = [];
      for (let i = 0; i <= 64; i++) {
        const angle = (i / 64) * Math.PI * 2;
        const dLat = (f.radius / 6_371_000) * (180 / Math.PI);
        const dLng = dLat / Math.cos((cy * Math.PI) / 180);
        points.push([cx + dLng * Math.cos(angle), cy + dLat * Math.sin(angle)]);
      }
      geoFeatures.push({
        type: 'Feature',
        properties: { color: f.color, width: f.lineWidth },
        geometry: { type: 'Polygon', coordinates: [points] },
      });
    }
  }
  return { type: 'FeatureCollection', features: geoFeatures };
}

function pendingToGeoJSON(pending: [number, number][]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  if (pending.length >= 2) {
    features.push({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: pending },
    });
  }
  for (const p of pending) {
    features.push({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: p },
    });
  }
  return { type: 'FeatureCollection', features };
}

export function useDrawMapLibre(
  mapRef: MutableRefObject<maplibregl.Map | null>,
) {
  const handlerRef = useRef<((e: maplibregl.MapMouseEvent) => void) | null>(null);
  const dblHandlerRef = useRef<((e: maplibregl.MapMouseEvent) => void) | null>(null);
  // A renderer switch destroys and rebuilds the map, so rebind to the new one —
  // handlers and layers left on the old instance are dead.
  const renderer = useAppStore((s) => s.renderer);
  const activeTab = useAppStore((s) => s.activeTab);

  // Click handler: register/unregister based on draw mode
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clean up previous
    if (handlerRef.current) {
      map.off('click', handlerRef.current);
      handlerRef.current = null;
    }
    if (dblHandlerRef.current) {
      map.off('dblclick', dblHandlerRef.current);
      dblHandlerRef.current = null;
    }

    const sync = (state: { mode: DrawMode }) => {
      const map = mapRef.current;
      if (!map) return;

      // Register handlers when mode is set
      if (state.mode && !handlerRef.current) {
        const clickHandler = (e: maplibregl.MapMouseEvent) => {
          const { mode, addPendingPoint, finishFeature, pending } = useDrawStore.getState();
          if (!mode) return;

          addPendingPoint(e.lngLat.lng, e.lngLat.lat);

          // Point mode: finish immediately
          if (mode === 'point') {
            finishFeature();
          }
          // Circle/rectangle: finish on second click
          if ((mode === 'circle' || mode === 'rectangle') && pending.length >= 1) {
            // pending already has the first point, addPendingPoint just added second
            setTimeout(() => finishFeature(), 0);
          }
        };

        const dblClickHandler = (e: maplibregl.MapMouseEvent) => {
          e.preventDefault();
          const { mode, finishFeature } = useDrawStore.getState();
          if (mode === 'line' || mode === 'polygon') {
            finishFeature();
          }
        };

        map.on('click', clickHandler);
        map.on('dblclick', dblClickHandler);
        handlerRef.current = clickHandler;
        dblHandlerRef.current = dblClickHandler;

        map.getCanvas().style.cursor = 'crosshair';
      }

      // Unregister handlers when mode is cleared
      if (!state.mode && handlerRef.current) {
        map.off('click', handlerRef.current);
        handlerRef.current = null;
        if (dblHandlerRef.current) {
          map.off('dblclick', dblHandlerRef.current);
          dblHandlerRef.current = null;
        }
        map.getCanvas().style.cursor = '';
      }
    };

    // Apply the mode that's already set: after a renderer switch the store won't
    // fire again for a tool the user turned on before the switch.
    sync(useDrawStore.getState());
    const unsub = useDrawStore.subscribe(sync);

    return () => {
      unsub();
      const map = mapRef.current;
      if (!map) return;
      if (handlerRef.current) map.off('click', handlerRef.current);
      if (dblHandlerRef.current) map.off('dblclick', dblHandlerRef.current);
      handlerRef.current = null;
      dblHandlerRef.current = null;
    };
  }, [mapRef, renderer, activeTab]);

  // Render drawn features + pending onto the map
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const render = () => {
      const { features, pending } = useDrawStore.getState();
      const geojson = featuresToGeoJSON(features);
      const pendGeo = pendingToGeoJSON(pending);

      // Completed features
      const src = map.getSource(SRC) as maplibregl.GeoJSONSource | undefined;
      if (src) {
        src.setData(geojson);
      } else {
        map.addSource(SRC, { type: 'geojson', data: geojson });
        map.addLayer({
          id: FILL_LAYER,
          type: 'fill',
          source: SRC,
          filter: ['==', '$type', 'Polygon'],
          paint: {
            'fill-color': ['get', 'color'],
            'fill-opacity': 0.25,
          },
        });
        map.addLayer({
          id: LINE_LAYER,
          type: 'line',
          source: SRC,
          filter: ['any', ['==', '$type', 'LineString'], ['==', '$type', 'Polygon']],
          paint: {
            'line-color': ['get', 'color'],
            'line-width': ['get', 'width'],
          },
        });
        map.addLayer({
          id: POINT_LAYER,
          type: 'circle',
          source: SRC,
          filter: ['==', '$type', 'Point'],
          paint: {
            'circle-radius': 6,
            'circle-color': ['get', 'color'],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#fff',
          },
        });
      }

      // Pending shape preview
      const pendSrc = map.getSource(SRC_PENDING) as maplibregl.GeoJSONSource | undefined;
      if (pendSrc) {
        pendSrc.setData(pendGeo);
      } else {
        map.addSource(SRC_PENDING, { type: 'geojson', data: pendGeo });
        map.addLayer({
          id: PENDING_LINE,
          type: 'line',
          source: SRC_PENDING,
          filter: ['==', '$type', 'LineString'],
          paint: {
            'line-color': '#ffffff',
            'line-width': 2,
            'line-dasharray': [4, 4],
          },
        });
        map.addLayer({
          id: PENDING_POINT,
          type: 'circle',
          source: SRC_PENDING,
          filter: ['==', '$type', 'Point'],
          paint: {
            'circle-radius': 5,
            'circle-color': '#ffffff',
            'circle-stroke-width': 1,
            'circle-stroke-color': '#a78bfa',
          },
        });
      }
    };

    // Render whenever store changes
    const unsub = useDrawStore.subscribe(render);

    // Initial render (if map already loaded)
    if (map.isStyleLoaded()) {
      render();
    } else {
      map.on('load', render);
    }

    return () => {
      unsub();
      map.off('load', render);
    };
  }, [mapRef, renderer, activeTab]);

  // One draggable handle per vertex while the Dataset Editor holds a geometry open
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    let draggingPath: number[] | null = null;
    let rendered: GeoJSON.Geometry | null = null;

    const handles = (geometry: GeoJSON.Geometry): GeoJSON.FeatureCollection => ({
      type: 'FeatureCollection',
      features: geometryVertices(geometry).map((vertex) => ({
        type: 'Feature',
        properties: { path: JSON.stringify(vertex.path) },
        geometry: { type: 'Point', coordinates: vertex.position },
      })),
    });

    const draw = (geometry: GeoJSON.Geometry) => {
      const src = map.getSource(VERTEX_SRC) as maplibregl.GeoJSONSource | undefined;
      if (src) {
        src.setData(handles(geometry));
        return;
      }
      if (!map.isStyleLoaded()) return;
      map.addSource(VERTEX_SRC, { type: 'geojson', data: handles(geometry) });
      map.addLayer({
        id: VERTEX_LAYER,
        type: 'circle',
        source: VERTEX_SRC,
        paint: {
          'circle-radius': 6,
          'circle-color': '#ffffff',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#20c997',
        },
      });
    };

    const erase = () => {
      if (map.getLayer(VERTEX_LAYER)) map.removeLayer(VERTEX_LAYER);
      if (map.getSource(VERTEX_SRC)) map.removeSource(VERTEX_SRC);
    };

    const sync = (state: { vertexEdit: { geometry: GeoJSON.Geometry } | null }) => {
      const geometry = state.vertexEdit?.geometry ?? null;
      if (geometry === rendered) return;
      rendered = geometry;
      if (geometry) draw(geometry);
      else erase();
    };

    const onMouseDown = (e: maplibregl.MapMouseEvent) => {
      if (!useDrawStore.getState().vertexEdit || !map.getLayer(VERTEX_LAYER)) return;
      const hit = map.queryRenderedFeatures(e.point, { layers: [VERTEX_LAYER] })[0];
      if (!hit) return;
      e.preventDefault();
      draggingPath = JSON.parse(String(hit.properties?.path));
      map.dragPan.disable();
    };

    // the drag preview moves the handles only, the store hears one move on release
    const onMouseMove = (e: maplibregl.MapMouseEvent) => {
      const edit = useDrawStore.getState().vertexEdit;
      if (!draggingPath || !edit) return;
      const src = map.getSource(VERTEX_SRC) as maplibregl.GeoJSONSource | undefined;
      if (!src) return;
      src.setData(handles(geometryWithMovedVertex(edit.geometry, draggingPath, [e.lngLat.lng, e.lngLat.lat])));
    };

    const onMouseUp = (e: maplibregl.MapMouseEvent) => {
      if (!draggingPath) return;
      const path = draggingPath;
      draggingPath = null;
      map.dragPan.enable();
      useDrawStore.getState().moveVertex(path, [e.lngLat.lng, e.lngLat.lat]);
    };

    map.on('mousedown', onMouseDown);
    map.on('mousemove', onMouseMove);
    map.on('mouseup', onMouseUp);
    sync(useDrawStore.getState());
    const unsub = useDrawStore.subscribe(sync);

    return () => {
      unsub();
      map.off('mousedown', onMouseDown);
      map.off('mousemove', onMouseMove);
      map.off('mouseup', onMouseUp);
      map.dragPan.enable();
      erase();
    };
  }, [mapRef, renderer, activeTab]);
}
