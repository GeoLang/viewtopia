import { useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  Switch,
  Slider,
  Select,
} from '@mantine/core';
import { IconVolume, IconX } from '@tabler/icons-react';

export function NoisePanel({ onClose }: { onClose: () => void }) {
  const [enabled, setEnabled] = useState(false);
  const [source, setSource] = useState<string | null>('traffic');
  const [threshold, setThreshold] = useState(65);

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
          <IconVolume size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Noise Map
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs">
        <Switch
          size="xs"
          label="Enable Noise Layer"
          checked={enabled}
          onChange={(e) => setEnabled(e.currentTarget.checked)}
          color="violet"
        />

        <Select
          size="xs"
          label="Source"
          data={[
            { value: 'traffic', label: '🚗 Traffic' },
            { value: 'air', label: '✈ Air Traffic' },
            { value: 'rail', label: '🚆 Railway' },
            { value: 'industry', label: '🏭 Industrial' },
          ]}
          value={source}
          onChange={setSource}
          styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
        />

        <Text size="xs" c="dimmed">Threshold: {threshold} dB</Text>
        <Slider size="xs" min={30} max={120} value={threshold} onChange={setThreshold} color="orange" />
      </Stack>
    </Paper>
  );
}
