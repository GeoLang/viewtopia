import { useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  Button,
  Slider,
  SegmentedControl,
} from '@mantine/core';
import { IconScissors, IconX } from '@tabler/icons-react';

export function ClippingPanel({ onClose }: { onClose: () => void }) {
  const [axis, setAxis] = useState<'x' | 'y' | 'z'>('z');
  const [position, setPosition] = useState(50);
  const [active, setActive] = useState(false);

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
          <IconScissors size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Clipping Plane
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs">
        <Text size="xs" c="dimmed">Clip Axis</Text>
        <SegmentedControl
          size="xs"
          fullWidth
          value={axis}
          onChange={(v) => setAxis(v as 'x' | 'y' | 'z')}
          data={[
            { value: 'x', label: 'X' },
            { value: 'y', label: 'Y' },
            { value: 'z', label: 'Z' },
          ]}
        />

        <Text size="xs" c="dimmed">Position: {position}%</Text>
        <Slider
          size="xs"
          min={0}
          max={100}
          value={position}
          onChange={setPosition}
          color="violet"
        />

        <Button
          size="xs"
          variant={active ? 'light' : 'filled'}
          color="violet"
          onClick={() => setActive(!active)}
          fullWidth
        >
          {active ? 'Disable Clip' : 'Enable Clip'}
        </Button>
      </Stack>
    </Paper>
  );
}
