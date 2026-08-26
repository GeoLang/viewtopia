import { useEffect, useState } from 'react';
import { Text, Stack, Group, Button, Slider } from '@mantine/core';
import { IconEye } from '@tabler/icons-react';
import {
  Math as CesiumMath,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  type Cartesian2,
} from 'cesium';
import { PanelCard, PanelHeader } from '../PanelCard';
import { useAuthStore } from '../../features/auth/store';
import {
  DEFAULT_OBSERVER_HEIGHT_METERS,
  DEFAULT_VIEWSHED_RADIUS_METERS,
  clearViewshed,
  runViewshed,
} from '../../features/terrain/analysis';
import { SIGN_IN_HINT } from '../../lib/terrainAnalysis';
import { getActiveCesiumViewer } from '../../viewer/registry';

export function ViewshedPanel({ onClose }: { onClose: () => void }) {
  const [observerHeight, setObserverHeight] = useState(DEFAULT_OBSERVER_HEIGHT_METERS);
  const [radius, setRadius] = useState(DEFAULT_VIEWSHED_RADIUS_METERS);
  const [placing, setPlacing] = useState(false);
  const [observer, setObserver] = useState<[number, number] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needsSignIn = useAuthStore((s) => !s.token);

  // clear the rendered layer when the panel unmounts.
  useEffect(() => clearViewshed, []);

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
      await runViewshed({
        longitude: observer[0],
        latitude: observer[1],
        heightMeters: observerHeight,
        radiusMeters: radius,
      });
    } catch {
      setError('Viewshed request failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PanelCard width={260}>
      <PanelHeader
        icon={<IconEye size={16} />}
        title="Viewshed Analysis"
        onClose={onClose}
      />

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
          <Button size="xs" variant="default" onClick={clearViewshed}>
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
    </PanelCard>
  );
}
