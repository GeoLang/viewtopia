import { useEffect, useState } from 'react';
import { Text, Stack, Group, ActionIcon, Button, Loader, Slider } from '@mantine/core';
import { IconWind, IconRefresh } from '@tabler/icons-react';
import { LineLayer, ScatterplotLayer } from '@deck.gl/layers';
import { PanelCard, PanelHeader } from '../PanelCard';
import {
  getViewBounds,
  fetchWeatherGrid,
  windColor,
  type GridSample,
  type ViewBounds,
} from '../../lib/weatherData';
import { showPanelDeckLayer, clearPanelDeckLayer } from '../../lib/pointData';

const GROUP = 'panel-wind';
const GRID_N = 8;

interface Arrow {
  source: [number, number];
  target: [number, number];
  speed: number;
}

// meteorological winddirection is the bearing wind comes FROM, so blow-toward is +180.
// arrow length scales with speed relative to the cell size so the field stays readable.
function buildArrows(samples: GridSample[], bounds: ViewBounds, scale: number): Arrow[] {
  const cellW = (bounds.east - bounds.west) / GRID_N;
  const maxSpeed = Math.max(1, ...samples.map((s) => s.windSpeed));
  return samples.map((s) => {
    const bearing = ((s.windDirection + 180) * Math.PI) / 180;
    const len = (s.windSpeed / maxSpeed) * cellW * 0.9 * scale;
    const latRad = (s.lat * Math.PI) / 180;
    const dLat = Math.cos(bearing) * len;
    const dLng = (Math.sin(bearing) * len) / Math.max(0.1, Math.cos(latRad));
    return {
      source: [s.lng, s.lat],
      target: [s.lng + dLng, s.lat + dLat],
      speed: s.windSpeed,
    };
  });
}

export function WindPanel({ onClose }: { onClose: () => void }) {
  const [arrows, setArrows] = useState<Arrow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [maxSpeed, setMaxSpeed] = useState(0);

  const render = (data: Arrow[]) => {
    showPanelDeckLayer(GROUP, [
      new LineLayer<Arrow>({
        id: `wind-shaft-${Date.now()}`,
        data,
        getSourcePosition: (d) => d.source,
        getTargetPosition: (d) => d.target,
        getColor: (d) => [...windColor(d.speed), 220],
        getWidth: 2,
        widthMinPixels: 1.5,
      }),
      new ScatterplotLayer<Arrow>({
        id: `wind-head-${Date.now()}`,
        data,
        getPosition: (d) => d.target,
        getFillColor: (d) => [...windColor(d.speed), 240],
        getRadius: 3,
        radiusMinPixels: 2,
        radiusMaxPixels: 5,
      }),
    ]);
  };

  const load = async (nextScale = scale) => {
    setLoading(true);
    setError(null);
    const bounds = getViewBounds();
    try {
      const samples = await fetchWeatherGrid(bounds, GRID_N);
      const data = buildArrows(samples, bounds, nextScale);
      setArrows(data);
      setMaxSpeed(Math.max(0, ...samples.map((s) => s.windSpeed)));
      render(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load wind');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    return () => clearPanelDeckLayer(GROUP);
  }, []);

  const changeScale = (v: number) => {
    setScale(v);
    if (arrows.length) {
      const bounds = getViewBounds();
      const rescaled = arrows.map((a) => ({
        source: a.source,
        target: [
          a.source[0] + (a.target[0] - a.source[0]) * (v / scale),
          a.source[1] + (a.target[1] - a.source[1]) * (v / scale),
        ] as [number, number],
        speed: a.speed,
      }));
      setArrows(rescaled);
      render(rescaled);
    }
  };

  const handleClose = () => {
    clearPanelDeckLayer(GROUP);
    onClose();
  };

  return (
    <PanelCard width={260}>
      <PanelHeader
        icon={<IconWind size={16} />}
        title="Wind Field"
        onClose={handleClose}
        actions={
          <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => load()} aria-label="Refresh wind">
            <IconRefresh size={14} />
          </ActionIcon>
        }
      />

      <Stack gap="xs">
        {loading && (
          <Group gap="xs">
            <Loader size="xs" color="violet" />
            <Text size="xs" c="dimmed">
              Sampling wind…
            </Text>
          </Group>
        )}

        {error && (
          <Text size="xs" c="red" data-testid="wind-error">
            {error}
          </Text>
        )}

        {arrows.length > 0 && (
          <Text size="xs" c="dimmed" data-testid="wind-status">
            {arrows.length} arrows, peak {maxSpeed.toFixed(0)} km/h
          </Text>
        )}

        <Text size="xs" c="dimmed">
          Arrow scale: {scale.toFixed(1)}x
        </Text>
        <Slider size="xs" min={0.5} max={3} step={0.5} value={scale} onChange={changeScale} color="violet" />

        <Text size="xs" c="dimmed" mt={4}>
          Speed (km/h)
        </Text>
        <div
          data-testid="wind-legend"
          style={{
            height: 10,
            borderRadius: 4,
            background: 'linear-gradient(90deg, rgb(60,200,60), rgb(255,200,60), rgb(255,60,60))',
          }}
        />
        <Group justify="space-between">
          <Text size="xs" c="dimmed">
            0
          </Text>
          <Text size="xs" c="dimmed">
            30
          </Text>
          <Text size="xs" c="dimmed">
            60+
          </Text>
        </Group>

        <Button size="xs" variant="subtle" color="gray" onClick={() => load()}>
          Refresh
        </Button>
      </Stack>
    </PanelCard>
  );
}
