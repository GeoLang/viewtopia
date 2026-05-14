import { useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  Button,
  Slider,
  Select,
} from '@mantine/core';
import { IconClock, IconX, IconPlayerPlay, IconPlayerPause } from '@tabler/icons-react';

export function TimelapsePanel({ onClose }: { onClose: () => void }) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [mode, setMode] = useState<string | null>('swipe');
  const [position, setPosition] = useState(50);

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
          <IconClock size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Timelapse
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs">
        <Select
          size="xs"
          label="Comparison Mode"
          data={[
            { value: 'swipe', label: 'Swipe' },
            { value: 'sideBySide', label: 'Side by Side' },
            { value: 'opacity', label: 'Opacity Blend' },
          ]}
          value={mode}
          onChange={setMode}
          styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
        />

        <Text size="xs" c="dimmed">Split Position: {position}%</Text>
        <Slider size="xs" min={0} max={100} value={position} onChange={setPosition} color="violet" />

        <Text size="xs" c="dimmed">Speed: {speed}x</Text>
        <Slider size="xs" min={0.25} max={4} step={0.25} value={speed} onChange={setSpeed} color="violet" />

        <Button
          size="xs"
          variant="filled"
          color="violet"
          leftSection={playing ? <IconPlayerPause size={14} /> : <IconPlayerPlay size={14} />}
          onClick={() => setPlaying(!playing)}
          fullWidth
        >
          {playing ? 'Pause' : 'Play'}
        </Button>
      </Stack>
    </Paper>
  );
}
