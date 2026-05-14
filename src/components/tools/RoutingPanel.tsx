import { useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  TextInput,
  Button,
  Badge,
  Loader,
} from '@mantine/core';
import { IconRoute, IconX, IconMapPin } from '@tabler/icons-react';

interface RouteResult {
  distance: number; // meters
  duration: number; // seconds
  geometry: [number, number][];
}

export function RoutingPanel({ onClose }: { onClose: () => void }) {
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RouteResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRoute = async () => {
    if (!origin.trim() || !destination.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // Geocode origin
      const origRes = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(origin)}&format=json&limit=1`,
      );
      const origData = await origRes.json();

      const destRes = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(destination)}&format=json&limit=1`,
      );
      const destData = await destRes.json();

      if (!origData[0] || !destData[0]) {
        setError('Could not geocode one or both locations');
        return;
      }

      const oLng = origData[0].lon;
      const oLat = origData[0].lat;
      const dLng = destData[0].lon;
      const dLat = destData[0].lat;

      // OSRM routing
      const routeRes = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${oLng},${oLat};${dLng},${dLat}?geometries=geojson&overview=full`,
      );
      const routeData = await routeRes.json();

      if (routeData.routes?.[0]) {
        const route = routeData.routes[0];
        setResult({
          distance: route.distance,
          duration: route.duration,
          geometry: route.geometry.coordinates,
        });
      } else {
        setError('No route found');
      }
    } catch {
      setError('Routing request failed');
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
        width: 300,
        background: '#161b22',
        border: '1px solid #30363d',
        zIndex: 300,
      }}
    >
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconRoute size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Routing
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs">
        <TextInput
          size="xs"
          placeholder="Origin (address or place)"
          value={origin}
          onChange={(e) => setOrigin(e.currentTarget.value)}
          leftSection={<IconMapPin size={12} />}
          styles={{
            input: { background: '#0d1117', borderColor: '#30363d' },
          }}
        />
        <TextInput
          size="xs"
          placeholder="Destination"
          value={destination}
          onChange={(e) => setDestination(e.currentTarget.value)}
          leftSection={<IconMapPin size={12} />}
          onKeyDown={(e) => e.key === 'Enter' && handleRoute()}
          styles={{
            input: { background: '#0d1117', borderColor: '#30363d' },
          }}
        />
        <Button
          size="xs"
          color="violet"
          onClick={handleRoute}
          loading={loading}
          disabled={!origin.trim() || !destination.trim()}
        >
          Find Route
        </Button>

        {error && (
          <Text size="xs" c="red">
            {error}
          </Text>
        )}

        {result && (
          <Stack gap={4}>
            <Group gap="xs">
              <Badge size="xs" color="violet">
                {(result.distance / 1000).toFixed(1)} km
              </Badge>
              <Badge size="xs" color="gray">
                {Math.round(result.duration / 60)} min
              </Badge>
            </Group>
            <Text size="xs" c="dimmed">
              {result.geometry.length} waypoints
            </Text>
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
