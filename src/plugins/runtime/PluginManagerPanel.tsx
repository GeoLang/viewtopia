import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Divider,
  Group,
  Loader,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { IconAlertTriangle, IconPlug, IconRefresh } from '@tabler/icons-react';
import { PanelCard, PanelHeader } from '../../components/PanelCard';
import { useAppStore } from '../../store/app';
import {
  getPluginLoadErrors,
  installPlugin,
  removePlugin,
  usePluginRuntimeVersion,
} from './manager';
import { fetchRegistry, resolveRegistryUrl, type RegistryEntry } from './registrySource';
import { listInstalledPlugins, type InstalledPlugin } from './storage';

const PANEL_WIDTH = 380;

const NO_REGISTRY =
  'No plugin registry is configured. Set VITE_PLUGIN_REGISTRY_URL at build time, or point this at your own registry document.';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function PluginManagerPanel({ onClose }: { onClose: () => void }) {
  const registrySetting = useAppStore((s) => s.settings.pluginRegistryUrl);
  const updateSettings = useAppStore((s) => s.updateSettings);
  // re-renders when a boot load records a failure against a plugin listed here
  usePluginRuntimeVersion();
  const registryUrl = resolveRegistryUrl(registrySetting);

  const [installed, setInstalled] = useState<InstalledPlugin[]>([]);
  const [available, setAvailable] = useState<RegistryEntry[] | null>(null);
  const [registryError, setRegistryError] = useState<string | null>(null);
  const [loadingRegistry, setLoadingRegistry] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const refreshInstalled = useCallback(() => {
    listInstalledPlugins()
      .then(setInstalled)
      .catch((error) => setActionError(errorMessage(error)));
  }, []);

  useEffect(refreshInstalled, [refreshInstalled]);

  const loadRegistry = useCallback(() => {
    if (!registryUrl) {
      setAvailable(null);
      setRegistryError(null);
      return;
    }
    setLoadingRegistry(true);
    setRegistryError(null);
    fetchRegistry(registryUrl)
      .then(setAvailable)
      .catch((error) => {
        setAvailable(null);
        setRegistryError(errorMessage(error));
      })
      .finally(() => setLoadingRegistry(false));
  }, [registryUrl]);

  useEffect(loadRegistry, [loadRegistry]);

  const runAction = async (id: string, action: () => Promise<void>) => {
    setBusyId(id);
    setActionError(null);
    setConfirmId(null);
    try {
      await action();
    } catch (error) {
      setActionError(`${id}: ${errorMessage(error)}`);
    } finally {
      setBusyId(null);
      refreshInstalled();
    }
  };

  const loadErrors = getPluginLoadErrors();
  const installedById = new Map(installed.map((plugin) => [plugin.id, plugin]));
  const notInstalled = (available ?? []).filter((entry) => !installedById.has(entry.id));

  return (
    <PanelCard width={PANEL_WIDTH} maxHeight="calc(100vh - 100px)" testId="plugin-manager-panel">
      <PanelHeader
        icon={<IconPlug size={16} />}
        title="Plugin Manager"
        onClose={onClose}
        badge={<Badge size="xs" variant="light">{installed.length}</Badge>}
      />

      <Stack gap="xs" style={{ overflowY: 'auto' }}>
        <TextInput
          size="xs"
          label="Plugin Registry URL"
          description="https, or http on localhost. Empty uses the URL this build was configured with."
          placeholder="https://plugins.example.com/registry.json"
          value={registrySetting}
          onChange={(e) => updateSettings({ pluginRegistryUrl: e.currentTarget.value })}
        />

        {!registryUrl && (
          <Text size="xs" c="dimmed">
            {NO_REGISTRY}
          </Text>
        )}

        {actionError && (
          <Alert color="red" icon={<IconAlertTriangle size={14} />} p="xs">
            <Text size="xs">{actionError}</Text>
          </Alert>
        )}

        {installed.length > 0 && (
          <>
            <Divider label="Installed" labelPosition="left" />
            {installed.map((plugin) => {
              const entry = (available ?? []).find((candidate) => candidate.id === plugin.id);
              const updatable = entry && entry.version !== plugin.version;
              const failure = loadErrors.get(plugin.id);
              return (
                <Stack key={plugin.id} gap={4}>
                  <Group justify="space-between" wrap="nowrap">
                    <div>
                      <Text size="sm" c="white">
                        {plugin.name}{' '}
                        <Text span size="xs" c="dimmed">
                          {plugin.id} v{plugin.version}
                        </Text>
                      </Text>
                    </div>
                    <Group gap={4} wrap="nowrap">
                      {updatable && (
                        <Button
                          size="compact-xs"
                          variant="light"
                          loading={busyId === plugin.id}
                          onClick={() => runAction(plugin.id, () => installPlugin(entry))}
                        >
                          Update to {entry.version}
                        </Button>
                      )}
                      <Button
                        size="compact-xs"
                        variant="subtle"
                        color="red"
                        loading={busyId === plugin.id}
                        onClick={() => runAction(plugin.id, () => removePlugin(plugin.id))}
                      >
                        Remove
                      </Button>
                    </Group>
                  </Group>
                  {failure && (
                    <Alert color="orange" icon={<IconAlertTriangle size={14} />} p="xs">
                      <Text size="xs">Disabled: {failure}</Text>
                    </Alert>
                  )}
                </Stack>
              );
            })}
          </>
        )}

        {registryUrl && (
          <>
            <Divider label="Available" labelPosition="left" />
            <Group justify="space-between">
              <Text size="xs" c="dimmed" style={{ wordBreak: 'break-all' }}>
                {registryUrl}
              </Text>
              <Button
                size="compact-xs"
                variant="subtle"
                leftSection={<IconRefresh size={12} />}
                onClick={loadRegistry}
              >
                Refresh
              </Button>
            </Group>

            {loadingRegistry && <Loader size="xs" />}

            {registryError && (
              <Alert color="red" icon={<IconAlertTriangle size={14} />} p="xs">
                <Text size="xs">Registry unusable: {registryError}</Text>
              </Alert>
            )}

            {available && notInstalled.length === 0 && !loadingRegistry && (
              <Text size="xs" c="dimmed">
                Everything in this registry is installed.
              </Text>
            )}

            {notInstalled.map((entry) => (
              <Stack key={entry.id} gap={4}>
                <Group justify="space-between" wrap="nowrap" align="flex-start">
                  <div>
                    <Text size="sm" c="white">
                      {entry.name}{' '}
                      <Text span size="xs" c="dimmed">
                        {entry.id} v{entry.version}
                      </Text>
                    </Text>
                    {entry.author && (
                      <Text size="xs" c="dimmed">
                        by {entry.author}
                      </Text>
                    )}
                    {entry.description && (
                      <Text size="xs" c="dimmed">
                        {entry.description}
                      </Text>
                    )}
                  </div>
                  {confirmId !== entry.id && (
                    <Button
                      size="compact-xs"
                      variant="light"
                      loading={busyId === entry.id}
                      onClick={() => setConfirmId(entry.id)}
                    >
                      Install
                    </Button>
                  )}
                </Group>
                {confirmId === entry.id && (
                  <Alert color="yellow" p="xs">
                    <Text size="xs">
                      Install {entry.name} v{entry.version} and run its code in this page? It comes
                      from {new URL(entry.url).origin}.
                    </Text>
                    <Group gap={4} mt={4}>
                      <Button
                        size="compact-xs"
                        color="yellow"
                        onClick={() => runAction(entry.id, () => installPlugin(entry))}
                      >
                        Confirm install
                      </Button>
                      <Button size="compact-xs" variant="subtle" onClick={() => setConfirmId(null)}>
                        Cancel
                      </Button>
                    </Group>
                  </Alert>
                )}
              </Stack>
            ))}
          </>
        )}
      </Stack>
    </PanelCard>
  );
}
