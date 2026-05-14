import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  Switch,
  Select,
  Slider,
  Divider,
} from '@mantine/core';
import { IconSettings, IconX } from '@tabler/icons-react';
import { useAppStore, type Renderer, type Basemap } from '../../store/app';

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const { settings, updateSettings } = useAppStore();

  return (
    <Paper
      shadow="xl"
      radius="md"
      p="sm"
      style={{
        position: 'absolute',
        top: 60,
        right: 16,
        width: 300,
        background: '#161b22',
        border: '1px solid #30363d',
        zIndex: 300,
      }}
    >
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconSettings size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Settings
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs">
        <Text size="xs" c="dimmed" fw={600}>Display</Text>
        <Switch
          size="xs"
          label="Show Minimap"
          checked={settings.showMinimap}
          onChange={(e) => updateSettings({ showMinimap: e.currentTarget.checked })}
          color="violet"
        />
        <Switch
          size="xs"
          label="Show Coordinate Readout"
          checked={settings.showCoordReadout}
          onChange={(e) => updateSettings({ showCoordReadout: e.currentTarget.checked })}
          color="violet"
        />

        <Divider color="#30363d" />
        <Text size="xs" c="dimmed" fw={600}>Defaults</Text>

        <Select
          size="xs"
          label="Default Renderer"
          data={[
            { value: 'cesium', label: 'CesiumJS' },
            { value: 'deckgl', label: 'deck.gl' },
            { value: 'maplibre', label: 'MapLibre' },
          ]}
          value={settings.defaultRenderer}
          onChange={(v) => v && updateSettings({ defaultRenderer: v as Renderer })}
          styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
        />

        <Select
          size="xs"
          label="Default Basemap"
          data={[
            { value: 'osm', label: 'OpenStreetMap' },
            { value: 'satellite', label: 'Satellite' },
            { value: 'topo', label: 'Topo' },
            { value: 'dark', label: 'Dark' },
          ]}
          value={settings.defaultBasemap}
          onChange={(v) => v && updateSettings({ defaultBasemap: v as Basemap })}
          styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
        />

        <Divider color="#30363d" />
        <Text size="xs" c="dimmed" fw={600}>Backend</Text>

        <Text size="xs" c="dimmed">Probe Interval: {settings.probeIntervalSec}s</Text>
        <Slider
          size="xs"
          min={5}
          max={120}
          step={5}
          value={settings.probeIntervalSec}
          onChange={(v) => updateSettings({ probeIntervalSec: v })}
          color="violet"
        />
      </Stack>
    </Paper>
  );
}
