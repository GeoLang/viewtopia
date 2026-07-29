/**
 * Point Sampling Plugin — Sample DEM values at point locations.
 * Equivalent to: QGIS Point Sampling Tool (662K downloads)
 *
 * Elevation comes from the Open-Elevation API; slope and aspect are finite
 * differences over a cross of four neighbouring elevation samples.
 */

import { useState } from 'react';
import { Paper, Text, Stack, Button, Group, Badge, Select, Table, Loader } from '@mantine/core';
import { IconPointFilled, IconDownload } from '@tabler/icons-react';
import { fetchElevations } from '../../lib/elevationProfile';
import { useGeoJsonSources } from '../../lib/geojsonSources';
import type { PluginDefinition, PluginContext } from '../sdk';

/** Open-Elevation serves ~90 m SRTM, so a tighter cross would read the same cell twice. */
const NEIGHBOUR_OFFSET_M = 90;
const METERS_PER_DEGREE_LAT = 111_320;

interface SampleResult {
  id: number;
  lat: number;
  lng: number;
  values: Record<string, number | null>;
}

interface Neighbours {
  east: number;
  west: number;
  north: number;
  south: number;
}

/**
 * Slope in degrees and the downhill bearing (clockwise from north) from a cross
 * of neighbour elevations spaced `spacing` metres from the centre.
 */
export function slopeAspect(
  n: Neighbours,
  spacing: number,
): { slope: number; aspect: number | null } {
  const dzdx = (n.east - n.west) / (2 * spacing);
  const dzdy = (n.north - n.south) / (2 * spacing);
  const slope = (Math.atan(Math.hypot(dzdx, dzdy)) * 180) / Math.PI;
  if (dzdx === 0 && dzdy === 0) return { slope: 0, aspect: null };
  return { slope, aspect: ((Math.atan2(-dzdx, -dzdy) * 180) / Math.PI + 360) % 360 };
}

/** Centre point followed by its east, west, north and south neighbours. */
function crossCoords(lat: number, lng: number): [number, number][] {
  const dLat = NEIGHBOUR_OFFSET_M / METERS_PER_DEGREE_LAT;
  const dLng =
    NEIGHBOUR_OFFSET_M /
    (METERS_PER_DEGREE_LAT * Math.max(Math.cos((lat * Math.PI) / 180), 1e-6));
  return [
    [lng, lat],
    [lng + dLng, lat],
    [lng - dLng, lat],
    [lng, lat + dLat],
    [lng, lat - dLat],
  ];
}

