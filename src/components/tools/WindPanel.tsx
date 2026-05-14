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
import { IconWind, IconX } from '@tabler/icons-react';

export function WindPanel({ onClose }: { onClose: () => void }) {
  const [enabled, setEnabled] = useState(false);
  const [speed, setSpeed] = useState(10);
  const [direction, setDirection] = useState(180);
  const [style, setStyle] = useState<string | null>('particles');

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
          <IconWind size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Wind Visualization
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs">
        <Switch
          size="xs"
          label="Enable Wind Layer"
          checked={enabled}
          onChange={(e) => setEnabled(e.currentTarget.checked)}
          color="violet"
        />

        <Select
          size="xs"
          label="Style"
          data={[
            { value: 'particles', label: 'Particles' },
            { value: 'arrows', label: 'Arrows' },
            { value: 'streamlines', label: 'Streamlines' },
          ]}
          value={style}
          onChange={setStyle}
          styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
        />

        <Text size="xs" c="dimmed">Speed: {speed} m/s</Text>
        <Slider size="xs" min={0} max={50} value={speed} onChange={setSpeed} color="violet" />

        <Text size="xs" c="dimmed">Direction: {direction}°</Text>
        <Slider size="xs" min={0} max={360} value={direction} onChange={setDirection} color="violet" />
      </Stack>
    </Paper>
  );
}
