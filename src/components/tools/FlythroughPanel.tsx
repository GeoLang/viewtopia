import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  Button,
  Progress,
  ScrollArea,
  Slider,
  Switch,
} from '@mantine/core';
import {
  IconMovie,
  IconX,
  IconMapPinPlus,
  IconPlayerPlay,
  IconPlayerPause,
  IconPlayerStop,
  IconTrash,
} from '@tabler/icons-react';
import { Math as CesiumMath } from 'cesium';
import type { Viewer } from 'cesium';
import { getActiveCesiumViewer } from '../../viewer/registry';
import { useAppStore } from '../../store/app';
import { pathLength, useCameraFlight, type PathPoint } from '../../lib/cameraPath';

interface Waypoint extends PathPoint {
  id: string;
}

export function FlythroughPanel({ onClose }: { onClose: () => void }) {
  const renderer = useAppStore((s) => s.renderer);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [speed, setSpeed] = useState(200);
  const [smooth, setSmooth] = useState(true);
  const flight = useCameraFlight(viewer);

  useEffect(() => {
    setViewer(getActiveCesiumViewer());
    if (renderer !== 'cesium') return;
    const timer = setInterval(() => {
      const v = getActiveCesiumViewer();
      if (v) {
        setViewer(v);
        clearInterval(timer);
      }
    }, 100);
    return () => clearInterval(timer);
  }, [renderer]);

  const addWaypoint = () => {
    const carto = viewer?.camera.positionCartographic;
    if (!carto) return;
    flight.stop();
    setWaypoints((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        longitude: CesiumMath.toDegrees(carto.longitude),
        latitude: CesiumMath.toDegrees(carto.latitude),
        height: carto.height,
      },
    ]);
  };

  const removeWaypoint = (id: string) => {
    flight.stop();
    setWaypoints((prev) => prev.filter((w) => w.id !== id));
  };

  const shell = (children: ReactNode) => (
    <Paper
      shadow="xl"
      radius="md"
      p="sm"
      style={{
        position: 'absolute',
        top: 60,
        right: 16,
        width: 280,
        maxHeight: '60vh',
        background: '#161b22',
        border: '1px solid #30363d',
        zIndex: 300,
        display: 'flex',
        flexDirection: 'column',
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
      {children}
    </Paper>
  );

  if (!viewer) {
    return shell(
      <Text size="xs" c="dimmed" data-testid="flythrough-no-cesium">
        Flythrough needs the Cesium globe. Switch to the CesiumJS renderer.
      </Text>,
    );
  }

  const length = pathLength(waypoints);
  const ready = waypoints.length >= 2;

  return shell(
    <Stack gap="xs" style={{ minHeight: 0 }}>
      <Button
        size="xs"
        variant="filled"
        color="violet"
        leftSection={<IconMapPinPlus size={14} />}
        onClick={addWaypoint}
        fullWidth
      >
        Add Waypoint Here
      </Button>

      <Text size="xs" c="dimmed" data-testid="flythrough-summary">
        {waypoints.length === 1 ? '1 waypoint' : `${waypoints.length} waypoints`},{' '}
        {Math.round(length)} m
      </Text>

      <ScrollArea style={{ minHeight: 0, maxHeight: 140 }}>
        <Stack gap={4}>
          {waypoints.map((w, i) => (
            <Group
              key={w.id}
              justify="space-between"
              wrap="nowrap"
              p="xs"
              data-testid="flythrough-waypoint"
              style={{ background: '#21262d', borderRadius: 4 }}
            >
              <Text size="xs" c="white" truncate>
                {i + 1}. {Math.round(w.height)} m
              </Text>
              <ActionIcon
                size="sm"
                variant="subtle"
                color="red"
                aria-label={`Remove waypoint ${i + 1}`}
                onClick={() => removeWaypoint(w.id)}
              >
                <IconTrash size={14} />
              </ActionIcon>
            </Group>
          ))}
        </Stack>
      </ScrollArea>

      <Text size="xs" c="dimmed">
        Speed: {speed} m/s
      </Text>
      <Slider size="xs" min={10} max={2000} step={10} value={speed} onChange={setSpeed} color="violet" />

      <Switch
        size="xs"
        label="Smooth Camera"
        checked={smooth}
        onChange={(e) => setSmooth(e.currentTarget.checked)}
        color="violet"
      />

      <Progress value={flight.progress * 100} size="sm" color="violet" data-testid="flythrough-progress" />

      <Group grow gap="xs">
        <Button
          size="xs"
          variant="filled"
          color="violet"
          leftSection={flight.playing ? <IconPlayerPause size={14} /> : <IconPlayerPlay size={14} />}
          disabled={!ready}
          onClick={() =>
            flight.playing ? flight.pause() : flight.play({ waypoints, speed, smooth })
          }
        >
          {flight.playing ? 'Pause' : 'Play'}
        </Button>
        <Button
          size="xs"
          variant="subtle"
          color="gray"
          leftSection={<IconPlayerStop size={14} />}
          onClick={flight.stop}
        >
          Stop
        </Button>
      </Group>

      {!ready && (
        <Text size="xs" c="dimmed" data-testid="flythrough-hint">
          Move the camera and add at least two waypoints.
        </Text>
      )}
    </Stack>,
  );
}
