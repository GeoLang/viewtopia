import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import {
  type Viewer,
  Cartesian2,
  Cartographic,
  Math as CesiumMath,
  Color,
  PolylineDashMaterialProperty,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
} from 'cesium';
import {
  useDrawStore,
  geometryVertices,
  geometryWithMovedVertex,
  type DrawMode,
} from '../store/draw';
import { useAppStore } from '../store/app';
import { Cartesian3 } from 'cesium';

/** the entity id carries the vertex path, so a pick says which vertex it hit */
const VERTEX_ENTITY_PREFIX = 'draw-vertex-';

function cssToColor(hex: string, alpha = 0.8): Color {
  try {
    return Color.fromCssColorString(hex).withAlpha(alpha);
  } catch {
    return Color.fromCssColorString('#a78bfa').withAlpha(alpha);
  }
}

function cartToLngLat(viewer: Viewer, screenX: number, screenY: number): [number, number] | null {
  const cart = viewer.camera.pickEllipsoid(new Cartesian2(screenX, screenY));
  if (!cart) return null;
  const carto = Cartographic.fromCartesian(cart);
  return [CesiumMath.toDegrees(carto.longitude), CesiumMath.toDegrees(carto.latitude)];
}

export function useDrawCesium(
  viewerRef: MutableRefObject<Viewer | null>,
) {
  const entityIdsRef = useRef<string[]>([]);
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null);
  // A renderer switch destroys and rebuilds the viewer, so rebind to the new
  // one — handlers and entities left on the old canvas are dead.
  const renderer = useAppStore((s) => s.renderer);
  const activeTab = useAppStore((s) => s.activeTab);

  // Click handler
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    const sync = (state: { mode: DrawMode }) => {
      const viewer = viewerRef.current;
      if (!viewer || viewer.isDestroyed()) return;

      if (state.mode && !handlerRef.current) {
        const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);

        handler.setInputAction((click: { position: Cartesian2 }) => {
          const { mode, addPendingPoint, finishFeature, pending } = useDrawStore.getState();
          if (!mode) return;
          const lngLat = cartToLngLat(viewer, click.position.x, click.position.y);
          if (!lngLat) return;

          addPendingPoint(lngLat[0], lngLat[1]);

          if (mode === 'point') {
            finishFeature();
          }
          if ((mode === 'circle' || mode === 'rectangle') && pending.length >= 1) {
            setTimeout(() => finishFeature(), 0);
          }
        }, ScreenSpaceEventType.LEFT_CLICK);

        handler.setInputAction(() => {
          const { mode, finishFeature } = useDrawStore.getState();
          if (mode === 'line' || mode === 'polygon') {
            finishFeature();
          }
        }, ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

        handlerRef.current = handler;
        viewer.scene.canvas.style.cursor = 'crosshair';
      }

      if (!state.mode && handlerRef.current) {
        handlerRef.current.destroy();
        handlerRef.current = null;
        if (viewer && !viewer.isDestroyed()) {
          viewer.scene.canvas.style.cursor = '';
        }
      }
    };

    // Apply the mode that's already set: after a renderer switch the store won't
    // fire again for a tool the user turned on before the switch.
    sync(useDrawStore.getState());
    const unsub = useDrawStore.subscribe(sync);

    return () => {
      unsub();
      if (handlerRef.current) {
        handlerRef.current.destroy();
        handlerRef.current = null;
      }
    };
  }, [viewerRef, renderer, activeTab]);

  // Render drawn features as Cesium entities
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    const render = () => {
      const v = viewerRef.current;
      if (!v || v.isDestroyed()) return;

      // Clear old
      for (const eid of entityIdsRef.current) {
        const e = v.entities.getById(eid);
        if (e) v.entities.remove(e);
      }
      entityIdsRef.current = [];

      const { features, pending } = useDrawStore.getState();

      // Render completed features
      for (const f of features) {
        const color = cssToColor(f.color);
        if (f.type === 'Point') {
          const eid = `draw-${f.id}`;
          v.entities.add({
            id: eid,
            position: Cartesian3.fromDegrees(f.coords[0][0], f.coords[0][1]),
            point: { pixelSize: 8, color, outlineColor: Color.WHITE, outlineWidth: 2 },
          });
          entityIdsRef.current.push(eid);
        } else if (f.type === 'LineString') {
          const eid = `draw-${f.id}`;
          v.entities.add({
            id: eid,
            polyline: {
              positions: Cartesian3.fromDegreesArray(f.coords.flat()),
              width: f.lineWidth,
              material: color,
              clampToGround: true,
            },
          });
          entityIdsRef.current.push(eid);
        } else if (f.type === 'Polygon') {
          const eid = `draw-${f.id}`;
          v.entities.add({
            id: eid,
            polygon: {
              hierarchy: Cartesian3.fromDegreesArray(f.coords.flat()),
              material: cssToColor(f.color, 0.25),
              outline: true,
              outlineColor: color,
              outlineWidth: f.lineWidth,
            },
          });
          entityIdsRef.current.push(eid);
        } else if (f.type === 'Circle' && f.radius) {
          const eid = `draw-${f.id}`;
          v.entities.add({
            id: eid,
            position: Cartesian3.fromDegrees(f.coords[0][0], f.coords[0][1]),
            ellipse: {
              semiMajorAxis: f.radius,
              semiMinorAxis: f.radius,
              material: cssToColor(f.color, 0.25),
              outline: true,
              outlineColor: color,
              outlineWidth: f.lineWidth,
            },
          });
          entityIdsRef.current.push(eid);
        }
      }

      // Render pending preview
      if (pending.length >= 2) {
        const eid = 'draw-pending-line';
        const existing = v.entities.getById(eid);
        if (existing) v.entities.remove(existing);
        v.entities.add({
          id: eid,
          polyline: {
            positions: Cartesian3.fromDegreesArray(pending.flat()),
            width: 2,
            material: new PolylineDashMaterialProperty({
              color: Color.WHITE,
              dashLength: 8,
            }),
            clampToGround: true,
          },
        });
        entityIdsRef.current.push(eid);
      }
      for (let i = 0; i < pending.length; i++) {
        const eid = `draw-pending-pt-${i}`;
        const existing = v.entities.getById(eid);
        if (existing) v.entities.remove(existing);
        v.entities.add({
          id: eid,
          position: Cartesian3.fromDegrees(pending[i][0], pending[i][1]),
          point: { pixelSize: 6, color: Color.WHITE, outlineColor: Color.VIOLET, outlineWidth: 1 },
        });
        entityIdsRef.current.push(eid);
      }
    };

    const unsub = useDrawStore.subscribe(render);
    // Re-render onto the rebuilt viewer; the old entities went with it.
    entityIdsRef.current = [];
    render();

    return () => {
      unsub();
    };
  }, [viewerRef, renderer, activeTab]);

  // One draggable point per vertex while the Dataset Editor holds a geometry open
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    let draggingPath: number[] | null = null;
    let rendered: GeoJSON.Geometry | null = null;
    const entityIds: string[] = [];

    const erase = () => {
      for (const id of entityIds) {
        const entity = viewer.entities.getById(id);
        if (entity) viewer.entities.remove(entity);
      }
      entityIds.length = 0;
    };

    const draw = (geometry: GeoJSON.Geometry) => {
      erase();
      for (const vertex of geometryVertices(geometry)) {
        const id = VERTEX_ENTITY_PREFIX + JSON.stringify(vertex.path);
        viewer.entities.add({
          id,
          position: Cartesian3.fromDegrees(vertex.position[0], vertex.position[1]),
          point: {
            pixelSize: 10,
            color: Color.WHITE,
            outlineColor: Color.fromCssColorString('#20c997'),
            outlineWidth: 2,
          },
        });
        entityIds.push(id);
      }
    };

    const sync = (state: { vertexEdit: { geometry: GeoJSON.Geometry } | null }) => {
      const geometry = state.vertexEdit?.geometry ?? null;
      if (geometry === rendered) return;
      rendered = geometry;
      if (geometry) draw(geometry);
      else erase();
    };

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);

    handler.setInputAction((event: { position: Cartesian2 }) => {
      if (!useDrawStore.getState().vertexEdit) return;
      const picked = viewer.scene.pick(event.position) as { id?: { id?: unknown } } | undefined;
      const id = picked?.id?.id;
      if (typeof id !== 'string' || !id.startsWith(VERTEX_ENTITY_PREFIX)) return;
      draggingPath = JSON.parse(id.slice(VERTEX_ENTITY_PREFIX.length));
      viewer.scene.screenSpaceCameraController.enableInputs = false;
    }, ScreenSpaceEventType.LEFT_DOWN);

    // the drag preview moves the points only, the store hears one move on release
    handler.setInputAction((movement: { endPosition: Cartesian2 }) => {
      const edit = useDrawStore.getState().vertexEdit;
      if (!draggingPath || !edit) return;
      const lngLat = cartToLngLat(viewer, movement.endPosition.x, movement.endPosition.y);
      if (!lngLat) return;
      draw(geometryWithMovedVertex(edit.geometry, draggingPath, lngLat));
    }, ScreenSpaceEventType.MOUSE_MOVE);

    handler.setInputAction((event: { position: Cartesian2 }) => {
      if (!draggingPath) return;
      const path = draggingPath;
      draggingPath = null;
      viewer.scene.screenSpaceCameraController.enableInputs = true;
      const lngLat = cartToLngLat(viewer, event.position.x, event.position.y);
      if (lngLat) useDrawStore.getState().moveVertex(path, lngLat);
    }, ScreenSpaceEventType.LEFT_UP);

    sync(useDrawStore.getState());
    const unsub = useDrawStore.subscribe(sync);

    return () => {
      unsub();
      handler.destroy();
      if (viewer.isDestroyed()) return;
      viewer.scene.screenSpaceCameraController.enableInputs = true;
      erase();
    };
  }, [viewerRef, renderer, activeTab]);
}
