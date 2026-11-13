import { useEffect, useSyncExternalStore } from 'react';
import { Text } from '@mantine/core';
import type { Cesium3DTileset } from 'cesium';
import { create } from 'zustand';
import { tiletopiaAssetId, useElementStore } from '../elements/store';
import { useTiles3dLayerStore, type Tiles3dLayer } from '../../store/tiles3dLayers';
import { getActiveCesiumViewer } from '../../viewer/registry';
import { fetchSectionCut, sectionCapPrimitives, type CutHalfSpace, type SectionCut } from './sectionCut';
import {
  readFacePlanes,
  readTilesetSection,
  sectionFrameIsRootFrame,
  subscribeTilesetSections,
  tilesetSectionChangeCount,
  type FacePlane,
  type TilesetSection,
} from './tilesetSection';

export const SECTION_REQUEST_DELAY_MILLISECONDS = 300;

type CapRequest =
  | { kind: 'waiting' }
  | { kind: 'answered'; tileset: Cesium3DTileset; cut: SectionCut }
  | { kind: 'failed'; message: string };

const WAITING: CapRequest = { kind: 'waiting' };

const useCapRequestStore = create<{ requestsByKey: Record<string, CapRequest> }>(() => ({
  requestsByKey: {},
}));

function setCapRequest(key: string, request: CapRequest): void {
  useCapRequestStore.setState(({ requestsByKey }) => ({
    requestsByKey: { ...requestsByKey, [key]: request },
  }));
}

function dropCapRequest(key: string): void {
  useCapRequestStore.setState(({ requestsByKey }) => {
    const rest = { ...requestsByKey };
    delete rest[key];
    return { requestsByKey: rest };
  });
}

function requestsForLayer(requestsByKey: Record<string, CapRequest>, layerId: string): CapRequest[] {
  const prefix = `${layerId}:`;
  return Object.entries(requestsByKey).flatMap(([key, request]) => (key.startsWith(prefix) ? [request] : []));
}

interface CapPlane {
  id: string;
  section: TilesetSection | null;
  face: FacePlane | null;
}

function removedSide(plane: CapPlane): CutHalfSpace {
  if (plane.face) return { normal: plane.face.normal, offset: plane.face.offset };
  const section = plane.section;
  if (!section) return { normal: [0, 0, 1], offset: 0 };
  const index = section.axis === 'x' ? 0 : section.axis === 'y' ? 1 : 2;
  const normal: [number, number, number] = [0, 0, 0];
  normal[index] = section.flip ? -1 : 1;
  return { normal, offset: section.flip ? -section.position : section.position };
}

const NO_ELEMENTS: ReadonlySet<string> = new Set();

