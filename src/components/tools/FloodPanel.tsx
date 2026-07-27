import { useEffect, useRef, useState } from 'react';
import { Paper, Text, Stack, Group, ActionIcon, Slider, Button } from '@mantine/core';
import { IconDroplet, IconX } from '@tabler/icons-react';
import type { GeoJsonDataSource } from 'cesium';
import { getActiveCesiumViewer } from '../../viewer/registry';
import { renderGeoJson } from '../../viewer/renderGeoJson';
import { useAppStore } from '../../store/app';
import {
  addMapGeoJson,
  currentBbox,
  flood,
  RENDERER_HINT,
  type MapResult,
} from '../../lib/terrainAnalysis';

export function FloodPanel({ onClose }: { onClose: () => void }) {
  const [waterLevel, setWaterLevel] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cells, setCells] = useState<number | null>(null);
  const renderer = useAppStore((s) => s.renderer);
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
          <IconDroplet size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Flood Simulation
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

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
            disabled={renderer === 'deckgl'}
          >
            Simulate
          </Button>
          <Button size="xs" variant="default" onClick={clearResult}>
            Clear
          </Button>
        </Group>

        {renderer === 'deckgl' && (
          <Text size="xs" c="yellow" data-testid="flood-renderer-hint">
            {RENDERER_HINT}
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
    </Paper>
  );
}