function PointSamplingPanel({ ctx }: { ctx: PluginContext }) {
  const [pointLayer, setPointLayer] = useState<string | null>(null);
  const [results, setResults] = useState<SampleResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualPoints, setManualPoints] = useState<Array<{ lat: number; lng: number }>>([]);

  const sources = useGeoJsonSources()
    .map((s) => ({
      ...s,
      points: s.geojson.features
        .filter((f) => f.geometry?.type === 'Point')
        .map((f) => (f.geometry as GeoJSON.Point).coordinates),
    }))
    .filter((s) => s.points.length > 0);

  const selected = sources.find((s) => s.id === pointLayer);
  const points = selected
    ? selected.points.map(([lng, lat]) => ({ lat, lng }))
    : manualPoints;

  const handleAddPoint = () => {
    const coords = ctx.map.getCursorCoords();
    if (coords) {
      setManualPoints((prev) => [...prev, { lat: coords.lat, lng: coords.lng }]);
    }
  };

  const handleSample = async () => {
    if (points.length === 0) {
      setError('Add points from the map cursor, or select a point layer.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const coords = points.flatMap((p) => crossCoords(p.lat, p.lng));
      const elevations = await fetchElevations(coords);

      const sampled: SampleResult[] = points.map((pt, i) => {
        const [centre, east, west, north, south] = elevations.slice(i * 5, i * 5 + 5);
        const { slope, aspect } = slopeAspect(
          { east, west, north, south },
          NEIGHBOUR_OFFSET_M,
        );
        return {
          id: i + 1,
          lat: pt.lat,
          lng: pt.lng,
          values: {
            elevation: centre,
            slope: Math.round(slope * 10) / 10,
            aspect: aspect === null ? null : Math.round(aspect),
          },
        };
      });

      setResults(sampled);

      // Show sample points on map
      ctx.map.addGeoJsonLayer('sample-points', {
        type: 'FeatureCollection',
        features: sampled.map((s) => ({
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [s.lng, s.lat] },
          properties: { id: s.id, ...s.values },
        })),
      }, { color: '#e74c3c' });
    } catch (e) {
      setResults([]);
      setError(e instanceof Error ? e.message : 'Elevation lookup failed');
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = () => {
    if (results.length === 0) return;
    const headers = ['id', 'lat', 'lng', ...Object.keys(results[0].values)];
    const rows = results.map((r) => [r.id, r.lat.toFixed(6), r.lng.toFixed(6), ...Object.values(r.values)].join(','));
    const csv = [headers.join(','), ...rows].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'point-samples.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Paper p="md" withBorder style={{ width: 420, maxHeight: '80vh', overflow: 'auto' }}>
      <Stack gap="sm">
        <Group justify="space-between">
          <Text fw={600} size="lg">Point Sampling</Text>
          <Badge size="sm" color="red">{results.length} samples</Badge>
        </Group>

        <Select
          label="Point Layer (or click map to add)"
          data={sources.map((s) => ({ value: s.id, label: `${s.name} — ${s.points.length} points` }))}
          value={pointLayer}
          onChange={setPointLayer}
          placeholder={sources.length ? 'Select point layer' : 'No point layers loaded'}
          clearable
        />

        <Button size="xs" variant="light" onClick={handleAddPoint}>
          + Add Point from Map Cursor
        </Button>

        {manualPoints.length > 0 && (
          <Text size="xs" c="dimmed">{manualPoints.length} manual points added</Text>
        )}

        <Text size="xs" c="dimmed">
          Elevation from Open-Elevation; slope and aspect from a {NEIGHBOUR_OFFSET_M} m neighbour cross.
        </Text>

        <Button
          leftSection={loading ? <Loader size={14} /> : <IconPointFilled size={14} />}
          onClick={handleSample}
          disabled={loading || points.length === 0}
          fullWidth
          color="red"
        >
          {loading ? 'Sampling...' : `Sample ${points.length} points`}
        </Button>

        {error && <Text size="sm" c="red">{error}</Text>}

        {results.length > 0 && (
          <>
            <Table striped highlightOnHover withTableBorder style={{ fontSize: 11 }}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>#</Table.Th>
                  <Table.Th>Lat</Table.Th>
                  <Table.Th>Lng</Table.Th>
                  {Object.keys(results[0].values).map((k) => (
                    <Table.Th key={k}>{k}</Table.Th>
                  ))}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {results.slice(0, 20).map((r) => (
                  <Table.Tr key={r.id}>
                    <Table.Td>{r.id}</Table.Td>
                    <Table.Td>{r.lat.toFixed(4)}</Table.Td>
                    <Table.Td>{r.lng.toFixed(4)}</Table.Td>
                    {Object.entries(r.values).map(([k, v]) => (
                      <Table.Td key={k}>{v ?? '—'}</Table.Td>
                    ))}
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>

            <Button size="xs" variant="light" leftSection={<IconDownload size={14} />} onClick={handleExportCSV}>
              Export as CSV
            </Button>
          </>
        )}
      </Stack>
    </Paper>
  );
}

const plugin: PluginDefinition = {
  id: 'point-sampling',
  name: 'Point Sampling',
  description: 'Sample elevation, slope and aspect at point locations, export results as CSV',
  version: '1.0.0',
  author: 'TileTopia-HQ',
  icon: <IconPointFilled size={14} />,
  category: 'analysis',
  Panel: PointSamplingPanel,
};

export default plugin;
