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
import { IconCamera, IconX } from '@tabler/icons-react';

export function PhotoPanel({ onClose }: { onClose: () => void }) {
  const [enabled, setEnabled] = useState(false);
  const [radius, setRadius] = useState(500);

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
          <IconCamera size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Street-Level Photos
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs">
        <Switch
          size="xs"
          label="Show Photo Markers"
          checked={enabled}
          onChange={(e) => setEnabled(e.currentTarget.checked)}
          color="violet"
        />

        <Text size="xs" c="dimmed">Search Radius: {radius}m</Text>
        <Slider size="xs" min={100} max={5000} step={100} value={radius} onChange={setRadius} color="violet" />

        <Text size="xs" c="dimmed" ta="center" py="xs">
          Click the map to find nearby street-level imagery from Mapillary and Wikimedia Commons.
        </Text>
      </Stack>
    </Paper>
  );
}
