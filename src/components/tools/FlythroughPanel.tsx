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
import { IconMovie, IconX, IconPlayerPlay, IconPlayerPause } from '@tabler/icons-react';

export function FlythroughPanel({ onClose }: { onClose: () => void }) {
  const [recording, setRecording] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [altitude, setAltitude] = useState(200);
  const [smoothing, setSmoothing] = useState(true);
  const [waypoints, setWaypoints] = useState(0);

  return (
    <Paper
      shadow="xl"
      radius="md"
      p="sm"
      style={{
        position: 'absolute',
        top: 60,
        right: 16,
        width: 270,
        background: '#161b22',
        border: '1px solid #30363d',
        zIndex: 300,
      }}
    >
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconMovie size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Flythrough
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs">
        <Button
          size="xs"
          variant={recording ? 'light' : 'filled'}
          color={recording ? 'red' : 'violet'}
          onClick={() => {
            setRecording(!recording);
            if (!recording) setWaypoints(0);
          }}
          fullWidth
        >
          {recording ? `Recording... (${waypoints} pts)` : 'Record Path'}
        </Button>

        <Text size="xs" c="dimmed">Altitude: {altitude}m</Text>
        <Slider size="xs" min={50} max={2000} value={altitude} onChange={setAltitude} color="violet" />

        <Text size="xs" c="dimmed">Speed: {speed}x</Text>
        <Slider size="xs" min={0.25} max={4} step={0.25} value={speed} onChange={setSpeed} color="violet" />

        <Switch
          size="xs"
          label="Smooth Camera"
          checked={smoothing}
          onChange={(e) => setSmoothing(e.currentTarget.checked)}
          color="violet"
        />

        <Button
          size="xs"
          variant="filled"
          color="violet"
          leftSection={playing ? <IconPlayerPause size={14} /> : <IconPlayerPlay size={14} />}
          onClick={() => setPlaying(!playing)}
          fullWidth
        >
          {playing ? 'Stop' : 'Play Flythrough'}
        </Button>
      </Stack>
    </Paper>
  );
}
