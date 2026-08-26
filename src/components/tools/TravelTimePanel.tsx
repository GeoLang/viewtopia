import { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Group,
  ScrollArea,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { IconClockHour4, IconDownload, IconGrid3x3, IconTarget } from '@tabler/icons-react';
import { PanelCard, PanelHeader } from '../PanelCard';
import { useAgentLayerStore, type AgentLayer } from '../../store/agentLayers';
import {
  DEFAULT_BAND_MINUTES,
  SERVICE_AREA_LAYER_ID,
  drawServiceAreaBands,
  parseBandMinutes,
} from '../../features/analysis/serviceArea';
import { downloadFile } from '../../features/spacetime/analysis/export';
import {
  TRAVEL_PROFILES,
  odCsv,
  odLineCollection,
  odMatrix,
  type OdEntry,
  type ServiceArea,
  type TravelPoint,
  type TravelProfile,
} from '../../lib/travelTime';

const OD_MATRIX_LAYER = 'travel-time-od-matrix';
/** rows and columns of the matrix drawn on screen; the CSV carries all of it */
const GRID_PREVIEW = 8;

type Mode = 'serviceArea' | 'odMatrix';

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

const originLabel = (index: number) => `O${index + 1}`;
const destinationLabel = (index: number) => `D${index + 1}`;

function pointsOf(layer: AgentLayer): TravelPoint[] {
  return layer.geojson.features.flatMap((feature) =>
    feature.geometry?.type === 'Point'
      ? [{ lon: feature.geometry.coordinates[0], lat: feature.geometry.coordinates[1] }]
      : [],
  );
}

export function TravelTimePanel({ onClose }: { onClose: () => void }) {
  const layers = useAgentLayerStore((s) => s.layers);
  const [mode, setMode] = useState<Mode>('serviceArea');
  const [profile, setProfile] = useState<TravelProfile>('car');
  const [running, setRunning] = useState(false);

  const [centre, setCentre] = useState<TravelPoint | null>(null);
  const [picking, setPicking] = useState(false);
  const [bands, setBands] = useState(DEFAULT_BAND_MINUTES);
  const [areas, setAreas] = useState<ServiceArea[]>([]);
  const [areaError, setAreaError] = useState<string | null>(null);

  const [originLayerId, setOriginLayerId] = useState<string | null>(null);
  const [destinationLayerId, setDestinationLayerId] = useState<string | null>(null);
  const [matrix, setMatrix] = useState<{
    origins: TravelPoint[];
    destinations: TravelPoint[];
    entries: OdEntry[];
  } | null>(null);
  const [matrixError, setMatrixError] = useState<string | null>(null);

  const pointLayers = useMemo(
    () => layers.map((layer) => ({ layer, points: pointsOf(layer) })).filter((l) => l.points.length),
    [layers],
  );
  const pointLayerOptions = pointLayers.map(({ layer, points }) => ({
    value: layer.id,
    label: `${layer.name} (${points.length})`,
  }));
  const pointsOfLayer = (id: string | null) =>
    pointLayers.find((l) => l.layer.id === id)?.points ?? [];

  const bandMinutes = parseBandMinutes(bands);

  useEffect(() => {
    if (!picking) return;
    const handler = (e: Event) => {
      const { lat, lng } = (e as CustomEvent<{ lat: number; lng: number }>).detail;
      setCentre({ lat, lon: lng });
      setPicking(false);
    };
    window.addEventListener('viewtopia:map:click', handler);
    return () => window.removeEventListener('viewtopia:map:click', handler);
  }, [picking]);

  // closing the panel takes its layers off the map with it
  useEffect(
    () => () => {
      const store = useAgentLayerStore.getState();
      store.removeLayer(SERVICE_AREA_LAYER_ID);
      store.removeLayer(OD_MATRIX_LAYER);
    },
    [],
  );

  const runServiceArea = async () => {
    if (!centre || bandMinutes.length === 0) return;
    setRunning(true);
    setAreaError(null);
    const drawn = await drawServiceAreaBands(centre, bandMinutes, profile);
    setAreas(drawn.areas);
    setAreaError(drawn.failure);
    setRunning(false);
  };

  const runOdMatrix = async () => {
    const origins = pointsOfLayer(originLayerId);
    const destinations = pointsOfLayer(destinationLayerId);
    if (!origins.length || !destinations.length) return;
    setRunning(true);
    setMatrixError(null);
    try {
      const entries = await odMatrix(origins, destinations, profile);
      setMatrix({ origins, destinations, entries });
      if (entries.length === 0) {
        useAgentLayerStore.getState().removeLayer(OD_MATRIX_LAYER);
        setMatrixError('no pair could be routed on the loaded graph');
        return;
      }
      useAgentLayerStore.getState().addLayer({
        id: OD_MATRIX_LAYER,
        name: `OD matrix (${profile})`,
        color: '#f59f00',
        geojson: odLineCollection(origins, destinations, entries),
        style: { filled: false, stroked: true, lineWidth: 2 },
      });
    } catch (e) {
      setMatrix(null);
      useAgentLayerStore.getState().removeLayer(OD_MATRIX_LAYER);
      setMatrixError(message(e));
    } finally {
      setRunning(false);
    }
  };

  const cells = useMemo(() => {
    const byPair = new Map<string, number>();
    for (const entry of matrix?.entries ?? []) {
      byPair.set(`${entry.originIndex}:${entry.destinationIndex}`, entry.durationS);
    }
    return byPair;
  }, [matrix]);

  const shownOrigins = (matrix?.origins ?? []).slice(0, GRID_PREVIEW);
  const shownDestinations = (matrix?.destinations ?? []).slice(0, GRID_PREVIEW);
  const clipped =
    matrix != null &&
    (matrix.origins.length > shownOrigins.length ||
      matrix.destinations.length > shownDestinations.length);

  return (
    <PanelCard width={340} maxHeight="70vh" testId="travel-time-panel">
      <PanelHeader
        icon={<IconClockHour4 size={16} />}
        title="Travel Time"
        onClose={onClose}
      />

      <ScrollArea flex={1}>
        <Stack gap="xs">
          <SegmentedControl
            size="xs"
            fullWidth
            value={mode}
            onChange={(value) => setMode(value as Mode)}
            data={[
              { value: 'serviceArea', label: 'Service area' },
              { value: 'odMatrix', label: 'OD matrix' },
            ]}
          />

          <Select
            size="xs"
            label="Profile"
            data={TRAVEL_PROFILES.map((p) => ({ value: p, label: p }))}
            value={profile}
            onChange={(value) => setProfile((value as TravelProfile) ?? 'car')}
            allowDeselect={false}
            data-testid="travel-time-profile"
          />

          {mode === 'serviceArea' ? (
            <>
              <Button
                size="xs"
                variant={picking ? 'filled' : 'light'}
                color="violet"
                leftSection={<IconTarget size={14} />}
                onClick={() => setPicking(!picking)}
              >
                {centre ? 'Move centre' : 'Set centre'}
              </Button>

              <Text size="xs" c={picking ? 'violet' : 'dimmed'} data-testid="travel-time-centre">
                {picking
                  ? 'Click the map to place the centre.'
                  : centre
                    ? `Centre ${centre.lat.toFixed(5)}, ${centre.lon.toFixed(5)}`
                    : 'Pick the point to measure travel time from.'}
              </Text>

              <TextInput
                size="xs"
                label="Bands (minutes)"
                value={bands}
                onChange={(e) => setBands(e.currentTarget.value)}
                data-testid="travel-time-bands"
              />

              <Button
                size="xs"
                color="violet"
                fullWidth
                loading={running}
                disabled={!centre || bandMinutes.length === 0}
                onClick={() => void runServiceArea()}
              >
                Draw service area
              </Button>

              {areaError && (
                <Text size="xs" c="red" data-testid="travel-time-area-error">
                  {areaError}
                </Text>
              )}

              {areas.length > 0 && (
                <Group gap={4} data-testid="travel-time-area-result">
                  {[...areas]
                    .sort((a, b) => a.maxSeconds - b.maxSeconds)
                    .map((area) => (
                      <Badge key={area.maxSeconds} size="xs" variant="light" color="blue">
                        {Math.round(area.maxSeconds / 60)} min · {area.reachableNodes} nodes
                      </Badge>
                    ))}
                </Group>
              )}
            </>
          ) : (
            <>
              <Select
                size="xs"
                label="Origins"
                placeholder={pointLayerOptions.length ? 'Pick a point layer' : 'No point layers'}
                data={pointLayerOptions}
                value={originLayerId}
                onChange={setOriginLayerId}
                data-testid="travel-time-origins"
              />
              <Select
                size="xs"
                label="Destinations"
                placeholder={pointLayerOptions.length ? 'Pick a point layer' : 'No point layers'}
                data={pointLayerOptions}
                value={destinationLayerId}
                onChange={setDestinationLayerId}
                data-testid="travel-time-destinations"
              />

              <Button
                size="xs"
                color="violet"
                fullWidth
                leftSection={<IconGrid3x3 size={14} />}
                loading={running}
                disabled={!originLayerId || !destinationLayerId}
                onClick={() => void runOdMatrix()}
              >
                Build matrix
              </Button>

              {matrixError && (
                <Text size="xs" c="red" data-testid="travel-time-matrix-error">
                  {matrixError}
                </Text>
              )}

              {matrix && matrix.entries.length > 0 && (
                <>
                  <Text size="xs" c="dimmed">
                    Minutes by road. The lines on the map join each pair straight, they are not the
                    route the time was measured along.
                  </Text>

                  <ScrollArea type="auto">
                    <Table
                      striped
                      withTableBorder
                      fz="xs"
                      data-testid="travel-time-matrix"
                    >
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th />
                          {shownDestinations.map((_, d) => (
                            <Table.Th key={destinationLabel(d)}>{destinationLabel(d)}</Table.Th>
                          ))}
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {shownOrigins.map((_, o) => (
                          <Table.Tr key={originLabel(o)}>
                            <Table.Th>{originLabel(o)}</Table.Th>
                            {shownDestinations.map((_unused, d) => {
                              const seconds = cells.get(`${o}:${d}`);
                              return (
                                <Table.Td key={destinationLabel(d)}>
                                  {seconds == null ? '—' : (seconds / 60).toFixed(1)}
                                </Table.Td>
                              );
                            })}
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </ScrollArea>

                  {clipped && (
                    <Text size="xs" c="dimmed" data-testid="travel-time-matrix-clipped">
                      Showing {shownOrigins.length} of {matrix.origins.length} origins and{' '}
                      {shownDestinations.length} of {matrix.destinations.length} destinations. The
                      CSV has every pair.
                    </Text>
                  )}

                  <Button
                    size="xs"
                    variant="subtle"
                    color="violet"
                    fullWidth
                    leftSection={<IconDownload size={14} />}
                    onClick={() =>
                      downloadFile(
                        odCsv(matrix.origins, matrix.destinations, matrix.entries),
                        'od-matrix.csv',
                        'text/csv',
                      )
                    }
                  >
                    Download CSV
                  </Button>
                </>
              )}
            </>
          )}
        </Stack>
      </ScrollArea>
    </PanelCard>
  );
}
