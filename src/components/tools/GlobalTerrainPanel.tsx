import { useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  Switch,
  Select,
  Slider,
} from '@mantine/core';
import { IconWorld, IconX } from '@tabler/icons-react';

export function GlobalTerrainPanel({ onClose }: { onClose: () => void }) {
  const [enabled, setEnabled] = useState(false);
  const [provider, setProvider] = useState<string | null>('cesium');
  const [exaggeration, setExaggeration] = useState(1);

  return (
    <Paper
      shadow="xl"
      radius="md"
      p="sm"
      style={{
        position: 'absolute',
        top: 60,
        right: 16,
        width: 260,
        background: '#161b22',
        border: '1px solid #30363d',
        zIndex: 300,
      }}
    >
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconWorld size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Global Terrain
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs">
        <Switch
          size="xs"
          label="Enable Terrain"
          checked={enabled}
          onChange={(e) => setEnabled(e.currentTarget.checked)}
          color="violet"
        />

        <Select
          size="xs"
          label="Provider"
          data={[
            { value: 'cesium', label: 'Cesium World Terrain' },
            { value: 'mapzen', label: 'Mapzen/AWS' },
            { value: 'custom', label: 'Custom URL' },
          ]}
          value={provider}
          onChange={setProvider}
          styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
        />

        <Text size="xs" c="dimmed">Exaggeration: {exaggeration.toFixed(1)}×</Text>
        <Slider size="xs" min={0.5} max={10} step={0.5} value={exaggeration} onChange={setExaggeration} color="violet" />
      </Stack>
    </Paper>
  );
}
