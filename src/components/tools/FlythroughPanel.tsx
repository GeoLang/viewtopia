import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
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
  IconMapPinPlus,
  IconPlayerPlay,
  IconPlayerPause,
  IconPlayerStop,
  IconTrash,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { Cartographic, Math as CesiumMath } from 'cesium';
import type { Viewer } from 'cesium';
import { PanelCard, PanelHeader } from '../PanelCard';
import { getActiveCesiumViewer } from '../../viewer/registry';
import { useAppStore } from '../../store/app';
import { useFlythroughStore } from '../../store/flythrough';
import {
  pathFromRouteGeometry,
  pathLength,
  useCameraFlight,
  type PathPoint,
} from '../../lib/cameraPath';
import {
  downloadRecording,
  startCanvasRecording,
  type CanvasRecording,
} from '../../lib/canvasRecorder';

interface Waypoint extends PathPoint {
  id: string;
}

const DEFAULT_ROUTE_ALTITUDE = 300;
// a route can carry thousands of points, and every one of them would be a row
const MAX_LISTED_WAYPOINTS = 100;

export function FlythroughPanel({ onClose }: { onClose: () => void }) {
  const renderer = useAppStore((s) => s.renderer);
  const routeGeometry = useFlythroughStore((s) => s.routeGeometry);
  const clearRouteGeometry = useFlythroughStore((s) => s.clearRouteGeometry);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [manualWaypoints, setManualWaypoints] = useState<Waypoint[]>([]);
  const [routeAltitude, setRouteAltitude] = useState(DEFAULT_ROUTE_ALTITUDE);
  const [speed, setSpeed] = useState(200);
  const [smooth, setSmooth] = useState(true);
  const [recordArmed, setRecordArmed] = useState(false);
  const [recording, setRecording] = useState(false);
  const recorder = useRef<CanvasRecording | null>(null);
  const continuousRenderRestore = useRef<(() => void) | null>(null);

  const finishRecording = useCallback(() => {
    const active = recorder.current;
    recorder.current = null;
    continuousRenderRestore.current?.();
    continuousRenderRestore.current = null;
    if (!active) return;
    setRecording(false);
    active.stop().then((video) => {
      downloadRecording(video, `flythrough-${Date.now()}`, active.mimeType);
    });
  }, []);

  const flight = useCameraFlight(viewer, finishRecording);

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

  const routeWaypoints = useMemo(() => {
    if (!routeGeometry) return null;
    const globe = viewer?.scene.globe;
    const groundHeightAt = globe
      ? (longitude: number, latitude: number) =>
          globe.getHeight(Cartographic.fromDegrees(longitude, latitude))
      : undefined;
    return pathFromRouteGeometry(routeGeometry, routeAltitude, groundHeightAt).map((p, i) => ({
      ...p,
      id: `route-${i}`,
    }));
  }, [routeGeometry, routeAltitude, viewer]);

  const waypoints = routeWaypoints ?? manualWaypoints;

  // any hand edit turns the derived route into a plain list of waypoints
  const editWaypoints = (next: Waypoint[]) => {
    flight.stop();
    clearRouteGeometry();
    setManualWaypoints(next);
  };

  const addWaypoint = () => {
    const carto = viewer?.camera.positionCartographic;
    if (!carto) return;
    editWaypoints([
      ...waypoints,
      {
        id: crypto.randomUUID(),
        longitude: CesiumMath.toDegrees(carto.longitude),
        latitude: CesiumMath.toDegrees(carto.latitude),
        height: carto.height,
      },
    ]);
  };

  const removeWaypoint = (id: string) => {
    editWaypoints(waypoints.filter((w) => w.id !== id));
  };

  const startRecording = () => {
    if (!viewer || recorder.current) return;
    const started = startCanvasRecording(viewer.scene.canvas);
    if (!started) {
      notifications.show({
        title: 'Recording unavailable',
        message: 'This browser cannot record video from the map.',
        color: 'red',
      });
      return;
    }
    recorder.current = started;
    setRecording(true);
    // an on-demand scene only draws when something changes, and the stream
    // needs a frame for every video frame
    const scene = viewer.scene;
    if (scene.requestRenderMode) {
      scene.requestRenderMode = false;
      continuousRenderRestore.current = () => {
        if (!viewer.isDestroyed()) scene.requestRenderMode = true;
      };
    }
  };

  const play = () => {
    if (flight.play({ waypoints, speed, smooth }) && recordArmed) startRecording();
  };

  const shell = (children: ReactNode) => (
    <PanelCard width={280} maxHeight="60vh">
      <PanelHeader
        icon={<IconMovie size={16} />}
        title="Flythrough"
        onClose={onClose}
      />
      {children}
    </PanelCard>
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
          {waypoints.slice(0, MAX_LISTED_WAYPOINTS).map((w, i) => (
            <Group
              key={w.id}
              justify="space-between"
              wrap="nowrap"
              p="xs"
              data-testid="flythrough-waypoint"
              style={{ background: 'var(--mantine-color-dark-6)', borderRadius: 4 }}
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
          {waypoints.length > MAX_LISTED_WAYPOINTS && (
            <Text size="xs" c="dimmed">
              +{waypoints.length - MAX_LISTED_WAYPOINTS} more
            </Text>
          )}
        </Stack>
      </ScrollArea>

      {routeWaypoints && (
        <>
          <Text size="xs" c="dimmed">
            Route altitude: {routeAltitude} m
          </Text>
          <Slider
            size="xs"
            min={50}
            max={5000}
            step={50}
            value={routeAltitude}
            onChange={setRouteAltitude}
            color="violet"
            thumbLabel="Route altitude"
          />
        </>
      )}

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

      <Switch
        size="xs"
        label="Record Video"
        checked={recordArmed}
        onChange={(e) => setRecordArmed(e.currentTarget.checked)}
        color="red"
      />

      {recording && (
        <Text size="xs" c="red" data-testid="flythrough-recording">
          Recording — the video downloads when the flight ends.
        </Text>
      )}

      <Progress value={flight.progress * 100} size="sm" color="violet" data-testid="flythrough-progress" />

      <Group grow gap="xs">
        <Button
          size="xs"
          variant="filled"
          color="violet"
          leftSection={flight.playing ? <IconPlayerPause size={14} /> : <IconPlayerPlay size={14} />}
          disabled={!ready}
          onClick={() => (flight.playing ? flight.pause() : play())}
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
