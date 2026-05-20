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
  TextInput,
  Checkbox,
  Divider,
  Progress,
} from '@mantine/core';
import {
  IconX,
  IconPackage,
  IconRoute,
  IconPlus,
  IconPlayerPlay,
  IconTrash,
  IconMapPin,
} from '@tabler/icons-react';

interface DeliveryStop {
  id: string;
  address: string;
  lat: number;
  lng: number;
  notes: string;
  completed: boolean;
  eta: string | null;
  arrivedAt: string | null;
}

interface DeliveryRoute {
  id: string;
  name: string;
  vehicleId: string | null;
  stops: DeliveryStop[];
  optimized: boolean;
  totalDistance: number; // meters
  totalTime: number; // seconds
}

interface DeliveryPanelProps {
  onFlyTo: (lat: number, lng: number, zoom?: number) => void;
  onShowRoute: (stops: Array<{ lat: number; lng: number }>) => void;
  onClose: () => void;
}

export function DeliveryPanel({
  onFlyTo,
  onShowRoute,
  onClose,
}: DeliveryPanelProps) {
  const [routes, setRoutes] = useState<DeliveryRoute[]>([]);
  const [activeRoute, setActiveRoute] = useState<string | null>(null);
  const [newStop, setNewStop] = useState('');
  const [loading, setLoading] = useState(false);

  const currentRoute = routes.find((r) => r.id === activeRoute);

  const handleCreateRoute = () => {
    const route: DeliveryRoute = {
      id: crypto.randomUUID(),
      name: `Route ${routes.length + 1}`,
      vehicleId: null,
      stops: [],
      optimized: false,
      totalDistance: 0,
      totalTime: 0,
    };
    setRoutes([...routes, route]);
    setActiveRoute(route.id);
  };

  const handleAddStop = async () => {
    if (!newStop.trim() || !activeRoute) return;

    // Geocode the address
    try {
      const res = await fetch(
        `/api/geocode?q=${encodeURIComponent(newStop.trim())}`,
      );
      const data = await res.json();
      if (data.results && data.results.length > 0) {
        const result = data.results[0];
        const stop: DeliveryStop = {
          id: crypto.randomUUID(),
          address: result.display_name || newStop,
          lat: result.lat,
          lng: result.lng,
          notes: '',
          completed: false,
          eta: null,
          arrivedAt: null,
        };
        setRoutes(
          routes.map((r) =>
            r.id === activeRoute
              ? { ...r, stops: [...r.stops, stop], optimized: false }
              : r,
          ),
        );
        setNewStop('');
      }
    } catch {
      // Add with placeholder coords
      const stop: DeliveryStop = {
        id: crypto.randomUUID(),
        address: newStop,
        lat: 0,
        lng: 0,
        notes: '',
        completed: false,
        eta: null,
        arrivedAt: null,
      };
      setRoutes(
        routes.map((r) =>
          r.id === activeRoute
            ? { ...r, stops: [...r.stops, stop], optimized: false }
            : r,
        ),
      );
      setNewStop('');
    }
  };

  const handleOptimize = async () => {
    if (!currentRoute || currentRoute.stops.length < 2) return;
    setLoading(true);

    try {
      const res = await fetch('/api/routing/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stops: currentRoute.stops.map((s) => ({
            lat: s.lat,
            lng: s.lng,
          })),
          return_to_depot: false,
        }),
      });
      const data = await res.json();
      if (data.order) {
        const reordered = data.order.map(
          (i: number) => currentRoute.stops[i],
        );
        setRoutes(
          routes.map((r) =>
            r.id === activeRoute
              ? {
                  ...r,
                  stops: reordered,
                  optimized: true,
                  totalDistance: data.total_distance || 0,
                  totalTime: data.total_time || 0,
                }
              : r,
          ),
        );
        onShowRoute(reordered.map((s: DeliveryStop) => ({ lat: s.lat, lng: s.lng })));
      }
    } catch {
      // optimization failed
    } finally {
      setLoading(false);
    }
  };

  const handleToggleComplete = (stopId: string) => {
    setRoutes(
      routes.map((r) =>
        r.id === activeRoute
          ? {
              ...r,
              stops: r.stops.map((s) =>
                s.id === stopId ? { ...s, completed: !s.completed } : s,
              ),
            }
          : r,
      ),
    );
  };

  const handleRemoveStop = (stopId: string) => {
    setRoutes(
      routes.map((r) =>
        r.id === activeRoute
          ? { ...r, stops: r.stops.filter((s) => s.id !== stopId), optimized: false }
          : r,
      ),
    );
  };

  const completedCount = currentRoute?.stops.filter((s) => s.completed).length || 0;
  const totalStops = currentRoute?.stops.length || 0;

  return (
    <Paper p="sm" radius="md" withBorder>
      <Stack gap="xs">
        <Group justify="space-between">
          <Group gap="xs">
            <IconPackage size={18} />
            <Text fw={600} size="sm">
              Deliveries
            </Text>
          </Group>
          <ActionIcon size="sm" variant="subtle" onClick={onClose}>
            <IconX size={14} />
          </ActionIcon>
        </Group>

        {/* Route list */}
        <Group gap="xs">
          {routes.map((r) => (
            <Badge
              key={r.id}
              size="sm"
              variant={r.id === activeRoute ? 'filled' : 'light'}
              style={{ cursor: 'pointer' }}
              onClick={() => setActiveRoute(r.id)}
            >
              {r.name}
            </Badge>
          ))}
          <ActionIcon size="xs" variant="light" onClick={handleCreateRoute}>
            <IconPlus size={12} />
          </ActionIcon>
        </Group>

        {currentRoute && (
          <>
            <Divider />

            {/* Progress */}
            {totalStops > 0 && (
              <Stack gap={4}>
                <Group justify="space-between">
                  <Text size="xs" c="dimmed">
                    Progress
                  </Text>
                  <Text size="xs">
                    {completedCount}/{totalStops} delivered
                  </Text>
                </Group>
                <Progress
                  value={(completedCount / totalStops) * 100}
                  size="sm"
                  color="green"
                />
              </Stack>
            )}

            {/* Stats */}
            {currentRoute.optimized && (
              <Group gap="md">
                <Text size="xs" c="dimmed">
                  <IconRoute size={12} />{' '}
                  {(currentRoute.totalDistance / 1000).toFixed(1)} km
                </Text>
                <Text size="xs" c="dimmed">
                  ~{Math.ceil(currentRoute.totalTime / 60)} min
                </Text>
              </Group>
            )}

            {/* Add stop */}
            <Group gap="xs">
              <TextInput
                size="xs"
                placeholder="Add delivery address..."
                value={newStop}
                onChange={(e) => setNewStop(e.currentTarget.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddStop()}
                style={{ flex: 1 }}
              />
              <ActionIcon size="sm" onClick={handleAddStop}>
                <IconPlus size={14} />
              </ActionIcon>
            </Group>

            {/* Optimize button */}
            <Button
              size="xs"
              leftSection={<IconPlayerPlay size={14} />}
              onClick={handleOptimize}
              loading={loading}
              disabled={currentRoute.stops.length < 2}
              variant={currentRoute.optimized ? 'light' : 'filled'}
            >
              {currentRoute.optimized ? 'Re-optimize' : 'Optimize Route'}
            </Button>

            {/* Stops list */}
            <ScrollArea h={300}>
              <Table>
                <Table.Tbody>
                  {currentRoute.stops.map((stop, i) => (
                    <Table.Tr key={stop.id}>
                      <Table.Td w={30}>
                        <Checkbox
                          size="xs"
                          checked={stop.completed}
                          onChange={() => handleToggleComplete(stop.id)}
                        />
                      </Table.Td>
                      <Table.Td>
                        <Group gap={4}>
                          <Badge size="xs" circle variant="light">
                            {i + 1}
                          </Badge>
                          <Text
                            size="xs"
                            td={stop.completed ? 'line-through' : undefined}
                            style={{ cursor: 'pointer' }}
                            onClick={() => onFlyTo(stop.lat, stop.lng, 17)}
                          >
                            {stop.address}
                          </Text>
                        </Group>
                      </Table.Td>
                      <Table.Td w={30}>
                        <ActionIcon
                          size="xs"
                          variant="subtle"
                          color="red"
                          onClick={() => handleRemoveStop(stop.id)}
                        >
                          <IconTrash size={12} />
                        </ActionIcon>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          </>
        )}

        {!currentRoute && (
          <Stack gap="xs" align="center" py="md">
            <IconMapPin size={32} color="gray" />
            <Text size="sm" c="dimmed">
              Create a route to start planning deliveries
            </Text>
            <Button
              size="xs"
              leftSection={<IconPlus size={14} />}
              onClick={handleCreateRoute}
            >
              New Route
            </Button>
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
