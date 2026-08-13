import { useState } from 'react';
import {
  Text,
  Stack,
  Group,
  TextInput,
  Button,
  Badge,
} from '@mantine/core';
import { IconRoute, IconMapPin, IconMovie } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { PanelCard, PanelHeader } from '../PanelCard';
import { PanelSkeleton } from '../PanelStates';
import { geocode } from '../../services/geocode';
import { route, type RouteResult } from '../../services/route';
import { useAppStore } from '../../store/app';
import { useFlythroughStore } from '../../store/flythrough';

const routingFailed = (message: string) =>
  notifications.show({ title: 'Routing failed', message, color: 'red' });

export function RoutingPanel({ onClose }: { onClose: () => void }) {
  const setActivePanel = useAppStore((s) => s.setActivePanel);
  const setRouteGeometry = useFlythroughStore((s) => s.setRouteGeometry);
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RouteResult | null>(null);

  const handleRoute = async () => {
    if (!origin.trim() || !destination.trim()) return;
    setLoading(true);
    setResult(null);

    try {
      const [[orig], [dest]] = await Promise.all([
        geocode(origin, 1),
        geocode(destination, 1),
      ]);
      if (!orig || !dest) {
        routingFailed('Could not geocode one or both locations');
        return;
      }

      const r = await route(orig, dest);
      if (r) {
        setResult(r);
      } else {
        routingFailed('No route found');
      }
    } catch (err) {
      routingFailed(err instanceof Error ? err.message : 'Routing request failed');
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

        {loading && <PanelSkeleton rows={2} />}

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
            <Button
              size="xs"
              variant="light"
              color="violet"
              leftSection={<IconMovie size={14} />}
              onClick={() => {
                setRouteGeometry(result.geometry);
                setActivePanel('flythrough');
              }}
            >
              Fly This Route
            </Button>
          </Stack>
        )}
      </Stack>
    </PanelCard>
  );
}
