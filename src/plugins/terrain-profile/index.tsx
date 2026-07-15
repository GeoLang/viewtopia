/**
 * Terrain Profile Plugin — Plot elevation profiles along drawn lines.
 * Equivalent to: QGIS Profile Tool (1.6M downloads)
 */

import { useState } from 'react';
import { Paper, Text, Stack, Button, Group, Badge, NumberInput, Select, Code, TextInput } from '@mantine/core';
import { IconChartLine, IconRoute } from '@tabler/icons-react';
import type { PluginDefinition, PluginContext } from '../sdk';
import {
  fetchElevations,
  interpolatePoints,
  buildProfile,
  ElevationChart,
  type ProfilePoint,
  type ProfileStats,
} from '../../lib/elevationProfile';

function TerrainProfilePanel({ ctx }: { ctx: PluginContext }) {
  const [startCoord, setStartCoord] = useState('51.5,-0.1');
  const [endCoord, setEndCoord] = useState('51.6,-0.05');
  const [numSamples, setNumSamples] = useState(50);
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<ProfilePoint[] | null>(null);
  const [stats, setStats] = useState<ProfileStats | null>(null);

  const handleProfile = async () => {
    setLoading(true);
    try {
      const [startLat, startLng] = startCoord.split(',').map(Number);
      const [endLat, endLng] = endCoord.split(',').map(Number);

      const coords = interpolatePoints([startLng, startLat], [endLng, endLat], numSamples);
      const elevations = await fetchElevations(coords);
      const { points, stats: builtStats } = buildProfile(coords, elevations);

      setProfile(points);
      setStats(builtStats);

      // Add the profile line to the map
      ctx.map.addGeoJsonLayer('terrain-profile-line', {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: coords },
          properties: { name: 'Profile Line' },
        }],
      }, { color: '#e74c3c', lineWidth: 3 });
    } catch (e) {
      console.error('Profile error:', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Paper p="md" withBorder style={{ width: 360 }}>
      <Stack gap="sm">
        <Group justify="space-between">
          <Text fw={600} size="lg">Terrain Profile</Text>
          <Badge size="sm" color="green">DEM</Badge>
        </Group>

        <Group grow>
          <TextInput
            label="Start (lat,lng)"
            value={startCoord}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setStartCoord(e.currentTarget.value)}
            placeholder="51.5,-0.1"
          />
          <TextInput
            label="End (lat,lng)"
            value={endCoord}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEndCoord(e.currentTarget.value)}
            placeholder="51.6,-0.05"
          />
        </Group>

        <NumberInput label="Sample Points" value={numSamples} onChange={(v) => setNumSamples(Number(v))} min={10} max={200} />

        <Button
          leftSection={<IconRoute size={14} />}
          onClick={handleProfile}
          loading={loading}
          fullWidth
          color="green"
        >
          Generate Profile
        </Button>

        {profile && <ElevationChart profile={profile} />}

        {stats && (
          <Code block>
{`Distance:    ${(stats.totalDist / 1000).toFixed(2)} km
Min Elev:    ${stats.minElev.toFixed(0)} m
Max Elev:    ${stats.maxElev.toFixed(0)} m
Elev Gain:   +${stats.gain.toFixed(0)} m
Elev Loss:   -${stats.loss.toFixed(0)} m`}
          </Code>
        )}
      </Stack>
    </Paper>
  );
}

const plugin: PluginDefinition = {
  id: 'terrain-profile',
  name: 'Terrain Profile',
  description: 'Plot elevation profiles along lines with distance, gain, and loss statistics',
  version: '1.0.0',
  author: 'TileTopia-HQ',
  icon: <IconChartLine size={14} />,
  category: 'analysis',
  Panel: TerrainProfilePanel,
  settings: [
    { key: 'elevationApi', label: 'Elevation API', type: 'select', defaultValue: 'open-elevation', options: [{ value: 'open-elevation', label: 'Open-Elevation' }, { value: 'mapzen', label: 'Mapzen Terrain Tiles' }] },
    { key: 'defaultSamples', label: 'Default Sample Count', type: 'number', defaultValue: 50, min: 10, max: 500 },
  ],
};

export default plugin;