function ModelSectionCaps({
  layer,
  tileset,
  assetId,
  plane,
  clippers,
}: {
  layer: Tiles3dLayer;
  tileset: Cesium3DTileset;
  assetId: string;
  plane: CapPlane;
  clippers: readonly CutHalfSpace[];
}) {
  const { id: layerId, visible } = layer;
  const requestKey = `${layerId}:${plane.id}`;
  const request = useCapRequestStore((state) => state.requestsByKey[requestKey]);
  const selected = useElementStore((state) =>
    state.model?.layerId === layerId ? state.selected : NO_ELEMENTS,
  );
  const flip = plane.section?.flip ?? false;
  const axis = plane.section?.axis;
  const position = plane.section?.position;
  const faceNormal = plane.face?.normal;
  const faceOffset = plane.face?.offset;

  useEffect(() => () => dropCapRequest(requestKey), [requestKey]);

  useEffect(() => {
    setCapRequest(requestKey, WAITING);
    const abort = new AbortController();
    const timer = setTimeout(() => {
      const query =
        faceNormal && faceOffset !== undefined
          ? { normal: faceNormal, offset: faceOffset }
          : { axis: axis ?? 'z', position: position ?? 0 };
      fetchSectionCut(assetId, query, abort.signal)
        .then((cut) => {
          if (!abort.signal.aborted) setCapRequest(requestKey, { kind: 'answered', tileset, cut });
        })
        .catch((failure: unknown) => {
          if (abort.signal.aborted) return;
          setCapRequest(requestKey, {
            kind: 'failed',
            message: failure instanceof Error ? failure.message : String(failure),
          });
        });
    }, SECTION_REQUEST_DELAY_MILLISECONDS);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [requestKey, tileset, assetId, axis, position, faceNormal, faceOffset]);

  const answer = request?.kind === 'answered' ? request : null;

  useEffect(() => {
    const viewer = getActiveCesiumViewer();
    if (!answer || !viewer || !visible) return;
    const primitives = sectionCapPrimitives({
      tileset: answer.tileset,
      cut: answer.cut,
      flip,
      selected,
      clippers,
    });
    for (const primitive of primitives) viewer.scene.primitives.add(primitive);
    viewer.scene.requestRender();
    return () => {
      // a renderer switch destroys the viewer and every primitive in it
      if (viewer.isDestroyed()) return;
      for (const primitive of primitives) viewer.scene.primitives.remove(primitive);
      viewer.scene.requestRender();
    };
  }, [answer, flip, visible, selected, clippers]);

  return null;
}

export function SectionCapsOnGlobe() {
  useSyncExternalStore(subscribeTilesetSections, tilesetSectionChangeCount);
  const layers = useTiles3dLayerStore((state) => state.layers);
  const loaded = useTiles3dLayerStore((state) => state.loaded);
  return (
    <>
      {layers.map((layer) => {
        const tileset = loaded[layer.id];
        if (!tileset) return null;
        const section = readTilesetSection(tileset);
        const assetId = tiletopiaAssetId(layer.url);
        if (assetId === null || !sectionFrameIsRootFrame(tileset)) return null;
        const planes: CapPlane[] = [
          ...(section?.enabled ? [{ id: 'axis', section, face: null }] : []),
          ...readFacePlanes(tileset).map((face) => ({ id: face.id, section: null, face })),
        ];
        if (planes.length === 0) return null;
        return planes.map((plane) => (
          <ModelSectionCaps
            key={`${layer.id}:${plane.id}`}
            layer={layer}
            tileset={tileset}
            assetId={assetId}
            plane={plane}
            clippers={planes.filter((other) => other.id !== plane.id).map(removedSide)}
          />
        ));
      })}
    </>
  );
}

export function SectionCapNote({
  layer,
  tileset,
  enabled,
}: {
  layer: Tiles3dLayer;
  tileset: Cesium3DTileset;
  enabled: boolean;
}) {
  const requestsByKey = useCapRequestStore((state) => state.requestsByKey);
  const requests = requestsForLayer(requestsByKey, layer.id);
  const request = requests.find((known) => known.kind === 'failed')
    ?? requests.find((known) => known.kind === 'waiting')
    ?? requests.find((known) => known.kind === 'answered')
    ?? WAITING;

  if (tiletopiaAssetId(layer.url) === null) {
    return (
      <Text size="xs" c="dimmed" data-testid="model-section-cap-note">
        Only a model stored in tiletopia gets a filled cut, so this cut stays open and walls and slabs show
        their insides.
      </Text>
    );
  }
  if (!sectionFrameIsRootFrame(tileset)) {
    return (
      <Text size="xs" c="dimmed" data-testid="model-section-cap-note">
        This model's coordinates are earth-fixed, so its axes here are east, north and up, and tiletopia
        fills a cut only along the axes the model is stored in. The cut stays open.
      </Text>
    );
  }
  if (!enabled) return null;
  if (request.kind === 'failed') {
    return (
      <Text size="xs" c="red" data-testid="model-section-cap-error">
        {request.message}
      </Text>
    );
  }
  if (request.kind === 'waiting') {
    return (
      <Text size="xs" c="dimmed" data-testid="model-section-cap-note">
        Reading the cut from tiletopia.
      </Text>
    );
  }
  const dropped = request.cut.openChainsDropped;
  if (dropped === 0) return null;
  return (
    <Text size="xs" c="dimmed" data-testid="model-section-cap-note">
      {dropped === 1
        ? '1 outline of the cut did not close and stays open.'
        : `${dropped} outlines of the cut did not close and stay open.`}
    </Text>
  );
}
