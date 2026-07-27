import { useEffect, useRef, useState } from 'react';
import { Paper, Text, Stack, Group, ActionIcon, Button, Slider } from '@mantine/core';
import { IconEye, IconX } from '@tabler/icons-react';
import {
  Math as CesiumMath,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  type Cartesian2,
  type GeoJsonDataSource,
} from 'cesium';
import { getActiveCesiumViewer } from '../../viewer/registry';
import { renderGeoJson } from '../../viewer/renderGeoJson';
import { useAuthStore } from '../../features/auth/store';
import { SIGN_IN_HINT, viewshed } from '../../lib/terrainAnalysis';

export function ViewshedPanel({ onClose }: { onClose: () => void }) {
  const [observerHeight, setObserverHeight] = useState(2);
  const [radius, setRadius] = useState(1000);
  const [placing, setPlacing] = useState(false);
  const [observer, setObserver] = useState<[number, number] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needsSignIn = useAuthStore((s) => !s.token);
  const dsRef = useRef<GeoJsonDataSource | undefined>(undefined);

  const clearResult = () => {
    const viewer = getActiveCesiumViewer();
    if (dsRef.current && viewer && !viewer.isDestroyed()) {
      viewer.dataSources.remove(dsRef.current);
    }
    dsRef.current = undefined;
  };

  // clear the rendered layer when the panel unmounts.
  useEffect(() => clearResult, []);

  // one-shot map click to capture the observer position.
  useEffect(() => {
    if (!placing) return;
    const viewer = getActiveCesiumViewer();
    if (!viewer) {
      setError('No active viewer');
      setPlacing(false);
      return;
    }
    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((click: { position: Cartesian2 }) => {
      const cartesian = viewer.camera.pickEllipsoid(click.position, viewer.scene.globe.ellipsoid);
      if (!cartesian) return;
      const carto = viewer.scene.globe.ellipsoid.cartesianToCartographic(cartesian);
      setObserver([CesiumMath.toDegrees(carto.longitude), CesiumMath.toDegrees(carto.latitude)]);
      setPlacing(false);
    }, ScreenSpaceEventType.LEFT_CLICK);
    return () => handler.destroy();
  }, [placing]);

  const run = async () => {
    if (!observer) return;
    setLoading(true);
    setError(null);
    try {
      clearResult();
      const fc = await viewshed({ observer, height_m: observerHeight, radius_m: radius });
      dsRef.current = await renderGeoJson(fc, '#a78bfa', true, 'viewshed-result');
    } catch {
      setError('Viewshed request failed');
    } finally {
      setLoading(false);
    }
  };

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
        <Button
          size="xs"
          variant={placing ? 'light' : 'default'}
          color="violet"
          onClick={() => setPlacing((p) => !p)}
          fullWidth
        >
          {placing ? 'Click the map…' : observer ? 'Move Observer' : 'Place Observer'}
        </Button>

        <Text size="xs" c="dimmed">
          {observer
            ? `Observer: ${observer[1].toFixed(4)}, ${observer[0].toFixed(4)}`
            : 'Place the observer point on the map.'}
        </Text>

        <Text size="xs" c="dimmed">Observer Height: {observerHeight}m</Text>
        <Slider size="xs" min={0.5} max={50} step={0.5} value={observerHeight} onChange={setObserverHeight} color="violet" />

        <Text size="xs" c="dimmed">Radius: {radius}m</Text>
        <Slider size="xs" min={100} max={10000} step={100} value={radius} onChange={setRadius} color="violet" />

        <Group grow>
          <Button
            size="xs"
            color="violet"
            onClick={run}
            loading={loading}
            disabled={!observer || needsSignIn}
          >
            Compute
          </Button>
          <Button size="xs" variant="default" onClick={clearResult}>
            Clear
          </Button>
        </Group>

        {needsSignIn && (
          <Text size="xs" c="dimmed" data-testid="viewshed-signin">
            {SIGN_IN_HINT}
          </Text>
        )}

        {error && (
          <Text size="xs" c="red">
            {error}
          </Text>
        )}
      </Stack>
    </Paper>
  );
}
