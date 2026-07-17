import { useEffect, useRef, useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  Button,
  Select,
  NumberInput,
} from '@mantine/core';
import { IconChartAreaLine, IconX } from '@tabler/icons-react';
import {
  fetchElevations,
  sampleAlongLine,
  buildProfile,
  ElevationChart,
  type ProfilePoint,
  type ProfileStats,
} from '../../lib/elevationProfile';
import { useDrawStore } from '../../store/draw';
import { renderGeoJson } from '../../viewer/renderGeoJson';

export function TerrainProfilePanel({ onClose }: { onClose: () => void }) {
  const features = useDrawStore((s) => s.features);
  const drawMode = useDrawStore((s) => s.mode);
  const setMode = useDrawStore((s) => s.setMode);
  const lineFeatures = features.filter((f) => f.type === 'LineString');
  const drawing = drawMode === 'line';

  const [selectedLine, setSelectedLine] = useState<string | null>(null);
  const [numSamples, setNumSamples] = useState(100);
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<ProfilePoint[] | null>(null);
  const [stats, setStats] = useState<ProfileStats | null>(null);

  // when a line finishes while we armed drawing, select it and disarm
  const prevLineCount = useRef(lineFeatures.length);
  useEffect(() => {
    if (drawing && lineFeatures.length > prevLineCount.current) {
      setSelectedLine(lineFeatures[lineFeatures.length - 1].id);
      setMode(null);
    }
    prevLineCount.current = lineFeatures.length;
  }, [drawing, lineFeatures, setMode]);

  const activeLine =
    lineFeatures.find((f) => f.id === selectedLine) ?? lineFeatures[lineFeatures.length - 1];

  const generate = async () => {
    if (!activeLine || activeLine.coords.length < 2) return;
    setLoading(true);
    try {
      const coords = sampleAlongLine(activeLine.coords, numSamples);
      const elevations = await fetchElevations(coords);
      const { points, stats: builtStats } = buildProfile(coords, elevations);
      setProfile(points);
      setStats(builtStats);
      // mark the sampled line on the live scene
      await renderGeoJson(
        {
          type: 'FeatureCollection',
          features: [
            { type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} },
          ],
        },
        '#a78bfa',
        false,
        'terrain-profile-line',
      );
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
        bottom: 120,
        left: 16,
        right: 16,
        maxWidth: 600,
        background: '#161b22',
        border: '1px solid #30363d',
        zIndex: 300,
      }}
    >
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconChartAreaLine size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Terrain Profile
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs">
        <Group gap="xs" align="flex-end">
          <Select
            size="xs"
            label="Profile Line"
            flex={1}
            placeholder={lineFeatures.length ? 'Latest drawn line' : 'No drawn lines yet'}
            data={lineFeatures.map((f, i) => ({ value: f.id, label: `Drawn line #${i + 1}` }))}
            value={activeLine?.id ?? null}
            onChange={setSelectedLine}
            styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
          />
          <NumberInput
            size="xs"
            label="Samples"
            w={90}
            value={numSamples}
            onChange={(v) => setNumSamples(Number(v) || 100)}
            min={10}
            max={200}
            styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
          />
          <Button
            size="xs"
            variant={drawing ? 'light' : 'default'}
            color="violet"
            onClick={() => setMode(drawing ? null : 'line')}
          >
            {drawing ? 'Cancel Drawing' : 'Draw Line'}
          </Button>
          <Button
            size="xs"
            color="violet"
            onClick={generate}
            loading={loading}
            disabled={!activeLine}
          >
            Generate
          </Button>
        </Group>

        {drawing && (
          <Text size="xs" c="dimmed" ta="center">
            Click points on the map, double-click to finish the line.
          </Text>
        )}

        {profile && profile.length > 0 && (
          <ElevationChart
            profile={profile}
            width={560}
            height={140}
            color="#a78bfa"
            gradientId="terrain-profile-grad"
          />
        )}

        {stats && (
          <Text size="xs" c="dimmed" data-testid="terrainprofile-stats">
            {`${(stats.totalDist / 1000).toFixed(2)} km · min ${stats.minElev.toFixed(0)} m · max ${stats.maxElev.toFixed(0)} m · +${stats.gain.toFixed(0)} m / -${stats.loss.toFixed(0)} m`}
          </Text>
        )}

        {!profile && !drawing && (
          <Text size="xs" c="dimmed" ta="center" py="xs">
            Draw a line on the map, then generate its elevation profile.
          </Text>
        )}
      </Stack>
    </Paper>
  );
}
