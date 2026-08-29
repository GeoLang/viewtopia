import { useCallback, useEffect, useState } from 'react';
import {
  Text,
  Stack,
  Switch,
  Select,
  Slider,
  Divider,
  TextInput,
  PasswordInput,
  Button,
  Group,
  ActionIcon,
  Radio,
  Badge,
} from '@mantine/core';
import { IconSettings, IconPlus, IconPencil, IconTrash } from '@tabler/icons-react';
import { PanelCard, PanelHeader } from '../PanelCard';
import { useAppStore, type Renderer, type Basemap } from '../../store/app';
import { BASEMAP_SELECT_GROUPS, isPmtilesUrl } from '../../hooks/basemapTiles';
import { apiHeaders, noticeRefusal } from '../../lib/apiAuth';
import { PluginSettingsPanel } from '../../plugins/PluginSettings';

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const { settings, updateSettings } = useAppStore();

  return (
    <PanelCard width={340} maxHeight="calc(100vh - 120px)" testId="settings-panel">
      <PanelHeader
        icon={<IconSettings size={16} />}
        title="Settings"
        onClose={onClose}
      />

      <Stack gap="xs" flex={1} style={{ overflowY: 'auto' }}>
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
        <Divider color="var(--mantine-color-dark-5)" />
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
        />

        <Select
          size="xs"
          label="Default Basemap"
          description="Vector styles render in MapLibre (globe); Cesium shows the closest raster"
          data={BASEMAP_SELECT_GROUPS}
          value={settings.defaultBasemap}
          onChange={(v) => v && updateSettings({ defaultBasemap: v as Basemap })}
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
        />

        <Divider color="var(--mantine-color-dark-5)" />
        <Text size="xs" c="dimmed" fw={600}>Backend</Text>

        <TextInput
          size="xs"
          label="TileTopia URL"
          placeholder="/api/v1"
          value={settings.tiletopiaUrl}
          onChange={(e) => updateSettings({ tiletopiaUrl: e.currentTarget.value })}
        />

        <TextInput
          size="xs"
          label="GeoLang URL"
          placeholder="/agent"
          value={settings.geolangUrl}
          onChange={(e) => updateSettings({ geolangUrl: e.currentTarget.value })}
        />

        <TextInput
          size="xs"
          label="LiveKit URL"
          placeholder="wss://livekit.example.com"
          value={settings.livekitUrl}
          onChange={(e) => updateSettings({ livekitUrl: e.currentTarget.value })}
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

        <Divider color="var(--mantine-color-dark-5)" />
        <Text size="xs" c="dimmed" fw={600}>AI Model</Text>
        <AiModelSelect />

        <Divider color="var(--mantine-color-dark-5)" />
        <Text size="xs" c="dimmed" fw={600}>Plugin Settings</Text>
        <PluginSettingsPanel />
      </Stack>
    </PanelCard>
  );
}

type ModelServer = 'local' | 'cloud';

interface ModelProfile {
  id: string;
  label: string;
  model: string;
  server?: ModelServer;
  provider?: string;
  available: boolean;
  reachable?: boolean;
}

interface ModelProvider {
  id: string;
  label: string;
  server: ModelServer;
  base: string;
  models: string[];
  has_key: boolean;
  reachable?: boolean;
}

interface ModelsResponse {
  active?: string;
  profiles?: ModelProfile[];
  providers?: ModelProvider[];
}

const SWITCH_ERRORS: Record<number, string> = {
  404: 'That model is not configured.',
  409: 'That model cannot be reached right now.',
  503: 'The agent service is down.',
};

const CLOUD_PRESETS = [
  { id: 'xai', label: 'xAI (Grok)', base: 'https://api.x.ai/v1', model: 'grok-4-1-fast-reasoning' },
  { id: 'anthropic', label: 'Anthropic (Claude)', base: 'https://api.anthropic.com/v1', model: 'claude-sonnet-4-5' },
  { id: 'custom', label: 'Custom (OpenAI-compatible)', base: '', model: '' },
] as const;

