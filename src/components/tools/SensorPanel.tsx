import { useState, useEffect } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  Badge,
  ScrollArea,
  Table,
  Select,
  RingProgress,
  Loader,
} from '@mantine/core';
import { IconX, IconActivity, IconAlertTriangle } from '@tabler/icons-react';
import { discoverBranch, listSensors, SENSORS_DATASET } from '../../lib/verticals';

interface SensorRow {
  id: string;
  name: string;
  type: string;
  value: number | null;
  unit: string;
  status: string;
  lat: number | null;
  lng: number | null;
}

interface SensorPanelProps {
  onFlyTo: (lat: number, lng: number, zoom?: number) => void;
  onClose: () => void;
}

const STATUS_COLORS: Record<string, string> = { normal: 'green', warning: 'yellow', critical: 'red' };

export function SensorPanel({ onFlyTo, onClose }: SensorPanelProps) {
  const [sensors, setSensors] = useState<SensorRow[]>([]);
  const [typeFilter, setTypeFilter] = useState<string | null>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const branchId = await discoverBranch(SENSORS_DATASET);
        if (!branchId) {
          if (!cancelled) setError('No sensor dataset configured');
          return;
        }
        const rows = await listSensors(branchId);
        if (cancelled) return;
        setSensors(
          rows.map((s) => {
            const p = s.properties;
            const value = typeof p.value === 'number' ? p.value : null;
            const unit = typeof p.unit === 'string' ? p.unit : '';
            return {
              id: s.id,
              name: s.name ?? s.id.slice(0, 8),
              type: s.sensor_type ?? 'unknown',
              value,
              unit,
              status: s.status ?? 'normal',
              lat: s.lat,
              lng: s.lng,
            };
          }),
        );
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load sensors');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = sensors.filter((s) => typeFilter === 'all' || s.type === typeFilter);
  const criticalCount = sensors.filter((s) => s.status === 'critical').length;
  const warningCount = sensors.filter((s) => s.status === 'warning').length;
  const normalPct = sensors.length > 0 ? ((sensors.length - criticalCount - warningCount) / sensors.length) * 100 : 100;

  const sensorTypes = [...new Set(sensors.map((s) => s.type))];

  return (
    <Paper p="sm" radius="md" withBorder>
      <Stack gap="xs">
        <Group justify="space-between">
          <Group gap="xs">
            <IconActivity size={18} />
            <Text fw={600} size="sm">Sensors</Text>
          </Group>
          <ActionIcon aria-label="Close sensors" size="sm" variant="subtle" onClick={onClose}><IconX size={14} /></ActionIcon>
        </Group>

        <Group gap="xs">
          <RingProgress size={40} thickness={4} sections={[{ value: normalPct, color: 'green' }]} label={<Text size="xs" ta="center">{sensors.length}</Text>} />
          {criticalCount > 0 && <Badge color="red" size="sm" leftSection={<IconAlertTriangle size={10} />}>{criticalCount} critical</Badge>}
          {warningCount > 0 && <Badge color="yellow" size="sm">{warningCount} warning</Badge>}
        </Group>

        <Select size="xs" value={typeFilter} onChange={setTypeFilter} data={[{ value: 'all', label: 'All Types' }, ...sensorTypes.map((t) => ({ value: t, label: t.replace(/_/g, ' ') }))]} />

        {loading ? (
          <Group justify="center" py="md"><Loader size="sm" /></Group>
        ) : error ? (
          <Text size="xs" c="dimmed" ta="center" py="md">{error}</Text>
        ) : sensors.length === 0 ? (
          <Text size="xs" c="dimmed" ta="center" py="md">No sensors found</Text>
        ) : (
          <ScrollArea h={350}>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Sensor</Table.Th>
                  <Table.Th>Value</Table.Th>
                  <Table.Th>Status</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filtered.map((s) => (
                  <Table.Tr key={s.id} style={{ cursor: s.lat != null && s.lng != null ? 'pointer' : 'default' }} onClick={() => { if (s.lat != null && s.lng != null) onFlyTo(s.lat, s.lng, 16); }}>
                    <Table.Td><Stack gap={0}><Text size="xs" fw={500}>{s.name}</Text><Text size="xs" c="dimmed">{s.type.replace(/_/g, ' ')}</Text></Stack></Table.Td>
                    <Table.Td><Text size="xs" fw={500}>{s.value != null ? `${s.value} ${s.unit}` : '—'}</Text></Table.Td>
                    <Table.Td><Badge size="xs" color={STATUS_COLORS[s.status] ?? 'gray'}>{s.status}</Badge></Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        )}
      </Stack>
    </Paper>
  );
}
