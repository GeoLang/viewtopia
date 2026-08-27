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
  DEFAULT_PROFILE_SAMPLES,
  MAX_PROFILE_SAMPLES,
  MIN_PROFILE_SAMPLES,
  PROFILE_LINE_STYLE,
  drawProfileLine,
  sampleTerrainProfile,
} from '../../features/terrain/profile';
import {
  ElevationChart,
  type ProfilePoint,
  type ProfileStats,
} from '../../lib/elevationProfile';
import { useDrawStore } from '../../store/draw';

export function TerrainProfilePanel({ onClose }: { onClose: () => void }) {
  const features = useDrawStore((s) => s.features);
  const drawMode = useDrawStore((s) => s.mode);
  const setMode = useDrawStore((s) => s.setMode);
  const lineFeatures = features.filter((f) => f.type === 'LineString');
  const drawing = drawMode === 'line';

  const [selectedLine, setSelectedLine] = useState<string | null>(null);
  const [numSamples, setNumSamples] = useState(DEFAULT_PROFILE_SAMPLES);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    setError(null);
    try {
      const { coordinates, points, stats: builtStats } = await sampleTerrainProfile(
        activeLine.coords,
        numSamples,
      );
      setProfile(points);
      setStats(builtStats);
      drawProfileLine(coordinates, PROFILE_LINE_STYLE);
    } catch (e) {
      setProfile(null);
      setStats(null);
      setError(e instanceof Error ? e.message : String(e));
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
        background: 'var(--mantine-color-dark-7)',
        border: '1px solid var(--mantine-color-dark-5)',
        zIndex: 300,
      }}
    >
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconChartAreaLine size={16} style={{ color: 'var(--mantine-color-violet-4)' }} />
          <Text size="sm" fw={600} c="white">
            Terrain Profile
          </Text>
        </Group>
        <ActionIcon aria-label="Close terrain profile" size="sm" variant="subtle" color="gray" onClick={onClose}>
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
          />
          <NumberInput
            size="xs"
            label="Samples"
            w={90}
            value={numSamples}
            onChange={(v) => setNumSamples(Number(v) || DEFAULT_PROFILE_SAMPLES)}
            min={MIN_PROFILE_SAMPLES}
            max={MAX_PROFILE_SAMPLES}
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

        {error && (
          <Text size="xs" c="red" ta="center">
            {error}
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
