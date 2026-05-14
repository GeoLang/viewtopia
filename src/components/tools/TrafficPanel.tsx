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
import { IconCar, IconX } from '@tabler/icons-react';

export function TrafficPanel({ onClose }: { onClose: () => void }) {
  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState<string | null>('flow');
  const [speed, setSpeed] = useState(1);

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
          <IconCar size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Traffic Flow
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs">
        <Switch
          size="xs"
          label="Enable Traffic Layer"
          checked={enabled}
          onChange={(e) => setEnabled(e.currentTarget.checked)}
          color="violet"
        />

        <Select
          size="xs"
          label="Display Mode"
          data={[
            { value: 'flow', label: 'Animated Flow' },
            { value: 'heatmap', label: 'Congestion Heatmap' },
            { value: 'speed', label: 'Speed Colors' },
          ]}
          value={mode}
          onChange={setMode}
          styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
        />

        <Text size="xs" c="dimmed">Animation Speed: {speed}x</Text>
        <Slider size="xs" min={0.25} max={4} step={0.25} value={speed} onChange={setSpeed} color="violet" />
      </Stack>
    </Paper>
  );
}
