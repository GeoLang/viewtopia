import {
  Text,
  Stack,
  Select,
  Switch,
} from '@mantine/core';
import { IconColumns } from '@tabler/icons-react';
import { PanelCard, PanelHeader } from '../PanelCard';
import { useAppStore, type Renderer } from '../../store/app';
import { useSplitViewStore, type PaneRenderer } from '../../store/splitView';

/** The globe renderers either pane can show. */
const RENDERERS = [
  { value: 'cesium', label: 'CesiumJS (3D)' },
  { value: 'maplibre', label: 'MapLibre' },
];

export function SplitViewPanel({ onClose }: { onClose: () => void }) {
  const renderer = useAppStore((s) => s.renderer);
  const setRenderer = useAppStore((s) => s.setRenderer);
  const activeTab = useAppStore((s) => s.activeTab);
  const active = useSplitViewStore((s) => s.active);
  const setActive = useSplitViewStore((s) => s.setActive);
  const paneRenderer = useSplitViewStore((s) => s.paneRenderer);
  const setPaneRenderer = useSplitViewStore((s) => s.setPaneRenderer);

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
          label="Left pane"
          data={RENDERERS}
          value={renderer}
          onChange={(v) => v && setRenderer(v as Renderer)}
          allowDeselect={false}
        />

        <Select
          size="xs"
          label="Right pane"
          data={RENDERERS}
          value={paneRenderer}
          onChange={(v) => v && setPaneRenderer(v as PaneRenderer)}
          allowDeselect={false}
        />

        {activeTab !== 'globe' && (
          <Text size="xs" c="orange">
            Both panes are globe renderers, so the split only shows on the 3D
            Globe tab.
          </Text>
        )}

        <Text size="xs" c="dimmed">
          The panes share the camera, the basemap and the agent's layers. Tools
          that act on one viewer — Ion tilesets, terrain, OGC layers, draw and
          measure — stay in the left pane.
        </Text>
      </Stack>
    </PanelCard>
  );
}
