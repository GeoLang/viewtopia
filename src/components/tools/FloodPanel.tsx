import { useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  Switch,
  Slider,
} from '@mantine/core';
import { IconDroplet, IconX } from '@tabler/icons-react';

export function FloodPanel({ onClose }: { onClose: () => void }) {
  const [enabled, setEnabled] = useState(false);
  const [waterLevel, setWaterLevel] = useState(0);
  const [opacity, setOpacity] = useState(70);

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
          <IconDroplet size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Flood Simulation
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs">
        <Switch
          size="xs"
          label="Enable Flood Layer"
          checked={enabled}
          onChange={(e) => setEnabled(e.currentTarget.checked)}
          color="violet"
        />

        <Text size="xs" c="dimmed">Water Level: {waterLevel}m</Text>
        <Slider size="xs" min={0} max={50} step={0.5} value={waterLevel} onChange={setWaterLevel} color="blue" />

        <Text size="xs" c="dimmed">Opacity: {opacity}%</Text>
        <Slider size="xs" min={10} max={100} value={opacity} onChange={setOpacity} color="blue" />

        <Text size="xs" c="dimmed" ta="center" py="xs">
          Adjust water level to preview flood extent over the terrain.
        </Text>
      </Stack>
    </Paper>
  );
}
