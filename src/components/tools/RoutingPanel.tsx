import { useState } from 'react';
import {
  Text,
  Stack,
  Group,
  TextInput,
  Button,
  Badge,
} from '@mantine/core';
import { IconRoute, IconMapPin } from '@tabler/icons-react';
import { PanelCard, PanelHeader } from '../PanelCard';
import { geocode } from '../../services/geocode';
import { route, type RouteResult } from '../../services/route';

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
      const [[orig], [dest]] = await Promise.all([
        geocode(origin, 1),
        geocode(destination, 1),
      ]);
      if (!orig || !dest) {
        setError('Could not geocode one or both locations');
        return;
      }

      const r = await route(orig, dest);
      if (r) {
        setResult(r);
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
    <PanelCard width={300}>
      <PanelHeader
        icon={<IconRoute size={16} />}
        title="Routing"
        onClose={onClose}
      />

      <Stack gap="xs">
        <TextInput
          size="xs"
          placeholder="Origin (address or place)"
          value={origin}
          onChange={(e) => setOrigin(e.currentTarget.value)}
          leftSection={<IconMapPin size={12} />}
        />
        <TextInput
          size="xs"
          placeholder="Destination"
          value={destination}
          onChange={(e) => setDestination(e.currentTarget.value)}
          leftSection={<IconMapPin size={12} />}
          onKeyDown={(e) => e.key === 'Enter' && handleRoute()}
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
              <Badge size="xs" color={result.source === 'itinera' ? 'teal' : 'gray'} variant="light">
                {result.source}
              </Badge>
            </Group>
            <Text size="xs" c="dimmed">
              {result.geometry.length} waypoints
            </Text>
          </Stack>
        )}
      </Stack>
    </PanelCard>
  );
}
