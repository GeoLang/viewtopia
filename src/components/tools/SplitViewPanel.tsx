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
import { useSplitViewStore, usePanes, type PaneRenderer } from '../../store/splitView';

/** The globe renderers either pane can show. */
const RENDERERS = [
  { value: 'cesium', label: 'CesiumJS (3D)' },
  { value: 'maplibre', label: 'MapLibre' },
];

/** Where each pane sits in today's layout, by pane index. */
const PANE_LABELS = ['Left pane', 'Right pane'];

export function SplitViewPanel({ onClose }: { onClose: () => void }) {
  const activeTab = useAppStore((s) => s.activeTab);
  const localBasemap = useAppStore((s) => s.localBasemap);
  const active = useSplitViewStore((s) => s.active);
  const setActive = useSplitViewStore((s) => s.setActive);
  const setPaneRenderer = useSplitViewStore((s) => s.setPaneRenderer);
  const setPaneBasemap = useSplitViewStore((s) => s.setPaneBasemap);
  const panes = usePanes();

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

        {panes.map((pane, index) => {
          const label = PANE_LABELS[index] ?? `Pane ${index + 1}`;
          return (
            <Fragment key={label}>
              <Select
                size="xs"
                label={label}
                data={RENDERERS}
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
            Both panes are globe renderers, so the split only shows on the 3D
            Globe tab.
          </Text>
        )}

        <Text size="xs" c="dimmed">
          The panes share the camera and the agent's layers. Tools that act on
          one viewer — Ion tilesets, terrain, OGC layers, draw and measure —
          stay in the left pane.
        </Text>
      </Stack>
    </PanelCard>
  );
}
