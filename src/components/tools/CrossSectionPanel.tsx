import { useState } from 'react';
import {
  Text,
  Stack,
  Group,
  Button,
  TextInput,
  NumberInput,
  Select,
  Code,
} from '@mantine/core';
import { IconRuler2, IconRoute } from '@tabler/icons-react';
import { PanelCard, PanelHeader } from '../PanelCard';
import {
  CROSS_SECTION_LINE_STYLE,
  DEFAULT_CROSS_SECTION_SAMPLES,
  MAX_PROFILE_SAMPLES,
  MIN_PROFILE_SAMPLES,
  drawProfileLine,
  sampleTerrainProfile,
} from '../../features/terrain/profile';
import {
  ElevationChart,
  type ProfilePoint,
  type ProfileStats,
} from '../../lib/elevationProfile';
import { useDrawStore } from '../../store/draw';

export function CrossSectionPanel({ onClose }: { onClose: () => void }) {
  const features = useDrawStore((s) => s.features);
  const lineFeatures = features.filter((f) => f.type === 'LineString');
  const [source, setSource] = useState<string>('twopoint');
  const [startCoord, setStartCoord] = useState('51.5,-0.1');
  const [endCoord, setEndCoord] = useState('51.6,-0.05');
  const [numSamples, setNumSamples] = useState(DEFAULT_CROSS_SECTION_SAMPLES);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfilePoint[] | null>(null);
  const [stats, setStats] = useState<ProfileStats | null>(null);

  const sourceData = [
    { value: 'twopoint', label: 'Two points' },
    ...lineFeatures.map((f, i) => ({ value: f.id, label: `Drawn line #${i + 1}` })),
  ];

  const lineCoords = (): [number, number][] => {
    if (source !== 'twopoint') {
      const feat = lineFeatures.find((f) => f.id === source);
      return feat ? feat.coords : [];
    }
    const [startLat, startLng] = startCoord.split(',').map(Number);
    const [endLat, endLng] = endCoord.split(',').map(Number);
    return [
      [startLng, startLat],
      [endLng, endLat],
    ];
  };

  const generate = async () => {
    const base = lineCoords();
    if (base.length < 2) return;
    setLoading(true);
    setError(null);
    try {
      const { coordinates, points, stats: builtStats } = await sampleTerrainProfile(
        base,
        numSamples,
      );
      setProfile(points);
      setStats(builtStats);
      drawProfileLine(coordinates, CROSS_SECTION_LINE_STYLE);
    } catch (e) {
      setProfile(null);
      setStats(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <PanelCard width={320}>
      <PanelHeader
        icon={<IconRuler2 size={16} />}
        title="Cross Section"
        onClose={onClose}
      />

      <Stack gap="xs">
        <Select
          size="xs"
          label="Line Source"
          data={sourceData}
          value={source}
          onChange={(v) => v && setSource(v)}
        />

        {source === 'twopoint' && (
          <Group grow gap="xs">
            <TextInput
              size="xs"
              label="Start (lat,lng)"
              value={startCoord}
              onChange={(e) => setStartCoord(e.currentTarget.value)}
            />
            <TextInput
              size="xs"
              label="End (lat,lng)"
              value={endCoord}
              onChange={(e) => setEndCoord(e.currentTarget.value)}
            />
          </Group>
        )}

        <NumberInput
          size="xs"
          label="Sample Points"
          value={numSamples}
          onChange={(v) => setNumSamples(Number(v))}
          min={MIN_PROFILE_SAMPLES}
          max={MAX_PROFILE_SAMPLES}
        />

        <Button
          size="xs"
          color="violet"
          leftSection={<IconRoute size={14} />}
          onClick={generate}
          loading={loading}
          fullWidth
        >
          Generate Profile
        </Button>

        {error && (
          <Text size="xs" c="red" ta="center">
            {error}
          </Text>
        )}

        {profile && profile.length > 0 && (
          <ElevationChart profile={profile} width={296} height={110} />
        )}

        {stats && (
          <Code block data-testid="crosssection-stats">
{`Distance: ${(stats.totalDist / 1000).toFixed(2)} km
Min Elev: ${stats.minElev.toFixed(0)} m
Max Elev: ${stats.maxElev.toFixed(0)} m
Gain:     +${stats.gain.toFixed(0)} m
Loss:     -${stats.loss.toFixed(0)} m`}
          </Code>
        )}

        {!profile && (
          <Text size="xs" c="dimmed" ta="center" py="xs">
            No section generated yet
          </Text>
        )}
      </Stack>
    </PanelCard>
  );
}
