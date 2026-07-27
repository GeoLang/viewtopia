import { useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  TextInput,
  Switch,
} from '@mantine/core';
import { IconBrandGoogle, IconX } from '@tabler/icons-react';

export function Google3DPanel({ onClose }: { onClose: () => void }) {
  const [apiKey, setApiKey] = useState('');
  const [enabled, setEnabled] = useState(false);

  return (
    <Paper
      shadow="xl"
      radius="md"
      p="sm"
      style={{
        position: 'absolute',
        top: 60,
        right: 16,
        width: 280,
        background: '#161b22',
        border: '1px solid #30363d',
        zIndex: 300,
      }}
    >
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconBrandGoogle size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Google 3D Tiles
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs">
        <TextInput
          size="xs"
          label="Google Maps API Key"
          placeholder="Enter API key…"
          value={apiKey}
          onChange={(e) => setApiKey(e.currentTarget.value)}
          type="password"
          styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
        />

        <Switch
          size="xs"
          label="Enable Photorealistic 3D Tiles"
          checked={enabled}
          onChange={(e) => setEnabled(e.currentTarget.checked)}
          disabled={!apiKey.trim()}
          color="violet"
        />

        <Text size="xs" c="dimmed">
          Loads Google's photorealistic 3D tiles as a Cesium tileset. Requires a valid Maps Platform API key.
        </Text>
      </Stack>
    </Paper>
  );
}
