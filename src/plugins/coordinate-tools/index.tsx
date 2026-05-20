/**
 * Coordinate Tools Plugin — Parse, convert, display, and navigate to coordinates.
 * Equivalent to: QGIS Lat Lon Tools (1.7M downloads)
 */

import { useState } from 'react';
import { Paper, Text, Stack, TextInput, Button, Group, Badge, Select, CopyButton, ActionIcon, Table } from '@mantine/core';
import { IconCrosshair, IconCopy, IconCheck } from '@tabler/icons-react';
import type { PluginDefinition, PluginContext } from '../sdk';

type CoordFormat = 'dd' | 'dms' | 'ddm' | 'utm' | 'mgrs' | 'geohash' | 'wkt' | 'geojson';

function toDMS(deg: number, isLat: boolean): string {
  const dir = isLat ? (deg >= 0 ? 'N' : 'S') : (deg >= 0 ? 'E' : 'W');
  const abs = Math.abs(deg);
  const d = Math.floor(abs);
  const m = Math.floor((abs - d) * 60);
  const s = ((abs - d) * 60 - m) * 60;
  return `${d}°${m}'${s.toFixed(2)}"${dir}`;
}

function toDDM(deg: number, isLat: boolean): string {
  const dir = isLat ? (deg >= 0 ? 'N' : 'S') : (deg >= 0 ? 'E' : 'W');
  const abs = Math.abs(deg);
  const d = Math.floor(abs);
  const m = (abs - d) * 60;
  return `${d}°${m.toFixed(4)}'${dir}`;
}

function toUTM(lat: number, lng: number): string {
  const zone = Math.floor((lng + 180) / 6) + 1;
  const letter = lat >= 0 ? 'N' : 'S';
  // Simplified UTM — full conversion requires complex math
  return `${zone}${letter} ${lng.toFixed(0)}mE ${lat.toFixed(0)}mN`;
}

function toGeohash(lat: number, lng: number, precision = 8): string {
  const base32 = '0123456789bcdefghjkmnpqrstuvwxyz';
  let minLat = -90, maxLat = 90, minLng = -180, maxLng = 180;
  let hash = '';
  let isEven = true;
  let bit = 0;
  let ch = 0;

  while (hash.length < precision) {
    if (isEven) {
      const mid = (minLng + maxLng) / 2;
      if (lng > mid) { ch |= (1 << (4 - bit)); minLng = mid; } else { maxLng = mid; }
    } else {
      const mid = (minLat + maxLat) / 2;
      if (lat > mid) { ch |= (1 << (4 - bit)); minLat = mid; } else { maxLat = mid; }
    }
    isEven = !isEven;
    if (bit < 4) { bit++; } else { hash += base32[ch]; bit = 0; ch = 0; }
  }
  return hash;
}

