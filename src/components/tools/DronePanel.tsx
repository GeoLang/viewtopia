import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  NumberInput,
  Progress,
  Slider,
  Button,
} from '@mantine/core';
import {
  IconDrone,
  IconX,
  IconRoute,
  IconPlayerPlay,
  IconPlayerPause,
  IconPlayerStop,
  IconTrash,
} from '@tabler/icons-react';
import {
  Cartesian3,
  Cartographic,
  Color,
  Math as CesiumMath,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
} from 'cesium';
import type { Cartesian2, Entity, Viewer } from 'cesium';
import { getActiveCesiumViewer } from '../../viewer/registry';
import { useAppStore } from '../../store/app';
import { pathLength, useCameraFlight } from '../../lib/cameraPath';

interface GroundPoint {
  id: string;
  longitude: number;
  latitude: number;
  // height of whatever the click landed on, so altitude reads as height above it
  ground: number;
}

export function DronePanel({ onClose }: { onClose: () => void }) {
  const renderer = useAppStore((s) => s.renderer);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [altitude, setAltitude] = useState(100);
  const [speed, setSpeed] = useState(5);
  const [drawing, setDrawing] = useState(false);
  const [points, setPoints] = useState<GroundPoint[]>([]);
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

  useEffect(() => {
    if (!drawing || !viewer) return;
    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((click: { position: Cartesian2 }) => {
      const scene = viewer.scene;
      const position = scene.pickPositionSupported
        ? scene.pickPosition(click.position)
        : viewer.camera.pickEllipsoid(click.position, scene.globe.ellipsoid);
      if (!position) return;
      const carto = Cartographic.fromCartesian(position);
      setPoints((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          longitude: CesiumMath.toDegrees(carto.longitude),
          latitude: CesiumMath.toDegrees(carto.latitude),
          ground: carto.height,
        },
      ]);
    }, ScreenSpaceEventType.LEFT_CLICK);
    handler.setInputAction(() => setDrawing(false), ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
    return () => handler.destroy();
  }, [drawing, viewer]);

  useEffect(() => {
    if (!viewer || points.length === 0) return;
    const positions = points.map((p) => Cartesian3.fromDegrees(p.longitude, p.latitude, p.ground));
    const added: Entity[] = positions.map((position) =>
      viewer.entities.add({
        position,
        point: {
          pixelSize: 6,
          color: Color.fromCssColorString('#a78bfa'),
          outlineColor: Color.WHITE,
          outlineWidth: 1,
        },
      }),
    );
    if (positions.length >= 2) {
      added.push(
        viewer.entities.add({
          polyline: {
            positions,
            width: 2,
            material: Color.fromCssColorString('#a78bfa').withAlpha(0.9),
          },
        }),
      );
    }
    return () => {
      for (const entity of added) viewer.entities.remove(entity);
    };
  }, [viewer, points]);

  const clearPath = () => {
    flight.stop();
    setDrawing(false);
    setPoints([]);
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
      {children}
    </Paper>
  );

  if (!viewer) {
    return shell(
      <Text size="xs" c="dimmed" data-testid="drone-no-cesium">
        The drone planner needs the Cesium globe. Switch to the CesiumJS renderer.
      </Text>,
    );
  }

  const waypoints = points.map((p) => ({
    longitude: p.longitude,
    latitude: p.latitude,
    height: p.ground + altitude,
  }));
  const ready = waypoints.length >= 2;

  return shell(
    <Stack gap="xs">
      <NumberInput
        size="xs"
        label="Altitude (m)"
        value={altitude}
        onChange={(v) => setAltitude(typeof v === 'number' ? v : Number(v) || 0)}
        min={10}
        max={500}
      />

      <Text size="xs" c="dimmed">
        Speed: {speed} m/s
      </Text>
      <Slider size="xs" min={1} max={20} value={speed} onChange={setSpeed} color="violet" />

      <Button
        size="xs"
        variant={drawing ? 'light' : 'filled'}
        color="violet"
        leftSection={<IconRoute size={14} />}
        onClick={() => setDrawing(!drawing)}
        fullWidth
      >
        {drawing ? 'Stop Drawing' : 'Draw Flight Path'}
      </Button>

      <Text size="xs" c={drawing ? 'violet' : 'dimmed'} data-testid="drone-hint">
        {drawing
          ? `Click the map to add waypoints, double-click to finish (${points.length} so far)`
          : `${points.length === 1 ? '1 waypoint' : `${points.length} waypoints`}, ${Math.round(pathLength(waypoints))} m of track`}
      </Text>

      <Progress value={flight.progress * 100} size="sm" color="violet" data-testid="drone-progress" />

      <Group grow gap="xs">
        <Button
          size="xs"
          variant="filled"
          color="violet"
          leftSection={flight.playing ? <IconPlayerPause size={14} /> : <IconPlayerPlay size={14} />}
          disabled={!ready}
          onClick={() => (flight.playing ? flight.pause() : flight.play({ waypoints, speed }))}
        >
          {flight.playing ? 'Pause' : 'Simulate'}
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

      <Button
        size="xs"
        variant="subtle"
        color="red"
        leftSection={<IconTrash size={14} />}
        onClick={clearPath}
        disabled={points.length === 0}
        fullWidth
      >
        Clear Path
      </Button>
    </Stack>,
  );
}
