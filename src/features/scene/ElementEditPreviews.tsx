import { useEffect, useRef, useSyncExternalStore } from 'react';
import {
  BoundingSphere,
  Color,
  ColorGeometryInstanceAttribute,
  ComponentDatatype,
  Geometry,
  GeometryAttribute,
  GeometryAttributes,
  GeometryInstance,
  PerInstanceColorAppearance,
  Primitive,
  PrimitiveType,
} from 'cesium';
import type { Cesium3DTileset } from 'cesium';
import { fetchElementEdits, type StoredElementEdit } from '../elements/elementEdits';
import { tiletopiaAssetId, useElementStore } from '../elements/store';
import { useTiles3dLayerStore } from '../../store/tiles3dLayers';
import { getActiveCesiumViewer } from '../../viewer/registry';
import { previewTriangles } from './elementEditMesh';

let revision = 0;
const listeners = new Set<() => void>();

export function noteElementEditsChanged(): void {
  revision += 1;
  for (const listener of listeners) listener();
}

export function subscribeElementEdits(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function elementEditRevision(): number {
  return revision;
}

const PREVIEW_COLOR = Color.fromBytes(138, 164, 184, 230);

function previewPrimitive(tileset: Cesium3DTileset, edit: StoredElementEdit): Primitive | null {
  const triangles = previewTriangles(edit.positions, edit.indices);
  if (!triangles) return null;
  const attributes = new GeometryAttributes();
  attributes.position = new GeometryAttribute({
    componentDatatype: ComponentDatatype.DOUBLE,
    componentsPerAttribute: 3,
    values: triangles.positions,
  });
  const geometry = new Geometry({
    attributes,
    indices: triangles.indices,
    primitiveType: PrimitiveType.TRIANGLES,
    boundingSphere: BoundingSphere.fromVertices(Array.from(triangles.positions)),
  });
  return new Primitive({
    geometryInstances: new GeometryInstance({
      geometry,
      modelMatrix: tileset.root.computedTransform,
      attributes: { color: ColorGeometryInstanceAttribute.fromColor(PREVIEW_COLOR) },
    }),
    appearance: new PerInstanceColorAppearance({ flat: true, translucent: true }),
    asynchronous: false,
  });
}

export function ElementEditPreviews() {
  const revisionNow = useSyncExternalStore(subscribeElementEdits, elementEditRevision);
  const layers = useTiles3dLayerStore((state) => state.layers);
  const loaded = useTiles3dLayerStore((state) => state.loaded);
  const openAssetId = useElementStore((state) => state.model?.assetId ?? null);
  const viewerReady = getActiveCesiumViewer() !== null;
  const drawn = useRef<Primitive[]>([]);
  const modelKey = layers
    .map((layer) => {
      const assetId = tiletopiaAssetId(layer.url);
      return assetId && loaded[layer.id] && layer.visible ? `${layer.id}:${assetId}` : '';
    })
    .filter((item) => item !== '')
    .join('|');

  useEffect(() => {
    if (!viewerReady) return;
    const viewer = getActiveCesiumViewer();
    if (!viewer) return;
    const controller = new AbortController();
    let cancelled = false;
    const targets = useTiles3dLayerStore
      .getState()
      .layers.flatMap((layer) => {
        const assetId = tiletopiaAssetId(layer.url);
        const tileset = useTiles3dLayerStore.getState().loaded[layer.id];
        if (!assetId || !tileset || !layer.visible) return [];
        return [{ assetId, tileset }];
      });

    void (async () => {
      try {
        const fetched = await Promise.all(
          targets.map(async (target) => ({
            target,
            edits: await fetchElementEdits(target.assetId, controller.signal),
          })),
        );
        if (cancelled || viewer.isDestroyed()) return;
        const next: Primitive[] = [];
        const hidden: string[] = [];
        for (const { target, edits } of fetched) {
          if (target.assetId === openAssetId) {
            for (const edit of edits) {
              if (edit.hideOriginal) hidden.push(edit.elementId);
            }
          }
          for (const edit of edits) {
            const primitive = previewPrimitive(target.tileset, edit);
            if (primitive) next.push(primitive);
          }
        }
        for (const primitive of drawn.current) viewer.scene.primitives.remove(primitive);
        for (const primitive of next) viewer.scene.primitives.add(primitive);
        drawn.current = next;
        useElementStore.getState().setSuppressed(hidden);
        viewer.scene.requestRender();
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [modelKey, openAssetId, revisionNow, viewerReady]);

  useEffect(
    () => () => {
      const viewer = getActiveCesiumViewer();
      if (viewer && !viewer.isDestroyed()) {
        for (const primitive of drawn.current) viewer.scene.primitives.remove(primitive);
        viewer.scene.requestRender();
      }
      drawn.current = [];
      useElementStore.getState().setSuppressed([]);
    },
    [],
  );

  return null;
}