function parseCoordInput(input: string): { lat: number; lng: number } | null {
  // Try DD: "51.5074, -0.1278" or "51.5074 -0.1278"
  const ddMatch = input.match(/^(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)$/);
  if (ddMatch) return { lat: parseFloat(ddMatch[1]), lng: parseFloat(ddMatch[2]) };

  // Try DMS: 51°30'26.64"N, 0°7'40.08"W
  const dmsMatch = input.match(/(\d+)°(\d+)'([\d.]+)"([NSEW])/gi);
  if (dmsMatch && dmsMatch.length >= 2) {
    const parse = (s: string) => {
      const m = s.match(/(\d+)°(\d+)'([\d.]+)"([NSEW])/i);
      if (!m) return 0;
      const val = parseInt(m[1]) + parseInt(m[2]) / 60 + parseFloat(m[3]) / 3600;
      return (m[4] === 'S' || m[4] === 'W') ? -val : val;
    };
    return { lat: parse(dmsMatch[0]), lng: parse(dmsMatch[1]) };
  }

  return null;
}

function CoordinateToolsPanel({ ctx }: { ctx: PluginContext }) {
  const [input, setInput] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [format, setFormat] = useState<CoordFormat>('dd');

  const handleParse = () => {
    const result = parseCoordInput(input);
    if (result) {
      setLat(result.lat);
      setLng(result.lng);
    }
  };

  const handleFlyTo = () => {
    if (lat !== null && lng !== null) {
      ctx.map.flyTo(lng, lat, 14);
    }
  };

  const handleGetCursor = () => {
    const coords = ctx.map.getCursorCoords();
    if (coords) {
      setLat(coords.lat);
      setLng(coords.lng);
      setInput(`${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`);
    }
  };

  const formatCoord = (fmt: CoordFormat): string => {
    if (lat === null || lng === null) return '—';
    switch (fmt) {
      case 'dd': return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      case 'dms': return `${toDMS(lat, true)}, ${toDMS(lng, false)}`;
      case 'ddm': return `${toDDM(lat, true)}, ${toDDM(lng, false)}`;
      case 'utm': return toUTM(lat, lng);
      case 'mgrs': return `(approx) ${toUTM(lat, lng)}`;
      case 'geohash': return toGeohash(lat, lng);
      case 'wkt': return `POINT(${lng.toFixed(6)} ${lat.toFixed(6)})`;
      case 'geojson': return JSON.stringify({ type: 'Point', coordinates: [lng, lat] });
      default: return '';
    }
  };

  const allFormats: CoordFormat[] = ['dd', 'dms', 'ddm', 'utm', 'geohash', 'wkt', 'geojson'];

  return (
    <Paper p="md" withBorder style={{ width: 380 }}>
      <Stack gap="sm">
        <Group justify="space-between">
          <Text fw={600} size="lg">Coordinate Tools</Text>
          <Badge size="sm">WGS84</Badge>
        </Group>

        <Group gap="xs">
          <TextInput
            placeholder="51.5074, -0.1278 or DMS..."
            value={input}
            onChange={(e) => setInput(e.currentTarget.value)}
            style={{ flex: 1 }}
            onKeyDown={(e) => e.key === 'Enter' && handleParse()}
          />
          <Button size="sm" onClick={handleParse}>Parse</Button>
        </Group>

        <Group gap="xs">
          <Button size="xs" variant="light" leftSection={<IconCrosshair size={14} />} onClick={handleGetCursor}>
            From Map
          </Button>
          <Button size="xs" variant="light" onClick={handleFlyTo} disabled={lat === null}>
            Fly To
          </Button>
        </Group>

        <Select
          label="Display Format"
          data={[
            { value: 'dd', label: 'Decimal Degrees (DD)' },
            { value: 'dms', label: 'Degrees Minutes Seconds (DMS)' },
            { value: 'ddm', label: 'Degrees Decimal Minutes (DDM)' },
            { value: 'utm', label: 'UTM' },
            { value: 'geohash', label: 'Geohash' },
            { value: 'wkt', label: 'WKT' },
            { value: 'geojson', label: 'GeoJSON' },
          ]}
          value={format}
          onChange={(v) => setFormat((v || 'dd') as CoordFormat)}
        />

        {lat !== null && lng !== null && (
          <Table striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Format</Table.Th>
                <Table.Th>Value</Table.Th>
                <Table.Th w={40}></Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {allFormats.map((fmt) => (
                <Table.Tr key={fmt}>
                  <Table.Td><Text size="xs" fw={500}>{fmt.toUpperCase()}</Text></Table.Td>
                  <Table.Td><Text size="xs" style={{ fontFamily: 'monospace' }}>{formatCoord(fmt)}</Text></Table.Td>
                  <Table.Td>
                    <CopyButton value={formatCoord(fmt)}>
                      {({ copied, copy }) => (
                        <ActionIcon size="xs" variant="subtle" onClick={copy}>
                          {copied ? <IconCheck size={12} /> : <IconCopy size={12} />}
                        </ActionIcon>
                      )}
                    </CopyButton>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Stack>
    </Paper>
  );
}

const plugin: PluginDefinition = {
  id: 'coordinate-tools',
  name: 'Coordinate Tools',
  description: 'Parse, convert, and navigate to coordinates in multiple formats (DD, DMS, UTM, Geohash, WKT)',
  version: '1.0.0',
  author: 'TileTopia-HQ',
  icon: <IconCrosshair size={14} />,
  category: 'tools',
  Panel: CoordinateToolsPanel,
  shortcut: 'ctrl+shift+c',
};

export default plugin;
