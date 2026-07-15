import { useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  Button,
  TextInput,
  NumberInput,
  Select,
  Code,
} from '@mantine/core';
import { IconRuler2, IconX, IconRoute } from '@tabler/icons-react';
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

export function CrossSectionPanel({ onClose }: { onClose: () => void }) {
  const features = useDrawStore((s) => s.features);
  const lineFeatures = features.filter((f) => f.type === 'LineString');
  const [source, setSource] = useState<string>('twopoint');
  const [startCoord, setStartCoord] = useState('51.5,-0.1');
  const [endCoord, setEndCoord] = useState('51.6,-0.05');
  const [numSamples, setNumSamples] = useState(50);
  const [loading, setLoading] = useState(false);
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
    try {
      const coords = sampleAlongLine(base, numSamples);
      const elevations = await fetchElevations(coords);
      const { points, stats: builtStats } = buildProfile(coords, elevations);
      setProfile(points);
      setStats(builtStats);
      // Draw the sampled section line onto the live scene.
      await renderGeoJson(
        {
          type: 'FeatureCollection',
          features: [
            { type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} },
          ],
        },
        '#e74c3c',
        false,
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
        top: 60,
        right: 16,
        width: 320,
        background: '#161b22',
        border: '1px solid #30363d',
        zIndex: 300,
      }}
    >
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconRuler2 size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Cross Section
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs">
        <Select
          size="xs"
          label="Line Source"
          data={sourceData}
          value={source}
          onChange={(v) => v && setSource(v)}
          styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
        />

        {source === 'twopoint' && (
          <Group grow gap="xs">
            <TextInput
              size="xs"
              label="Start (lat,lng)"
              value={startCoord}
              onChange={(e) => setStartCoord(e.currentTarget.value)}
              styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
            />
            <TextInput
              size="xs"
              label="End (lat,lng)"
              value={endCoord}
              onChange={(e) => setEndCoord(e.currentTarget.value)}
              styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
            />
          </Group>
        )}

        <NumberInput
          size="xs"
          label="Sample Points"
          value={numSamples}
          onChange={(v) => setNumSamples(Number(v))}
          min={10}
          max={200}
          styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
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
    </Paper>
  );
}
