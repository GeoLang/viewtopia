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
import { ElementApiError } from '../elements/elementService';
import { tiletopiaAssetId, useElementStore } from '../elements/store';
import { reportFailure } from '../../projects/requestFeedback';
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
        return [{ assetId, tileset, name: layer.name }];
      });

    void (async () => {
      const fetched = await Promise.allSettled(
        targets.map((target) => fetchElementEdits(target.assetId, controller.signal)),
      );
      if (cancelled || viewer.isDestroyed()) return;
      const next: Primitive[] = [];
      const hidden: string[] = [];
      for (const [index, outcome] of fetched.entries()) {
        const target = targets[index];
        if (outcome.status === 'rejected') {
          // fetch rejects with a TypeError when the network fails
          if (!(outcome.reason instanceof ElementApiError || outcome.reason instanceof TypeError)) throw outcome.reason;
          reportFailure(`Could not read the element edits of ${target.name}`, outcome.reason);
          continue;
        }
        const edits = outcome.value;
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
