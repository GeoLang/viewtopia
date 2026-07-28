import { useEffect, useState } from 'react';
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
import { apiHeaders } from '../../lib/apiAuth';
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
        <Divider color="#30363d" />
        <Text size="xs" c="dimmed" fw={600}>Defaults</Text>

        <Select
          size="xs"
          label="Default Renderer"
          data={[
            { value: 'cesium', label: 'CesiumJS' },
            { value: 'maplibre', label: 'MapLibre' },
          ]}
          value={settings.defaultRenderer}
          onChange={(v) => v && updateSettings({ defaultRenderer: v as Renderer })}
          styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
        />

        <Select
          size="xs"
          label="Default Basemap"
          description="Vector styles render in MapLibre (globe); Cesium shows the closest raster"
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
        <Text size="xs" c="dimmed" fw={600}>AI Model</Text>
        <AiModelSelect />

        <Divider color="#30363d" />
        <Text size="xs" c="dimmed" fw={600}>Plugin Settings</Text>
        <PluginSettingsPanel />
      </Stack>
    </Paper>
  );
}

interface ModelProfile {
  id: string;
  label: string;
  model: string;
  available: boolean;
}

interface ModelsResponse {
  active?: string;
  profiles?: ModelProfile[];
}

const SWITCH_ERRORS: Record<number, string> = {
  404: 'That model is not configured.',
  409: 'That model cannot be reached right now.',
  503: 'The agent service is down.',
};

/**
 * Which model the agent answers with, read from and written to geolang-api.
 * With no agent service on the other end the section stays inert rather than
 * failing: nothing else in the panel depends on it.
 */
function AiModelSelect() {
  const [profiles, setProfiles] = useState<ModelProfile[] | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      const res = await fetch('/agent/models').catch(() => null);
      const body: ModelsResponse | null = res?.ok ? await res.json().catch(() => null) : null;
      if (!live) return;
      setProfiles(body?.profiles ?? []);
      setActive(body?.active ?? null);
    })();
    return () => {
      live = false;
    };
  }, []);

  const switchModel = async (id: string | null) => {
    if (!id || id === active) return;
    const previous = active;
    setActive(id);
    setError(null);
    setBusy(true);
    const res = await fetch('/agent/model', {
      method: 'PUT',
      headers: apiHeaders(),
      body: JSON.stringify({ id }),
    }).catch(() => null);
    setBusy(false);
    if (res?.ok) return;
    setActive(previous);
    setError(
      res
        ? (SWITCH_ERRORS[res.status] ?? `Switch failed: HTTP ${res.status}`)
        : 'The agent service is unreachable.',
    );
  };

  const data = (profiles ?? []).map((p) => ({
    value: p.id,
    label: p.available ? p.label : `${p.label} (unavailable)`,
    disabled: !p.available,
  }));

  return (
    <Select
      size="xs"
      label="Model"
      description="A switch applies to new messages only."
      placeholder={profiles === null ? 'Loading…' : 'Unavailable'}
      data={data}
      value={active}
      disabled={busy || data.length === 0}
      error={error}
      onChange={switchModel}
      data-testid="ai-model-select"
      errorProps={{ 'data-testid': 'ai-model-error' }}
      styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
    />
  );
}
