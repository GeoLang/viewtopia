import { useState, useEffect, useRef } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  Badge,
  ScrollArea,
  Table,
  TextInput,
  Select,
} from '@mantine/core';
import { IconX, IconTruck, IconSearch } from '@tabler/icons-react';

type VehicleStatus = 'active' | 'idle' | 'offline' | 'alert';

interface Vehicle {
  id: string;
  name: string;
  driver: string;
  lat: number;
  lng: number;
  speed: number; // km/h
  heading: number; // degrees
  status: VehicleStatus;
  lastUpdate: string;
  fuelLevel: number; // percentage
  currentRoute: string | null;
  stopsCompleted: number;
  stopsTotal: number;
}

interface FleetPanelProps {
  onFlyTo: (lat: number, lng: number, zoom?: number) => void;
  onTrackVehicle: (vehicleId: string) => void;
  onClose: () => void;
}

const STATUS_COLORS: Record<VehicleStatus, string> = {
  active: 'green',
  idle: 'yellow',
  offline: 'gray',
  alert: 'red',
};

export function FleetPanel({
  onFlyTo,
  onTrackVehicle,
  onClose,
}: FleetPanelProps) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>('all');
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Connect to fleet tracking WebSocket
    const wsUrl =
      import.meta.env.VITE_FLEET_WS_URL || 'ws://localhost:3003/ws/fleet';
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'positions') {
        setVehicles(data.vehicles);
      } else if (data.type === 'update') {
        setVehicles((prev) =>
          prev.map((v) => (v.id === data.vehicle.id ? data.vehicle : v)),
        );
      }
    };

    ws.onerror = () => {
      // Fallback: fetch via REST
      fetch('/api/fleet/vehicles')
        .then((r) => r.json())
        .then((data) => setVehicles(data.vehicles || []))
        .catch(() => {});
    };

    wsRef.current = ws;
    return () => ws.close();
  }, []);

  const filtered = vehicles.filter((v) => {
    const matchesText =
      !filter ||
      v.name.toLowerCase().includes(filter.toLowerCase()) ||
      v.driver.toLowerCase().includes(filter.toLowerCase());
    const matchesStatus =
      statusFilter === 'all' || v.status === statusFilter;
    return matchesText && matchesStatus;
  });

  const activeCount = vehicles.filter((v) => v.status === 'active').length;
  const alertCount = vehicles.filter((v) => v.status === 'alert').length;

  return (
    <Paper p="sm" radius="md" withBorder>
      <Stack gap="xs">
        <Group justify="space-between">
          <Group gap="xs">
            <IconTruck size={18} />
            <Text fw={600} size="sm">
              Fleet Tracking
            </Text>
          </Group>
          <ActionIcon size="sm" variant="subtle" onClick={onClose}>
            <IconX size={14} />
          </ActionIcon>
        </Group>

        <Group gap="xs">
          <Badge color="green" size="sm" variant="light">
            {activeCount} active
          </Badge>
          {alertCount > 0 && (
            <Badge color="red" size="sm" variant="light">
              {alertCount} alerts
            </Badge>
          )}
          <Badge color="gray" size="sm" variant="light">
            {vehicles.length} total
          </Badge>
        </Group>

        <Group gap="xs">
          <TextInput
            size="xs"
            placeholder="Search vehicles..."
            leftSection={<IconSearch size={14} />}
            value={filter}
            onChange={(e) => setFilter(e.currentTarget.value)}
            style={{ flex: 1 }}
          />
          <Select
            size="xs"
            value={statusFilter}
            onChange={setStatusFilter}
            data={[
              { value: 'all', label: 'All' },
              { value: 'active', label: 'Active' },
              { value: 'idle', label: 'Idle' },
              { value: 'alert', label: 'Alert' },
              { value: 'offline', label: 'Offline' },
            ]}
            w={100}
          />
        </Group>

        <ScrollArea h={400}>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Vehicle</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Speed</Table.Th>
                <Table.Th>Progress</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filtered.map((v) => (
                <Table.Tr
                  key={v.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => {
                    onFlyTo(v.lat, v.lng, 16);
                    onTrackVehicle(v.id);
                  }}
                >
                  <Table.Td>
                    <Stack gap={0}>
                      <Text size="xs" fw={500}>
                        {v.name}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {v.driver}
                      </Text>
                    </Stack>
                  </Table.Td>
                  <Table.Td>
                    <Badge
                      size="xs"
                      color={STATUS_COLORS[v.status]}
                      variant="light"
                    >
                      {v.status}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs">
                      {v.speed > 0 ? `${v.speed} km/h` : '—'}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    {v.stopsTotal > 0 ? (
                      <Text size="xs">
                        {v.stopsCompleted}/{v.stopsTotal}
                      </Text>
                    ) : (
                      <Text size="xs" c="dimmed">
                        —
                      </Text>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      </Stack>
    </Paper>
  );
}