type FormMode = { kind: 'add'; server: ModelServer } | { kind: 'edit'; id: string };

function isUsable(profile: ModelProfile): boolean {
  return profile.available && profile.reachable !== false;
}

function profileId(provider: string, model: string): string {
  return `${provider}:${model}`;
}

/** sibyl names what it rejected in a JSON `error` field, so show that rather than a generic line */
async function refusalReason(res: Response): Promise<string | null> {
  const body: unknown = await res.json().catch(() => null);
  if (!body || typeof body !== 'object') return null;
  const reason = (body as { error?: unknown }).error;
  return typeof reason === 'string' && reason ? reason : null;
}

/**
 * Which model the agent answers with. Providers are listed so several cloud
 * APIs and several local servers can sit side by side. Keys are write-only.
 */
function AiModelSelect() {
  const [profiles, setProfiles] = useState<ModelProfile[] | null>(null);
  const [providers, setProviders] = useState<ModelProvider[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<FormMode | null>(null);
  const [label, setLabel] = useState('');
  const [base, setBase] = useState('');
  const [models, setModels] = useState('');
  const [key, setKey] = useState('');
  const [preset, setPreset] = useState('custom');

  const applyBody = useCallback((body: ModelsResponse) => {
    setProfiles(body.profiles ?? []);
    setProviders(body.providers ?? []);
    setActive(body.active ?? null);
  }, []);

  useEffect(() => {
    let live = true;
    (async () => {
      const res = await fetch('/agent/models', { headers: apiHeaders() }).catch(() => null);
      if (res) noticeRefusal(res.status);
      const body: ModelsResponse | null = res?.ok ? await res.json().catch(() => null) : null;
      if (!live) return;
      if (!body) {
        setProfiles([]);
        return;
      }
      applyBody(body);
    })();
    return () => {
      live = false;
    };
  }, [applyBody]);

  const refresh = async () => {
    const res = await fetch('/agent/models', { headers: apiHeaders() }).catch(() => null);
    if (res) noticeRefusal(res.status);
    const body: ModelsResponse | null = res?.ok ? await res.json().catch(() => null) : null;
    if (body) applyBody(body);
  };

  const switchModel = async (id: string | null) => {
    if (!id || id === active) return false;
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
    if (res) noticeRefusal(res.status);
    if (res?.ok) return true;
    setActive(previous);
    setError(
      res
        ? (SWITCH_ERRORS[res.status] ?? `Switch failed: HTTP ${res.status}`)
        : 'The agent service is unreachable.',
    );
    return false;
  };

  const openAdd = (server: ModelServer) => {
    setForm({ kind: 'add', server });
    setLabel('');
    setBase(server === 'cloud' ? 'https://api.x.ai/v1' : '');
    setModels(server === 'cloud' ? 'grok-4-1-fast-reasoning' : '');
    setKey('');
    setPreset(server === 'cloud' ? 'xai' : 'custom');
    setError(null);
  };

  const openEdit = (provider: ModelProvider) => {
    setForm({ kind: 'edit', id: provider.id });
    setLabel(provider.label);
    setBase(provider.base);
    setModels(provider.models.join(', '));
    setKey('');
    setPreset(
      CLOUD_PRESETS.find((item) => item.id !== 'custom' && item.base === provider.base)?.id
        ?? 'custom',
    );
    setError(null);
  };

  const saveProvider = async () => {
    // formServer is only undefined when the edited provider vanished under the form
    if (!form || !formServer) return;
    const trimmedBase = base.trim().replace(/\/$/, '');
    const trimmedModels = models.trim();
    const trimmedKey = key.trim();
    const trimmedLabel = label.trim();
    if (!trimmedBase || !trimmedModels) {
      setError('A base URL and at least one model name are required.');
      return;
    }
    const editing = form.kind === 'edit' ? providers.find((p) => p.id === form.id) : undefined;
    if (formServer === 'cloud' && !trimmedKey && !editing?.has_key) {
      setError('Cloud needs an API key.');
      return;
    }
    setError(null);
    setBusy(true);
    const payload: Record<string, string> = {
      server: formServer,
      base: trimmedBase,
      models: trimmedModels,
    };
    if (form.kind === 'edit') payload.id = form.id;
    else if (preset !== 'custom') payload.id = preset;
    if (trimmedLabel) payload.label = trimmedLabel;
    else if (preset !== 'custom') {
      const named = CLOUD_PRESETS.find((item) => item.id === preset);
      if (named) payload.label = named.label;
    }
    if (trimmedKey) payload.key = trimmedKey;
    const res = await fetch('/agent/model/providers', {
      method: 'PUT',
      headers: apiHeaders(),
      body: JSON.stringify(payload),
    }).catch(() => null);
    setBusy(false);
    if (res) noticeRefusal(res.status);
    if (!res?.ok) {
      if (!res) {
        setError('The agent service is unreachable.');
        return;
      }
      const reason = res.status === 400 ? await refusalReason(res) : null;
      setError(
        reason
          ?? (res.status === 400
            ? 'That provider was refused.'
            : (SWITCH_ERRORS[res.status] ?? `Save failed: HTTP ${res.status}`)),
      );
      return;
    }
    setKey('');
    setForm(null);
    await refresh();
  };

  const deleteProvider = async (id: string) => {
    setError(null);
    setBusy(true);
    const res = await fetch(`/agent/model/providers/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: apiHeaders(),
    }).catch(() => null);
    setBusy(false);
    if (res) noticeRefusal(res.status);
    if (!res?.ok) {
      setError(
        res
          ? (SWITCH_ERRORS[res.status] ?? `Delete failed: HTTP ${res.status}`)
          : 'The agent service is unreachable.',
      );
      return;
    }
    setForm(null);
    await refresh();
  };

  const listed = profiles ?? [];
  const loading = profiles === null;
  const formServer: ModelServer | undefined = !form
    ? undefined
    : form.kind === 'add'
      ? form.server
      : providers.find((p) => p.id === form.id)?.server;

  return (
    <Stack gap="xs" data-testid="ai-model-select">
      <Text size="xs" c="dimmed">
        A switch applies to new messages only. Several cloud APIs and local servers can be saved.
      </Text>
      {error && (
        <Text size="xs" c="red" data-testid="ai-model-error">
          {error}
        </Text>
      )}
      {loading && (
        <Text size="xs" c="dimmed">
          Loading…
        </Text>
      )}
      {!loading && listed.length === 0 && (
        <Text size="xs" c="dimmed">
          Unavailable
        </Text>
      )}
      {providers.map((provider) => {
        const down = provider.server === 'local' && provider.reachable === false;
        return (
          <Stack key={provider.id} gap={4} data-testid={`ai-provider-${provider.id}`}>
            <Group justify="space-between" wrap="nowrap" gap="xs">
              <Group gap={6} wrap="nowrap">
                <Text size="xs" c="white" fw={600} lineClamp={1}>
                  {provider.label}
                </Text>
                <Badge size="xs" variant="light" color={provider.server === 'local' ? 'gray' : 'violet'}>
                  {provider.server}
                </Badge>
                {down && (
                  <Badge size="xs" color="red" data-testid="ai-local-warning">
                    unreachable
                  </Badge>
                )}
              </Group>
              <ActionIcon
                aria-label={`Edit ${provider.label}`}
                size="xs"
                variant="subtle"
                disabled={busy}
                onClick={() => openEdit(provider)}
              >
                <IconPencil size={12} />
              </ActionIcon>
            </Group>
            <Radio.Group value={active ?? ''} onChange={(id) => void switchModel(id)}>
              <Stack gap={2}>
                {provider.models.map((model) => {
                  const id = profileId(provider.id, model);
                  const profile = listed.find((item) => item.id === id);
                  const disabled = busy || (profile ? !isUsable(profile) : provider.server === 'cloud' && !provider.has_key) || down;
                  return (
                    <Radio
                      key={id}
                      size="xs"
                      value={id}
                      disabled={disabled}
                      label={model}
                    />
                  );
                })}
              </Stack>
            </Radio.Group>
          </Stack>
        );
      })}
      <Group gap="xs">
        <Button
          size="compact-xs"
          variant="light"
          color="violet"
          leftSection={<IconPlus size={12} />}
          disabled={busy || loading}
          onClick={() => openAdd('cloud')}
          data-testid="ai-add-cloud"
        >
          Cloud API
        </Button>
        <Button
          size="compact-xs"
          variant="light"
          leftSection={<IconPlus size={12} />}
          disabled={busy || loading}
          onClick={() => openAdd('local')}
          data-testid="ai-add-local"
        >
          Local
        </Button>
      </Group>
      {form && (
        <Stack gap="xs" data-testid="ai-provider-form">
          <Text size="xs" fw={600}>
            {form.kind === 'edit' ? 'Edit provider' : form.server === 'cloud' ? 'Add cloud API' : 'Add local server'}
          </Text>
          {formServer === 'cloud' && (
            <Select
              size="xs"
              label="Preset"
              data={CLOUD_PRESETS.map((item) => ({ value: item.id, label: item.label }))}
              value={preset}
              disabled={busy}
              onChange={(id) => {
                const next = CLOUD_PRESETS.find((item) => item.id === id);
                if (!next) return;
                setPreset(next.id);
                if (next.id === 'custom') return;
                setLabel(next.label);
                setBase(next.base);
                setModels(next.model);
              }}
              comboboxProps={{ withinPortal: true, zIndex: 1500 }}
              data-testid="ai-cloud-provider"
            />
          )}
          <TextInput
            size="xs"
            label="Name"
            placeholder="Anthropic"
            value={label}
            disabled={busy}
            onChange={(e) => setLabel(e.currentTarget.value)}
            data-testid="ai-provider-label"
          />
          <TextInput
            size="xs"
            label="API base URL"
            placeholder={
              formServer === 'local' ? 'http://host.docker.internal:18200/v1' : 'https://api.x.ai/v1'
            }
            value={base}
            disabled={busy}
            onChange={(e) => setBase(e.currentTarget.value)}
            data-testid="ai-cloud-base"
          />
          <TextInput
            size="xs"
            label="Models"
            description="Comma-separated. Each name is one switchable profile."
            placeholder="claude-sonnet-4-5, claude-opus-4"
            value={models}
            disabled={busy}
            onChange={(e) => setModels(e.currentTarget.value)}
            data-testid="ai-cloud-models"
          />
          {formServer === 'cloud' && (
            <PasswordInput
              size="xs"
              label="API key"
              description={
                form.kind === 'edit' && providers.find((p) => p.id === form.id)?.has_key
                  ? 'A key is saved. Paste a new one to replace it.'
                  : 'Saved on the agent, never in this browser.'
              }
              value={key}
              disabled={busy}
              onChange={(e) => setKey(e.currentTarget.value)}
            />
          )}
          <Group gap="xs">
            <Button size="xs" color="violet" loading={busy} onClick={() => void saveProvider()} data-testid="ai-cloud-save">
              Save and use
            </Button>
            <Button size="xs" variant="subtle" disabled={busy} onClick={() => setForm(null)}>
              Cancel
            </Button>
            {form.kind === 'edit' && (
              <ActionIcon
                aria-label="Delete provider"
                size="sm"
                color="red"
                variant="subtle"
                disabled={busy}
                onClick={() => void deleteProvider(form.id)}
                data-testid="ai-provider-delete"
              >
                <IconTrash size={14} />
              </ActionIcon>
            )}
          </Group>
        </Stack>
      )}
    </Stack>
  );
}
