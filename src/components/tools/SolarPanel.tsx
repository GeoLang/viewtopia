import { useEffect, useRef, useState } from 'react';
import { Text, Stack, Group, Slider, Button, TextInput } from '@mantine/core';
import { IconSolarPanel } from '@tabler/icons-react';
import type { ImageryLayer } from 'cesium';
import { PanelCard, PanelHeader } from '../PanelCard';
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
    <PanelCard width={270}>
      <PanelHeader
        icon={<IconSolarPanel size={16} />}
        title="Solar Planner"
        onClose={onClose}
      />

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
    </PanelCard>
  );
}
