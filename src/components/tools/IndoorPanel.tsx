import { useCallback, useEffect, useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  Select,
  Switch,
  Button,
  Badge,
  FileButton,
  ScrollArea,
} from '@mantine/core';
import { IconBuilding, IconX, IconRefresh, IconUpload, IconRoute } from '@tabler/icons-react';
import { useAgentLayerStore } from '../../store/agentLayers';
import { getAuthToken } from '../../features/auth/store';
import {
  IndoorError,
  floorGeojson,
  listVenues,
  requestRoute,
  uploadVenue,
  type IndoorRoute,
  type RoutePoint,
  type Venue,
} from '../../lib/indoorMaps';

const FLOOR_LAYER = 'indoor-floor';
const ROUTE_LAYER = 'indoor-route';

/** Where the next map click lands. */
type Picking = 'from' | 'to' | null;

function floorLabel(ordinal: number): string {
  if (ordinal === 0) return 'Ground floor';
  return ordinal < 0 ? `B${-ordinal} (basement)` : `Floor ${ordinal}`;
}

function eta(seconds: number): string {
  return seconds < 60 ? `${Math.round(seconds)} s` : `${Math.round(seconds / 60)} min`;
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function IndoorPanel({ onClose }: { onClose: () => void }) {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [venueId, setVenueId] = useState<string | null>(null);
  const [floor, setFloor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState<Picking>(null);
  const [from, setFrom] = useState<RoutePoint | null>(null);
  const [to, setTo] = useState<RoutePoint | null>(null);
  const [accessible, setAccessible] = useState(false);
  const [route, setRoute] = useState<IndoorRoute | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routing, setRouting] = useState(false);

  const venue = venues.find((v) => v.id === venueId) ?? null;

  const refresh = useCallback(async () => {
    // without a token every venue route can only answer 401, so we never send one
    if (!getAuthToken()) {
      setNeedsSignIn(true);
      setVenues([]);
      return;
    }
    setNeedsSignIn(false);
    setLoading(true);
    setError(null);
    try {
      setVenues(await listVenues());
    } catch (e) {
      if (e instanceof IndoorError && e.status === 401) setNeedsSignIn(true);
      else setError(message(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // the floor on screen, drawn through the agent layers every renderer reads
  useEffect(() => {
    if (!venueId || floor === null) return;
    let cancelled = false;
    const ordinal = Number(floor);
    floorGeojson(venueId, ordinal)
      .then((geojson) => {
        if (cancelled) return;
        setError(null);
        useAgentLayerStore.getState().addLayer({
          id: FLOOR_LAYER,
          name: `Indoor floor ${ordinal}`,
          color: '#a78bfa',
          geojson,
        });
      })
      .catch((e) => {
        if (!cancelled) setError(message(e));
      });
    return () => {
      cancelled = true;
    };
  }, [venueId, floor]);

  useEffect(() => {
    if (!picking || floor === null) return;
    const handler = (e: Event) => {
      const { lat, lng } = (e as CustomEvent<{ lat: number; lng: number }>).detail;
      const point: RoutePoint = { lon: lng, lat, floor: Number(floor) };
      if (picking === 'from') setFrom(point);
      else setTo(point);
      setPicking(null);
    };
    window.addEventListener('viewtopia:map:click', handler);
    return () => window.removeEventListener('viewtopia:map:click', handler);
  }, [picking, floor]);

  // closing the panel takes its layers off the map with it
  useEffect(
    () => () => {
      const store = useAgentLayerStore.getState();
      store.removeLayer(FLOOR_LAYER);
      store.removeLayer(ROUTE_LAYER);
    },
    [],
  );

  const clearRoute = () => {
    setRoute(null);
    setRouteError(null);
    setFrom(null);
    setTo(null);
    setPicking(null);
    useAgentLayerStore.getState().removeLayer(ROUTE_LAYER);
  };

  const pickVenue = (id: string | null) => {
    setVenueId(id);
    clearRoute();
    const picked = venues.find((v) => v.id === id);
    setFloor(picked?.floors.length ? String(picked.floors[0]) : null);
    if (!id) useAgentLayerStore.getState().removeLayer(FLOOR_LAYER);
  };

  const runRoute = async () => {
    if (!venueId || !from || !to) return;
    setRouting(true);
    setRouteError(null);
    try {
      const result = await requestRoute(venueId, from, to, accessible ? 'accessible' : 'default');
      setRoute(result);
      useAgentLayerStore.getState().addLayer({
        id: ROUTE_LAYER,
        name: 'Indoor route',
        color: '#f59f00',
        geojson: {
          type: 'FeatureCollection',
          features: [{ type: 'Feature', geometry: result.geometry, properties: {} }],
        },
        style: { filled: false, stroked: true, lineWidth: 3 },
      });
    } catch (e) {
      setRoute(null);
      useAgentLayerStore.getState().removeLayer(ROUTE_LAYER);
      setRouteError(message(e));
    } finally {
      setRouting(false);
    }
  };

  const upload = async (file: File | null) => {
    if (!file) return;
    setError(null);
    try {
      await uploadVenue(await file.text());
      await refresh();
    } catch (e) {
      setError(
        e instanceof IndoorError && e.status === 403
          ? 'This account cannot upload venues: an editor or admin role is required.'
          : message(e),
      );
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
        maxHeight: '70vh',
        background: '#161b22',
        border: '1px solid #30363d',
        zIndex: 300,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconBuilding size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Indoor Navigation
          </Text>
        </Group>
        <Group gap={4}>
          <ActionIcon
            size="sm"
            variant="subtle"
            color="gray"
            aria-label="Refresh venues"
            loading={loading}
            onClick={() => void refresh()}
          >
            <IconRefresh size={14} />
          </ActionIcon>
          <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
            <IconX size={14} />
          </ActionIcon>
        </Group>
      </Group>

      {needsSignIn ? (
        <Text size="xs" c="dimmed" py="lg" ta="center" data-testid="indoor-signin">
          Sign in to browse indoor venues.
        </Text>
      ) : (
        <ScrollArea flex={1}>
          <Stack gap="xs">
            <Select
              size="xs"
              label="Venue"
              placeholder={venues.length ? 'Pick a venue' : 'No venues uploaded'}
              data={venues.map((v) => ({ value: v.id, label: v.name }))}
              value={venueId}
              onChange={pickVenue}
              data-testid="indoor-venue"
              styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
            />

            {venue && (
              <Select
                size="xs"
                label="Floor"
                data={venue.floors.map((f) => ({ value: String(f), label: floorLabel(f) }))}
                value={floor}
                onChange={setFloor}
                data-testid="indoor-floor"
                styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
              />
            )}

            {error && (
              <Text size="xs" c="red" data-testid="indoor-error">
                {error}
              </Text>
            )}

            {venue && (
              <>
                <Switch
                  size="xs"
                  label="Accessible route"
                  checked={accessible}
                  onChange={(e) => setAccessible(e.currentTarget.checked)}
                  color="violet"
                />

                <Group grow gap="xs">
                  <Button
                    size="xs"
                    variant={picking === 'from' ? 'filled' : 'light'}
                    color="violet"
                    onClick={() => setPicking(picking === 'from' ? null : 'from')}
                  >
                    {from ? 'Start set' : 'Set start'}
                  </Button>
                  <Button
                    size="xs"
                    variant={picking === 'to' ? 'filled' : 'light'}
                    color="violet"
                    onClick={() => setPicking(picking === 'to' ? null : 'to')}
                  >
                    {to ? 'End set' : 'Set end'}
                  </Button>
                </Group>

                <Text size="xs" c={picking ? 'violet' : 'dimmed'} data-testid="indoor-hint">
                  {picking
                    ? `Click the map to place the ${picking === 'from' ? 'start' : 'end'} on floor ${floor}.`
                    : 'Pick two points on the map to route between them.'}
                </Text>

                <Button
                  size="xs"
                  color="violet"
                  leftSection={<IconRoute size={14} />}
                  disabled={!from || !to}
                  loading={routing}
                  onClick={() => void runRoute()}
                  fullWidth
                >
                  Route
                </Button>

                {(from || to || route) && (
                  <Button size="xs" variant="subtle" color="gray" onClick={clearRoute} fullWidth>
                    Clear route
                  </Button>
                )}

                {routeError && (
                  <Text size="xs" c="red" data-testid="indoor-route-error">
                    {routeError}
                  </Text>
                )}

                {route && (
                  <Stack gap={4} data-testid="indoor-route-result">
                    <Group gap="xs">
                      <Badge size="xs" variant="light" color="violet">
                        {Math.round(route.totalDistance)} m
                      </Badge>
                      <Badge size="xs" variant="light" color="violet">
                        {eta(route.estimatedTimeS)}
                      </Badge>
                    </Group>
                    <Text
                      size="xs"
                      c="dimmed"
                      data-testid="indoor-instructions"
                      style={{ whiteSpace: 'pre-line' }}
                    >
                      {route.instructions.map((step, index) => `${index + 1}. ${step}`).join('\n')}
                    </Text>
                  </Stack>
                )}
              </>
            )}

            <FileButton onChange={(file) => void upload(file)} accept="application/json,.json">
              {(props) => (
                <Button
                  size="xs"
                  variant="subtle"
                  color="violet"
                  leftSection={<IconUpload size={14} />}
                  fullWidth
                  {...props}
                >
                  Upload indoor map (.json)
                </Button>
              )}
            </FileButton>
          </Stack>
        </ScrollArea>
      )}
    </Paper>
  );
}
