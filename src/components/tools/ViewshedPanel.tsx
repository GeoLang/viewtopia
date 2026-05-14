import { useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  Button,
  Slider,
  Switch,
} from '@mantine/core';
import { IconEye, IconX } from '@tabler/icons-react';

export function ViewshedPanel({ onClose }: { onClose: () => void }) {
  const [active, setActive] = useState(false);
  const [observerHeight, setObserverHeight] = useState(2);
  const [radius, setRadius] = useState(1000);
  const [showInvisible, setShowInvisible] = useState(true);

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
          <IconEye size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Viewshed Analysis
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs">
        <Text size="xs" c="dimmed">
          Click on the map to place the observer point.
        </Text>

        <Text size="xs" c="dimmed">Observer Height: {observerHeight}m</Text>
        <Slider size="xs" min={0.5} max={50} step={0.5} value={observerHeight} onChange={setObserverHeight} color="violet" />

        <Text size="xs" c="dimmed">Radius: {radius}m</Text>
        <Slider size="xs" min={100} max={10000} step={100} value={radius} onChange={setRadius} color="violet" />

        <Switch
          size="xs"
          label="Show Non-Visible Areas"
          checked={showInvisible}
          onChange={(e) => setShowInvisible(e.currentTarget.checked)}
          color="violet"
        />

        <Button
          size="xs"
          variant={active ? 'light' : 'filled'}
          color="violet"
          onClick={() => setActive(!active)}
          fullWidth
        >
          {active ? 'Clear Viewshed' : 'Place Observer'}
        </Button>
      </Stack>
    </Paper>
  );
}
