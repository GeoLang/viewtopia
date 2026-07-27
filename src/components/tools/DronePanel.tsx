import { useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  NumberInput,
  Slider,
  Button,
} from '@mantine/core';
import { IconDrone, IconX, IconPlayerPlay, IconPlayerPause } from '@tabler/icons-react';

export function DronePanel({ onClose }: { onClose: () => void }) {
  const [altitude, setAltitude] = useState<number | string>(100);
  const [speed, setSpeed] = useState(5);
  const [waypoints, setWaypoints] = useState(0);
  const [drawing, setDrawing] = useState(false);
  const [simulating, setSimulating] = useState(false);

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
          <IconDrone size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Drone Flight Planner
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs">
        <NumberInput
          size="xs"
          label="Altitude (m)"
          value={altitude}
          onChange={setAltitude}
          min={10}
          max={500}
          styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
        />

        <Text size="xs" c="dimmed">Speed: {speed} m/s</Text>
        <Slider size="xs" min={1} max={20} value={speed} onChange={setSpeed} color="violet" />

        <Button
          size="xs"
          variant={drawing ? 'light' : 'filled'}
          color="violet"
          onClick={() => {
            setDrawing(!drawing);
            if (!drawing) setWaypoints(0);
          }}
          fullWidth
        >
          {drawing ? `Drawing... (${waypoints} pts)` : 'Draw Flight Path'}
        </Button>

        <Button
          size="xs"
          variant="filled"
          color="violet"
          leftSection={simulating ? <IconPlayerPause size={14} /> : <IconPlayerPlay size={14} />}
          onClick={() => setSimulating(!simulating)}
          disabled={waypoints === 0 && !simulating}
          fullWidth
        >
          {simulating ? 'Stop Simulation' : 'Simulate Flight'}
        </Button>
      </Stack>
    </Paper>
  );
}
