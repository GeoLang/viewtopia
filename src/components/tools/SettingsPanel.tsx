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
  TextInput,
} from '@mantine/core';
import { IconSettings, IconX } from '@tabler/icons-react';
import { useAppStore, type Renderer, type Basemap } from '../../store/app';
import { BASEMAP_SELECT_GROUPS, isPmtilesUrl } from '../../hooks/basemapTiles';
import { PluginSettingsPanel } from '../../plugins/PluginSettings';

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
        // above the nav toggle (zIndex 400) so the close X isn't covered
        zIndex: 500,
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
        <Switch
          size="xs"
          label="Show Preview Tools"
          description="Reveal unfinished tools, marked with a Preview badge"
          checked={settings.showPreviewTools}
          onChange={(e) => updateSettings({ showPreviewTools: e.currentTarget.checked })}
          color="violet"
        />
        <Switch
          size="xs"
          label="Use AG-UI agent channel (beta)"
          checked={settings.useAgUiChannel}
          onChange={(e) => updateSettings({ useAgUiChannel: e.currentTarget.checked })}
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
          description="Vector styles render in MapLibre (globe); Cesium and deck.gl show the closest raster"
          data={BASEMAP_SELECT_GROUPS}
          value={settings.defaultBasemap}
          onChange={(v) => v && updateSettings({ defaultBasemap: v as Basemap })}
          styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
        />

        <TextInput
          size="xs"
          label="Self-hosted Basemap URL"
          description={
            settings.selfHostedBasemapUrl.trim()
              ? isPmtilesUrl(settings.selfHostedBasemapUrl)
                ? 'PMTiles archive, styled with the Protomaps basemap layers'
                : 'Treated as a MapLibre style JSON URL'
              : 'Style JSON or .pmtiles URL, used by the Self-hosted basemap'
          }
          placeholder="https://example.com/basemap.pmtiles"
          value={settings.selfHostedBasemapUrl}
          onChange={(e) => updateSettings({ selfHostedBasemapUrl: e.currentTarget.value })}
          styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
        />

        <Divider color="#30363d" />
        <Text size="xs" c="dimmed" fw={600}>Backend</Text>

        <TextInput
          size="xs"
          label="TileTopia URL"
          placeholder="/api/v1"
          value={settings.tiletopiaUrl}
          onChange={(e) => updateSettings({ tiletopiaUrl: e.currentTarget.value })}
          styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
        />

        <TextInput
          size="xs"
          label="GeoLang URL"
          placeholder="/agent"
          value={settings.geolangUrl}
          onChange={(e) => updateSettings({ geolangUrl: e.currentTarget.value })}
          styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
        />

        <TextInput
          size="xs"
          label="LiveKit URL"
          placeholder="wss://livekit.example.com"
          value={settings.livekitUrl}
          onChange={(e) => updateSettings({ livekitUrl: e.currentTarget.value })}
          styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
        />

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

        <Divider color="#30363d" />
        <Text size="xs" c="dimmed" fw={600}>Plugin Settings</Text>
        <PluginSettingsPanel />
      </Stack>
    </Paper>
  );
}
