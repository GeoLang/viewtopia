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
} from '@mantine/core';
import { IconX, IconActivity, IconAlertTriangle } from '@tabler/icons-react';

interface SensorReading {
  id: string;
  name: string;
  type: string; // temperature, humidity, air_quality, water_level, etc.
  value: number;
  unit: string;
  threshold: number | null;
  status: 'normal' | 'warning' | 'critical';
  lat: number;
  lng: number;
  lastUpdate: string;
}

interface SensorPanelProps {
  onFlyTo: (lat: number, lng: number, zoom?: number) => void;
  onClose: () => void;
}

const STATUS_COLORS = { normal: 'green', warning: 'yellow', critical: 'red' };

export function SensorPanel({ onFlyTo, onClose }: SensorPanelProps) {
  const [sensors, setSensors] = useState<SensorReading[]>([]);
  const [typeFilter, setTypeFilter] = useState<string | null>('all');

  useEffect(() => {
    const wsUrl = import.meta.env.VITE_SENSOR_WS_URL || 'ws://localhost:3004/ws/sensors';
    const ws = new WebSocket(wsUrl);
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === 'readings') setSensors(data.sensors);
      else if (data.type === 'update') {
        setSensors((prev) => prev.map((s) => (s.id === data.sensor.id ? data.sensor : s)));
      }
    };
    ws.onerror = () => {
      fetch('/api/sensors').then((r) => r.json()).then((d) => setSensors(d.sensors || [])).catch(() => {});
    };
    return () => ws.close();
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
          <ActionIcon size="sm" variant="subtle" onClick={onClose}><IconX size={14} /></ActionIcon>
        </Group>

        <Group gap="xs">
          <RingProgress size={40} thickness={4} sections={[{ value: normalPct, color: 'green' }]} label={<Text size="xs" ta="center">{sensors.length}</Text>} />
          {criticalCount > 0 && <Badge color="red" size="sm" leftSection={<IconAlertTriangle size={10} />}>{criticalCount} critical</Badge>}
          {warningCount > 0 && <Badge color="yellow" size="sm">{warningCount} warning</Badge>}
        </Group>

        <Select size="xs" value={typeFilter} onChange={setTypeFilter} data={[{ value: 'all', label: 'All Types' }, ...sensorTypes.map((t) => ({ value: t, label: t.replace(/_/g, ' ') }))]} />

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
                <Table.Tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => onFlyTo(s.lat, s.lng, 16)}>
                  <Table.Td><Stack gap={0}><Text size="xs" fw={500}>{s.name}</Text><Text size="xs" c="dimmed">{s.type.replace(/_/g, ' ')}</Text></Stack></Table.Td>
                  <Table.Td><Text size="xs" fw={500}>{s.value} {s.unit}</Text></Table.Td>
                  <Table.Td><Badge size="xs" color={STATUS_COLORS[s.status]}>{s.status}</Badge></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      </Stack>
    </Paper>
  );
}
