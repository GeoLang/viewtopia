import { useState } from 'react';
import {
  Paper,
  Text,
  Group,
  ActionIcon,
  Slider,
  Box,
  Button,
} from '@mantine/core';
import { IconTimeline, IconX, IconPlayerPlay, IconPlayerPause } from '@tabler/icons-react';

export function TimelinePanel({ onClose }: { onClose: () => void }) {
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(50);
  const [speed, setSpeed] = useState(1);

  return (
    <Paper
      shadow="xl"
      radius="md"
      p="sm"
      style={{
        position: 'absolute',
        bottom: 16,
        left: 16,
        right: 16,
        maxWidth: 700,
        background: '#161b22',
        border: '1px solid #30363d',
        zIndex: 300,
      }}
    >
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconTimeline size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Timeline
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Box mb="xs">
        <Slider
          size="sm"
          min={0}
          max={100}
          value={current}
          onChange={setCurrent}
          color="violet"
          marks={[
            { value: 0, label: 'Start' },
            { value: 50, label: 'Mid' },
            { value: 100, label: 'End' },
          ]}
        />
      </Box>

      <Group gap="xs" justify="center">
        <Button
          size="xs"
          variant="subtle"
          color="violet"
          onClick={() => setSpeed(Math.max(0.25, speed / 2))}
        >
          ½×
        </Button>
        <Button
          size="xs"
          variant="filled"
          color="violet"
          leftSection={playing ? <IconPlayerPause size={14} /> : <IconPlayerPlay size={14} />}
          onClick={() => setPlaying(!playing)}
        >
          {playing ? 'Pause' : 'Play'}
        </Button>
        <Button
          size="xs"
          variant="subtle"
          color="violet"
          onClick={() => setSpeed(Math.min(8, speed * 2))}
        >
          2×
        </Button>
        <Text size="xs" c="dimmed">
          Speed: {speed}×
        </Text>
      </Group>
    </Paper>
  );
}
