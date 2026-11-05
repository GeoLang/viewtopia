import { useEffect, useSyncExternalStore } from 'react';
import { Text } from '@mantine/core';
import type { Cesium3DTileset } from 'cesium';
import { create } from 'zustand';
import { tiletopiaAssetId, useElementStore } from '../elements/store';
import { useTiles3dLayerStore, type Tiles3dLayer } from '../../store/tiles3dLayers';
import { getActiveCesiumViewer } from '../../viewer/registry';
import { fetchSectionCut, sectionCapPrimitive, type SectionCut } from './sectionCut';
import {
  readTilesetSection,
  sectionFrameIsRootFrame,
  subscribeTilesetSections,
  tilesetSectionChangeCount,
  type TilesetSection,
} from './tilesetSection';

export const SECTION_REQUEST_DELAY_MILLISECONDS = 300;

type CapRequest =
  | { kind: 'waiting' }
  | { kind: 'answered'; tileset: Cesium3DTileset; cut: SectionCut }
  | { kind: 'failed'; message: string };

const WAITING: CapRequest = { kind: 'waiting' };

const useCapRequestStore = create<{ requestsByLayer: Record<string, CapRequest> }>(() => ({
  requestsByLayer: {},
}));

function setCapRequest(layerId: string, request: CapRequest): void {
  useCapRequestStore.setState(({ requestsByLayer }) => ({
    requestsByLayer: { ...requestsByLayer, [layerId]: request },
  }));
}

function dropCapRequest(layerId: string): void {
  useCapRequestStore.setState(({ requestsByLayer }) => {
    const rest = { ...requestsByLayer };
    delete rest[layerId];
    return { requestsByLayer: rest };
  });
}

const NO_ELEMENTS: ReadonlySet<string> = new Set();

function ModelSectionCaps({
  layer,
  tileset,
  assetId,
  section,
}: {
  layer: Tiles3dLayer;
  tileset: Cesium3DTileset;
  assetId: string;
  section: TilesetSection;
}) {
  const { id: layerId, visible } = layer;
  const { axis, position, flip } = section;
  const request = useCapRequestStore((state) => state.requestsByLayer[layerId]);
  const selected = useElementStore((state) =>
    state.model?.layerId === layerId ? state.selected : NO_ELEMENTS,
  );

  useEffect(() => () => dropCapRequest(layerId), [layerId]);

  useEffect(() => {
    setCapRequest(layerId, WAITING);
    const abort = new AbortController();
    const timer = setTimeout(() => {
      fetchSectionCut(assetId, { axis, position }, abort.signal)
        .then((cut) => {
          if (!abort.signal.aborted) setCapRequest(layerId, { kind: 'answered', tileset, cut });
        })
        .catch((failure: unknown) => {
          if (abort.signal.aborted) return;
          setCapRequest(layerId, {
            kind: 'failed',
            message: failure instanceof Error ? failure.message : String(failure),
          });
        });
    }, SECTION_REQUEST_DELAY_MILLISECONDS);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [layerId, tileset, assetId, axis, position]);

  const answer = request?.kind === 'answered' ? request : null;

  useEffect(() => {
    const viewer = getActiveCesiumViewer();
    if (!answer || !viewer || !visible) return;
    const primitive = viewer.scene.primitives.add(
      sectionCapPrimitive({ tileset: answer.tileset, cut: answer.cut, flip, selected }),
    );
    viewer.scene.requestRender();
    return () => {
      // a renderer switch destroys the viewer and every primitive in it
      if (viewer.isDestroyed()) return;
      viewer.scene.primitives.remove(primitive);
      viewer.scene.requestRender();
    };
  }, [answer, flip, visible, selected]);

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
        if (!section?.enabled || assetId === null || !sectionFrameIsRootFrame(tileset)) return null;
        return (
          <ModelSectionCaps key={layer.id} layer={layer} tileset={tileset} assetId={assetId} section={section} />
        );
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
  const request = useCapRequestStore((state) => state.requestsByLayer[layer.id]) ?? WAITING;

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
