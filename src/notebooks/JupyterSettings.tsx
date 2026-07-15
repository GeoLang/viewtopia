/**
 * JupyterSettings — UI for connecting to a Jupyter kernel.
 */
import { useState, useEffect } from 'react';
import {
  Stack,
  Group,
  TextInput,
  PasswordInput,
  Button,
  Badge,
  Text,
  Paper,
  Alert,
  Divider,
} from '@mantine/core';
import { IconBrandPython, IconPlugConnected, IconPlugConnectedX, IconRefresh } from '@tabler/icons-react';
import { createKernelClient, getKernelClient, disconnectKernel, loadKernelConfig, saveKernelConfig, type KernelStatus, type KernelConfig } from './jupyter';

export function JupyterSettings() {
  const saved = loadKernelConfig();
  const [baseUrl, setBaseUrl] = useState(saved.baseUrl);
  const [token, setToken] = useState(saved.token);
  const [kernelName, setKernelName] = useState(saved.kernelName ?? 'python3');
  const [status, setStatus] = useState<KernelStatus>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    const client = getKernelClient();
    if (client) {
      setStatus(client.getStatus());
      return client.onStatusChange(setStatus);
    }
  }, []);

  async function handleConnect() {
    setError(null);
    setConnecting(true);
    try {
      const config: KernelConfig = { baseUrl, token, kernelName };
      const client = createKernelClient(config);
      client.onStatusChange(setStatus);
      await client.connect();
      saveKernelConfig(config);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setConnecting(false);
    }
  }

  function handleDisconnect() {
    disconnectKernel();
    setStatus('disconnected');
  }

  async function handleRestart() {
    const client = getKernelClient();
    if (client) {
      await client.restart();
    }
  }

  const statusColor = {
    disconnected: 'gray',
    connecting: 'yellow',
    idle: 'green',
    busy: 'blue',
    error: 'red',
  }[status];

  const isConnected = status === 'idle' || status === 'busy';

  return (
    <Paper p="md" withBorder>
      <Stack>
        <Group>
          <IconBrandPython size={20} />
          <Text fw={600} size="sm">Jupyter Kernel</Text>
          <Badge color={statusColor} variant="dot" size="sm">{status}</Badge>
        </Group>

        {error && (
          <Alert color="red" variant="light" title="Connection Error">
            {error}
          </Alert>
        )}

        {!isConnected ? (
          <>
            <TextInput
              label="Jupyter Server URL"
              placeholder="/jupyter"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.currentTarget.value)}
              size="xs"
            />
            <PasswordInput
              label="Token"
              placeholder="Jupyter authentication token"
              value={token}
              onChange={(e) => setToken(e.currentTarget.value)}
              size="xs"
            />
            <TextInput
              label="Kernel Name"
              placeholder="python3"
              value={kernelName}
              onChange={(e) => setKernelName(e.currentTarget.value)}
              size="xs"
            />
            <Button
              leftSection={<IconPlugConnected size={14} />}
              onClick={handleConnect}
              loading={connecting}
              size="xs"
            >
              Connect
            </Button>
            <Text size="xs" c="dimmed">
              Defaults to the platform's built-in kernel at <code>/jupyter</code>. Override to use your own server.
            </Text>
          </>
        ) : (
          <>
            <Text size="xs" c="dimmed">Connected to {baseUrl}</Text>
            <Group>
              <Button
                size="xs"
                variant="light"
                leftSection={<IconRefresh size={14} />}
                onClick={handleRestart}
              >
                Restart Kernel
              </Button>
              <Button
                size="xs"
                variant="light"
                color="red"
                leftSection={<IconPlugConnectedX size={14} />}
                onClick={handleDisconnect}
              >
                Disconnect
              </Button>
            </Group>
          </>
        )}
      </Stack>
    </Paper>
  );
}
