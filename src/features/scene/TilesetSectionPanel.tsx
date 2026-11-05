import { useState, useSyncExternalStore } from 'react';
import { Button, SegmentedControl, Select, Slider, Stack, Switch, Text } from '@mantine/core';
import { IconSlice } from '@tabler/icons-react';
import type { Cesium3DTileset } from 'cesium';
import { PanelCard, PanelHeader } from '../../components/PanelCard';
import { useAppStore } from '../../store/app';
import { useTiles3dLayerStore, type Tiles3dLayer } from '../../store/tiles3dLayers';
import { getActiveCesiumViewer } from '../../viewer/registry';
import { DEFAULT_CLIP_AXIS, type ClipAxis } from './clipping';
import { SectionCapNote } from './SectionCaps';
import {
  applyTilesetSection,
  disableTilesetSection,
  readTilesetSection,
  setTilesetSectionOutline,
  subscribeTilesetSections,
  tilesetSectionChangeCount,
  tilesetSectionOutlined,
  tilesetSectionRange,
  type TilesetSection,
} from './tilesetSection';

const SLIDER_STEP_METRES = 0.1;

function requestRender(): void {
  getActiveCesiumViewer()?.scene.requestRender();
}

function middleOf(tileset: Cesium3DTileset, axis: ClipAxis): number {
  const { min, max } = tilesetSectionRange(tileset, axis);
  return (min + max) / 2;
}

function ModelSectionControls({ layer, tileset }: { layer: Tiles3dLayer; tileset: Cesium3DTileset }) {
  const section = readTilesetSection(tileset);
  const shown: TilesetSection = section ?? {
    axis: DEFAULT_CLIP_AXIS,
    position: middleOf(tileset, DEFAULT_CLIP_AXIS),
    flip: false,
    enabled: false,
  };
  const range = tilesetSectionRange(tileset, shown.axis);
  const cut = (changes: Partial<TilesetSection>): void => {
    applyTilesetSection(tileset, { ...shown, ...changes }, requestRender);
  };

  return (
    <>
      <Text size="xs" c="dimmed">
        Axis in the model's own frame
      </Text>
      <SegmentedControl
        size="xs"
        fullWidth
        value={shown.axis}
        onChange={(value) => {
          const axis = value as ClipAxis;
          cut({ axis, position: middleOf(tileset, axis) });
        }}
        data={[
          { value: 'x', label: 'X' },
          { value: 'y', label: 'Y' },
          { value: 'z', label: 'Z' },
        ]}
      />
      <Text size="xs" c="dimmed">
        Position: {shown.position.toFixed(1)} m
      </Text>
      <Slider
        size="xs"
        color="violet"
        min={range.min}
        max={range.max}
        step={SLIDER_STEP_METRES}
        value={shown.position}
        onChange={(position) => cut({ position })}
        label={null}
      />
      <Switch
        size="xs"
        color="violet"
        checked={shown.flip}
        onChange={(event) => cut({ flip: event.currentTarget.checked })}
        label="Flip the side that stays"
      />
      <Switch
        size="xs"
        color="violet"
        checked={tilesetSectionOutlined(tileset)}
        onChange={(event) => {
          const visible = event.currentTarget.checked;
          // setTilesetSectionOutline sets edgeWidth on the plane collection, which a whole model lacks
          if (!section) cut({});
          setTilesetSectionOutline(tileset, { visible }, requestRender);
        }}
        label="Red outline along the cut"
      />
      <SectionCapNote layer={layer} tileset={tileset} enabled={shown.enabled} />
      <Button
        size="xs"
        color="violet"
        variant={shown.enabled ? 'light' : 'filled'}
        onClick={() => {
          if (shown.enabled) disableTilesetSection(tileset, requestRender);
          else cut({ enabled: true });
        }}
        fullWidth
      >
        {shown.enabled ? 'Remove Section' : 'Apply Section'}
      </Button>
    </>
  );
}

export function TilesetSectionPanel({ onClose }: { onClose: () => void }) {
  useSyncExternalStore(subscribeTilesetSections, tilesetSectionChangeCount);
  const renderer = useAppStore((s) => s.renderer);
  const activeTab = useAppStore((s) => s.activeTab);
  const layers = useTiles3dLayerStore((s) => s.layers);
  const loaded = useTiles3dLayerStore((s) => s.loaded);
  const models = layers.filter((layer) => loaded[layer.id]);
  const [layerId, setLayerId] = useState<string | null>(null);
  const chosenId = layerId ?? models[0]?.id ?? null;
  const chosenLayer = models.find((layer) => layer.id === chosenId);
  const tileset = chosenId === null ? undefined : loaded[chosenId];

  const onCesium = activeTab === 'globe' && renderer === 'cesium';

  return (
    <PanelCard width={280}>
      <PanelHeader icon={<IconSlice size={16} />} title="Model Section" onClose={onClose} />

      {!onCesium && (
        <Text size="xs" c="dimmed" data-testid="model-section-note">
          Cesium only: switch renderer to CesiumJS to section a model.
        </Text>
      )}
      {onCesium && !tileset && (
        <Text size="xs" c="dimmed" data-testid="model-section-empty">
          No 3D model is loaded on the globe.
        </Text>
      )}
      {onCesium && chosenLayer && tileset && (
        <Stack gap="xs">
          <Select
            size="xs"
            label="Model"
            allowDeselect={false}
            data={models.map((layer) => ({ value: layer.id, label: layer.name }))}
            value={chosenId}
            onChange={setLayerId}
          />
          <ModelSectionControls layer={chosenLayer} tileset={tileset} />
        </Stack>
      )}
    </PanelCard>
  );
}
