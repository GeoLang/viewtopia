import { useEffect, useState } from 'react';
import {
  Text,
  Stack,
  Group,
  ActionIcon,
  Switch,
  Select,
  Button,
  Loader,
} from '@mantine/core';
import { IconCloud, IconRefresh } from '@tabler/icons-react';
import { PanelCard, PanelHeader } from '../PanelCard';
import { PolygonLayer } from '@deck.gl/layers';
import {
  getViewBounds,
  fetchCurrentWeather,
  fetchWeatherGrid,
  weatherCodeInfo,
  cellPolygon,
  tempColor,
  precipColor,
  type CurrentWeather,
  type HourlyPoint,
  type GridSample,
} from '../../lib/weatherData';
import { showPanelDeckLayer, clearPanelDeckLayer } from '../../lib/pointData';

const GROUP = 'panel-weather';
const GRID_N = 5;

function Sparkline({ hourly, variable }: { hourly: HourlyPoint[]; variable: 'temp' | 'precip' }) {
  if (!hourly.length) return null;
  const width = 236;
  const height = 60;
  const values = hourly.map((h) => (variable === 'temp' ? h.temperature : h.precipitation));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const color = variable === 'temp' ? '#f97316' : '#38bdf8';
  const path = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 8) - 4;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg
      aria-label={`hourly ${variable} forecast`}
      data-testid="weather-sparkline"
      width={width}
      height={height}
      style={{ border: '1px solid var(--mantine-color-dark-5)', borderRadius: 6, background: 'var(--mantine-color-dark-8)' }}
    >
      <path d={`${path} L${width},${height} L0,${height} Z`} fill={color} fillOpacity={0.15} />
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  );
}

export function WeatherPanel({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState<CurrentWeather | null>(null);
  const [hourly, setHourly] = useState<HourlyPoint[]>([]);
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sparkVar, setSparkVar] = useState<string | null>('temp');

  const [overlay, setOverlay] = useState(false);
  const [gridVar, setGridVar] = useState<string | null>('temp');
  const [gridStatus, setGridStatus] = useState<string | null>(null);

  const loadCurrent = async () => {
    setLoading(true);
    setError(null);
    const b = getViewBounds();
    setCenter({ lat: b.centerLat, lng: b.centerLng });
    try {
      const { current: c, hourly: h } = await fetchCurrentWeather(b.centerLat, b.centerLng);
      setCurrent(c);
      setHourly(h);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load weather');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCurrent();
    return () => clearPanelDeckLayer(GROUP);
  }, []);

  const renderGrid = (samples: GridSample[], variable: 'temp' | 'precip') => {
    const b = getViewBounds();
    const hx = (b.east - b.west) / GRID_N / 2;
    const hy = (b.north - b.south) / GRID_N / 2;
    showPanelDeckLayer(
      GROUP,
      new PolygonLayer<GridSample>({
        id: `weather-grid-${Date.now()}`,
        data: samples,
        getPolygon: (d) => cellPolygon(d.lng, d.lat, hx, hy),
        getFillColor: (d) =>
          variable === 'temp' ? [...tempColor(d.temperature), 150] : [...precipColor(d.precipitation), 150],
        getLineColor: [255, 255, 255, 40],
        lineWidthMinPixels: 1,
        stroked: true,
        filled: true,
      }),
    );
  };

  const toggleOverlay = async (on: boolean) => {
    setOverlay(on);
    if (!on) {
      clearPanelDeckLayer(GROUP);
      setGridStatus(null);
      return;
    }
    setGridStatus('Sampling grid…');
    try {
      const samples = await fetchWeatherGrid(getViewBounds(), GRID_N);
      renderGrid(samples, (gridVar as 'temp' | 'precip') ?? 'temp');
      setGridStatus(`${samples.length} cells`);
    } catch (e) {
      setOverlay(false);
      setGridStatus(e instanceof Error ? e.message : 'Grid failed');
    }
  };

  const changeGridVar = (v: string | null) => {
    setGridVar(v);
    if (overlay && v) toggleOverlay(true);
  };

  const handleClose = () => {
    clearPanelDeckLayer(GROUP);
    onClose();
  };

  const info = current ? weatherCodeInfo(current.weatherCode) : null;

  return (
    <PanelCard width={272}>
      <PanelHeader
        icon={<IconCloud size={16} />}
        title="Weather"
        onClose={handleClose}
        actions={
          <ActionIcon size="sm" variant="subtle" color="gray" onClick={loadCurrent} aria-label="Refresh weather">
            <IconRefresh size={14} />
          </ActionIcon>
        }
      />

      <Stack gap="xs">
        {loading && (
          <Group gap="xs">
            <Loader size="xs" color="violet" />
            <Text size="xs" c="dimmed">
              Loading current conditions…
            </Text>
          </Group>
        )}

        {error && (
          <Text size="xs" c="red" data-testid="weather-error">
            {error}
          </Text>
        )}

        {current && info && (
          <div data-testid="weather-current">
            <Group gap="xs" align="center">
              <Text size="xl">{info.icon}</Text>
              <div>
                <Text size="lg" fw={700} c="white">
                  {current.temperature.toFixed(1)}°C
                </Text>
                <Text size="xs" c="dimmed">
                  {info.text}
                </Text>
              </div>
            </Group>
            {center && (
              <Text size="xs" c="dimmed" mt={2}>
                {center.lat.toFixed(3)}, {center.lng.toFixed(3)}
              </Text>
            )}
            <Group gap="lg" mt={4}>
              <Text size="xs" c="dimmed">
                Wind {current.windSpeed.toFixed(0)} km/h
              </Text>
              <Text size="xs" c="dimmed">
                Precip {current.precipitation.toFixed(1)} mm
              </Text>
            </Group>
            <Group gap="lg">
              <Text size="xs" c="dimmed">
                Cloud {current.cloudCover}%
              </Text>
              <Text size="xs" c="dimmed">
                Humidity {current.humidity}%
              </Text>
            </Group>
          </div>
        )}

        {hourly.length > 0 && (
          <>
            <Select
              size="xs"
              label="Forecast"
              data={[
                { value: 'temp', label: 'Temperature' },
                { value: 'precip', label: 'Precipitation' },
              ]}
              value={sparkVar}
              onChange={setSparkVar}
            />
            <Sparkline hourly={hourly} variable={(sparkVar as 'temp' | 'precip') ?? 'temp'} />
          </>
        )}

        <Switch
          size="xs"
          label="Grid overlay"
          checked={overlay}
          onChange={(e) => toggleOverlay(e.currentTarget.checked)}
          color="violet"
        />
        {overlay && (
          <Select
            size="xs"
            label="Color by"
            data={[
              { value: 'temp', label: 'Temperature' },
              { value: 'precip', label: 'Precipitation' },
            ]}
            value={gridVar}
            onChange={changeGridVar}
          />
        )}
        {gridStatus && (
          <Text size="xs" c="dimmed" data-testid="weather-grid-status">
            {gridStatus}
          </Text>
        )}

        <Button size="xs" variant="subtle" color="gray" onClick={loadCurrent}>
          Refresh
        </Button>
      </Stack>
    </PanelCard>
  );
}
