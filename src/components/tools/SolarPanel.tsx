import { useEffect, useRef, useState } from 'react';
import { Paper, Text, Stack, Group, ActionIcon, Slider, Button, TextInput } from '@mantine/core';
import { IconSolarPanel, IconX } from '@tabler/icons-react';
import type { ImageryLayer } from 'cesium';
import { useAppStore } from '../../store/app';
import { useAuthStore } from '../../features/auth/store';
import {
  addMapRaster,
  addRasterOverlay,
  currentBbox,
  removeOverlay,
  solarRaster,
  SIGN_IN_HINT,
  type Bbox,
  type MapResult,
} from '../../lib/terrainAnalysis';

export function SolarPanel({ onClose }: { onClose: () => void }) {
  const [date, setDate] = useState('2026-06-21');
  const [opacity, setOpacity] = useState(70);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const renderer = useAppStore((s) => s.renderer);
  const needsSignIn = useAuthStore((s) => !s.token);
  const layerRef = useRef<ImageryLayer | null>(null);
  const mapResultRef = useRef<MapResult | null>(null);
  const urlRef = useRef<string | null>(null);

  const clearResult = () => {
    removeOverlay(layerRef.current);
    layerRef.current = null;
    mapResultRef.current?.remove();
    mapResultRef.current = null;
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  };

  useEffect(() => clearResult, []);

  useEffect(() => {
    if (layerRef.current) layerRef.current.alpha = opacity / 100;
    mapResultRef.current?.setOpacity(opacity / 100);
  }, [opacity]);

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
      const url = await solarRaster(bbox as Bbox, date);
      urlRef.current = url;
      if (renderer === 'maplibre') {
        mapResultRef.current = addMapRaster('solar-result', url, bbox as Bbox, opacity / 100);
      } else {
        layerRef.current = await addRasterOverlay(url, bbox as Bbox, opacity / 100);
      }
    } catch {
      setError('Solar request failed');
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
        width: 270,
        background: '#161b22',
        border: '1px solid #30363d',
        zIndex: 300,
      }}
    >
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconSolarPanel size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Solar Planner
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs">
        <Text size="xs" c="dimmed">
          Clear-sky irradiance at solar noon over the current map view.
        </Text>

        <TextInput
          size="xs"
          type="date"
          label="Date"
          value={date}
          onChange={(e) => setDate(e.currentTarget.value)}
          styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
        />

        <Text size="xs" c="dimmed">Opacity: {opacity}%</Text>
        <Slider size="xs" min={10} max={100} value={opacity} onChange={setOpacity} color="yellow" />

        <Group grow>
          <Button
            size="xs"
            color="yellow"
            onClick={run}
            loading={loading}
            disabled={needsSignIn}
          >
            Compute
          </Button>
          <Button size="xs" variant="default" onClick={clearResult}>
            Clear
          </Button>
        </Group>

        {needsSignIn && (
          <Text size="xs" c="dimmed" data-testid="solar-signin">
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
