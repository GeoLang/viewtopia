import { Fragment } from 'react';
import {
  Text,
  Stack,
  Select,
  Switch,
} from '@mantine/core';
import { IconColumns } from '@tabler/icons-react';
import { PanelCard, PanelHeader } from '../PanelCard';
import { useAppStore, type Basemap } from '../../store/app';
import { basemapSelectGroups } from '../../hooks/basemapTiles';
import {
  useSplitViewStore,
  usePanes,
  paneLayout,
  paneRendererChoices,
  type Pane,
  type PaneRenderer,
  type SplitLayout,
} from '../../store/splitView';

const RENDERER_LABELS: Record<PaneRenderer, string> = {
  cesium: 'CesiumJS (3D)',
  maplibre: 'MapLibre',
  leaflet: 'Leaflet (2D)',
};

/** The renderers one pane may switch to, named the way this panel names them. */
function rendererOptions(panes: Pane[], index: number) {
  return paneRendererChoices(panes, index).map((choice) => ({
    ...choice,
    label: RENDERER_LABELS[choice.value],
  }));
}

const LAYOUTS = [
  { value: 'twoAcross', label: 'Two across' },
  { value: 'grid', label: '2x2 grid' },
];

/** Where each pane sits, by layout and pane index. */
const PANE_LABELS: Record<SplitLayout, string[]> = {
  twoAcross: ['Left pane', 'Right pane'],
  grid: ['Top left pane', 'Top right pane', 'Bottom left pane', 'Bottom right pane'],
};

export function SplitViewPanel({ onClose }: { onClose: () => void }) {
  const activeTab = useAppStore((s) => s.activeTab);
  const localBasemap = useAppStore((s) => s.localBasemap);
  const active = useSplitViewStore((s) => s.active);
  const setActive = useSplitViewStore((s) => s.setActive);
  const setPaneRenderer = useSplitViewStore((s) => s.setPaneRenderer);
  const setPaneBasemap = useSplitViewStore((s) => s.setPaneBasemap);
  const setLayout = useSplitViewStore((s) => s.setLayout);
  const panes = usePanes();
  const layout = paneLayout(panes.length);

  return (
    <PanelCard width={280}>
      <PanelHeader
        icon={<IconColumns size={16} />}
        title="Split View"
        onClose={onClose}
      />

      <Stack gap="xs">
        <Switch
          size="xs"
          label="Enable Split View"
          checked={active}
          onChange={(e) => setActive(e.currentTarget.checked)}
          color="violet"
        />

        <Select
          size="xs"
          label="Layout"
          data={LAYOUTS}
          value={layout}
          onChange={(v) => v && setLayout(v as SplitLayout)}
          allowDeselect={false}
        />

        {panes.map((pane, index) => {
          const label = PANE_LABELS[layout][index] ?? `Pane ${index + 1}`;
          return (
            <Fragment key={label}>
              <Select
                size="xs"
                label={label}
                data={rendererOptions(panes, index)}
                value={pane.renderer}
                onChange={(v) => v && setPaneRenderer(index, v as PaneRenderer)}
                allowDeselect={false}
              />
              <Select
                size="xs"
                label={`${label} basemap`}
                data={basemapSelectGroups(pane.basemap, localBasemap)}
                value={pane.basemap}
                onChange={(v) => v && setPaneBasemap(index, v as Basemap)}
                allowDeselect={false}
              />
            </Fragment>
          );
        })}

        {activeTab !== 'globe' && (
          <Text size="xs" c="orange">
            Every pane is a globe renderer, so the split only shows on the 3D
            Globe tab.
          </Text>
        )}

        <Text size="xs" c="dimmed">
          The panes share the camera and the agent's layers. Tools that act on
          one viewer — Ion tilesets, terrain, OGC layers, draw and measure —
          stay in the top left pane.
        </Text>
      </Stack>
    </PanelCard>
  );
}
