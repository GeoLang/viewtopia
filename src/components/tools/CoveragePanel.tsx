import { useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  Button,
  Badge,
  ScrollArea,
  Table,
  NumberInput,
  Divider,
} from '@mantine/core';
import { IconX, IconAntenna, IconSignal4g, IconMapPin } from '@tabler/icons-react';
import { discoverBranch, listTowers, TOWERS_DATASET } from '../../lib/verticals';

export interface TowerSite {
  id: string;
  name: string;
  lat: number;
  lng: number;
  height: number; // meters
  technology: string; // 4G, 5G, etc.
  frequency: number; // MHz
  power: number; // dBm
  azimuth: number; // degrees
  beamwidth: number; // degrees
  coverageRadius: number; // meters
  status: 'active' | 'planned' | 'maintenance';
}

interface CoveragePanelProps {
  onFlyTo: (lat: number, lng: number, zoom?: number) => void;
  onShowCoverage: (tower: TowerSite) => void;
  onShowViewshed: (lat: number, lng: number, height: number) => void | Promise<void>;
  onClose: () => void;
}

export function CoveragePanel({ onFlyTo, onShowCoverage, onShowViewshed, onClose }: CoveragePanelProps) {
  const [towers, setTowers] = useState<TowerSite[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [simHeight, setSimHeight] = useState<number | string>(30);
  const [simLat, setSimLat] = useState<number | string>('');
  const [simLng, setSimLng] = useState<number | string>('');
  const [simulating, setSimulating] = useState(false);

  const handleLoad = async () => {
    setLoading(true);
    setError(null);
    try {
      const branchId = await discoverBranch(TOWERS_DATASET);
      if (!branchId) {
        setError('No tower dataset configured');
        setTowers([]);
        return;
      }
      const rows = await listTowers(branchId);
      setTowers(
        rows.map((t) => {
          const p = t.properties;
          const num = (k: string) => (typeof p[k] === 'number' ? (p[k] as number) : 0);
          const status = typeof p.status === 'string' ? (p.status as string) : 'active';
          return {
            id: t.id,
            name: t.name ?? t.id.slice(0, 8),
            lat: t.lat ?? 0,
            lng: t.lng ?? 0,
            height: t.height_m ?? 0,
            technology: t.technology ?? 'unknown',
            frequency: t.frequency_mhz ?? 0,
            power: num('power_dbm'),
            azimuth: num('azimuth'),
            beamwidth: num('beamwidth'),
            coverageRadius: num('coverage_radius_m'),
            status: (status as TowerSite['status']),
          };
        }),
      );
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load towers');
    } finally {
      setLoading(false);
    }
  };

  const handleSimulate = async () => {
    if (!simLat || !simLng) return;
    setSimulating(true);
    setError(null);
    try {
      await onShowViewshed(Number(simLat), Number(simLng), Number(simHeight));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Viewshed request failed');
    } finally {
      setSimulating(false);
    }
  };

  const activeCount = towers.filter((t) => t.status === 'active').length;

  return (
    <Paper p="sm" radius="md" withBorder>
      <Stack gap="xs">
        <Group justify="space-between">
          <Group gap="xs">
            <IconAntenna size={18} />
            <Text fw={600} size="sm">Network Coverage</Text>
          </Group>
          <ActionIcon aria-label="Close network coverage" size="sm" variant="subtle" onClick={onClose}><IconX size={14} /></ActionIcon>
        </Group>

        <Button size="xs" onClick={handleLoad} loading={loading} leftSection={<IconSignal4g size={14} />}>
          Load Towers
        </Button>

        {error && <Text size="xs" c="dimmed" ta="center">{error}</Text>}
        {loaded && !error && towers.length === 0 && <Text size="xs" c="dimmed" ta="center">No towers found</Text>}

        {towers.length > 0 && (
          <>
            <Group gap="xs">
              <Badge color="green" size="sm">{activeCount} active</Badge>
              <Badge color="gray" size="sm">{towers.length} total</Badge>
            </Group>

            <Text size="xs" c="dimmed">
              Clicking a site draws a simulated coverage footprint: the site's own
              coverage radius when the record has one, otherwise the radio horizon
              for its antenna height. No terrain or clutter is taken into account.
            </Text>

            <ScrollArea h={200}>
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Site</Table.Th>
                    <Table.Th>Tech</Table.Th>
                    <Table.Th>Height</Table.Th>
                    <Table.Th>Status</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {towers.map((t) => (
                    <Table.Tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => { onFlyTo(t.lat, t.lng, 15); onShowCoverage(t); }}>
                      <Table.Td><Text size="xs" fw={500}>{t.name}</Text></Table.Td>
                      <Table.Td><Badge size="xs" variant="light">{t.technology}</Badge></Table.Td>
                      <Table.Td><Text size="xs">{t.height}m</Text></Table.Td>
                      <Table.Td><Badge size="xs" color={t.status === 'active' ? 'green' : t.status === 'planned' ? 'blue' : 'orange'}>{t.status}</Badge></Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          </>
        )}

        <Divider label="Site Simulation" labelPosition="left" />
        <Text size="xs" c="dimmed">
          Terrain line of sight from a candidate site, out to the radio horizon for
          the antenna height.
        </Text>
        <Group gap="xs" grow>
          <NumberInput size="xs" label="Lat" value={simLat} onChange={setSimLat} decimalScale={6} />
          <NumberInput size="xs" label="Lng" value={simLng} onChange={setSimLng} decimalScale={6} />
        </Group>
        <NumberInput size="xs" label="Antenna height (m)" value={simHeight} onChange={setSimHeight} min={5} max={200} />
        <Button
          size="xs"
          onClick={handleSimulate}
          loading={simulating}
          disabled={!simLat || !simLng}
          leftSection={<IconMapPin size={14} />}
        >
          Run Viewshed
        </Button>
      </Stack>
    </Paper>
  );
}
