import { useEffect, useRef, useState } from 'react';
import { Text, Stack, Group, Slider, Button } from '@mantine/core';
import { IconDroplet } from '@tabler/icons-react';
import type { GeoJsonDataSource } from 'cesium';
import { PanelCard, PanelHeader } from '../PanelCard';
import { getActiveCesiumViewer } from '../../viewer/registry';
import { renderGeoJson } from '../../viewer/renderGeoJson';
import { useAppStore } from '../../store/app';
import { useAuthStore } from '../../features/auth/store';
import {
  addMapGeoJson,
  currentBbox,
  flood,
  SIGN_IN_HINT,
  type MapResult,
} from '../../lib/terrainAnalysis';

export function FloodPanel({ onClose }: { onClose: () => void }) {
  const [waterLevel, setWaterLevel] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cells, setCells] = useState<number | null>(null);
  const renderer = useAppStore((s) => s.renderer);
  const needsSignIn = useAuthStore((s) => !s.token);
  const dsRef = useRef<GeoJsonDataSource | undefined>(undefined);
  const mapResultRef = useRef<MapResult | null>(null);

  const clearResult = () => {
    const viewer = getActiveCesiumViewer();
    if (dsRef.current && viewer && !viewer.isDestroyed()) {
      viewer.dataSources.remove(dsRef.current);
    }
    dsRef.current = undefined;
    mapResultRef.current?.remove();
    mapResultRef.current = null;
    setCells(null);
  };

  useEffect(() => clearResult, []);

  const run = async () => {
    const bbox = currentBbox();
    if (!bbox) {
      setError('Cannot read the current map view');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      clearResult();
      const fc = await flood(waterLevel, bbox);
      setCells(fc.features.length ? (fc.features[0].properties?.flooded_cells ?? 0) : 0);
      if (renderer === 'maplibre') {
        mapResultRef.current = addMapGeoJson('flood-result', fc, '#3b82f6');
      } else {
        dsRef.current = await renderGeoJson(fc, '#3b82f6', false, 'flood-result');
      }
    } catch {
      setError('Flood request failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PanelCard width={260}>
      <PanelHeader
        icon={<IconDroplet size={16} />}
        title="Flood Simulation"
        onClose={onClose}
      />

      <Stack gap="xs">
        <Text size="xs" c="dimmed">
          Floods cells below the water level across the current map view.
        </Text>

        <Text size="xs" c="dimmed">Water Level: {waterLevel}m</Text>
        <Slider size="xs" min={0} max={100} step={1} value={waterLevel} onChange={setWaterLevel} color="blue" />

        <Group grow>
          <Button
            size="xs"
            color="blue"
            onClick={run}
            loading={loading}
            disabled={needsSignIn}
          >
            Simulate
          </Button>
          <Button size="xs" variant="default" onClick={clearResult}>
            Clear
          </Button>
        </Group>

        {needsSignIn && (
          <Text size="xs" c="dimmed" data-testid="flood-signin">
            {SIGN_IN_HINT}
          </Text>
        )}

        {cells !== null && (
          <Text size="xs" c="dimmed">
            {cells} flooded cell{cells === 1 ? '' : 's'}
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
