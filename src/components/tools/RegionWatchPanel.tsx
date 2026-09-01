import { useCallback, useEffect, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Divider,
  Group,
  NumberInput,
  ScrollArea,
  Select,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import { IconEye, IconTrash } from '@tabler/icons-react';
import { PanelCard, PanelHeader } from '../PanelCard';
import { listLayers, type PlumbLayer } from '../../lib/geoplumb';
import {
  agoraErrorText,
  createWatch,
  deleteWatch,
  listWatchReadings,
  listWatches,
} from '../../live/api';
import { useLiveStore } from '../../live/liveStore';
import { latestReading, useWatchStateStore } from '../../live/watchState';
import {
  DEFAULT_WATCH_INTERVAL_SECONDS,
  MINIMUM_WATCH_INTERVAL_SECONDS,
  type RegionWatch,
  type WatchReadingEntry,
  type WatchReducer,
  type WatchThresholdOp,
} from '../../live/types';
import { drawnFeatureGeometry, useDrawStore, type DrawnFeature } from '../../store/draw';

const REDUCER_CHOICES: { value: WatchReducer; label: string }[] = [
  { value: 'mean', label: 'Mean' },
  { value: 'min', label: 'Minimum' },
  { value: 'max', label: 'Maximum' },
  { value: 'sum', label: 'Sum' },
  { value: 'count', label: 'Pixel count' },
];

const THRESHOLD_CHOICES: { value: WatchThresholdOp; label: string }[] = [
  { value: 'gt', label: 'Above' },
  { value: 'lt', label: 'Below' },
];

/** How far back the readings list asks for when a watch is picked. */
const READINGS_WINDOW_HOURS = 24;

const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;

function drawnPolygons(features: DrawnFeature[]): DrawnFeature[] {
  return features.filter((feature) => feature.type === 'Polygon');
}

function formatTime(at: string): string {
  const parsed = new Date(at);
  return Number.isNaN(parsed.getTime()) ? at : parsed.toLocaleString();
}

function thresholdText(watch: RegionWatch): string {
  if (watch.thresholdOp === null || watch.thresholdValue === null) return 'no alert';
  return `${watch.thresholdOp === 'gt' ? 'above' : 'below'} ${watch.thresholdValue}`;
}

export function RegionWatchPanel({ onClose }: { onClose: () => void }) {
  const guest = useLiveStore((state) => state.guest);
  const documentId = useLiveStore((state) => state.documentId);
  const role = useLiveStore((state) => state.role);
  const canEdit = !guest && documentId !== null && role === 'edit';

  const watches = useWatchStateStore((state) => state.watches);
  const setWatches = useWatchStateStore((state) => state.setWatches);
  const readings = useWatchStateStore((state) => state.readings);
  const drawn = useDrawStore((state) => state.features);
  const polygons = drawnPolygons(drawn);

  const [layers, setLayers] = useState<PlumbLayer[]>([]);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  const [name, setName] = useState('');
  const [layer, setLayer] = useState('');
  const [reducer, setReducer] = useState<WatchReducer>('mean');
  const [intervalSeconds, setIntervalSeconds] = useState<number | string>(
    DEFAULT_WATCH_INTERVAL_SECONDS,
  );
  const [thresholdOp, setThresholdOp] = useState<WatchThresholdOp | null>(null);
  const [thresholdValue, setThresholdValue] = useState<number | string>('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [polygonId, setPolygonId] = useState('');

  const [selectedId, setSelectedId] = useState('');
  const [history, setHistory] = useState<WatchReadingEntry[]>([]);
  const [historyError, setHistoryError] = useState('');

  const refresh = useCallback(async () => {
    // a share link guest holds a session token these routes refuse, and the
    // socket has already sent them every watch on the document
    if (documentId === null || guest) return;
    try {
      setWatches(await listWatches(documentId));
      setError('');
    } catch (failure) {
      setError(agoraErrorText(failure, 'Could not load the watches.'));
    }
  }, [documentId, guest, setWatches]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    listLayers().then(setLayers, () => setLayers([]));
  }, []);

  const region = polygons.find((polygon) => polygon.id === polygonId) ?? polygons.at(-1);

  const missing = (): string => {
    if (documentId === null) return 'Start or join a live map before adding a watch.';
    if (!canEdit) return 'Only an editor of this map can add a watch.';
    if (!region) return 'Draw a polygon with the Draw tool to give the watch a region.';
    return '';
  };
  const blocked = missing();

  const add = async () => {
    if (documentId === null || !region) return;
    setCreating(true);
    setError('');
    try {
      const geometry = drawnFeatureGeometry(region);
      if (geometry.type !== 'Polygon') return;
      await createWatch(documentId, {
        name: name.trim(),
        layer,
        region: geometry,
        reducer,
        intervalSeconds: Number(intervalSeconds),
        ...(thresholdOp !== null && thresholdValue !== ''
          ? { thresholdOp, thresholdValue: Number(thresholdValue) }
          : {}),
        ...(webhookUrl.trim() ? { webhookUrl: webhookUrl.trim() } : {}),
        ...(webhookSecret ? { webhookSecret } : {}),
      });
      setName('');
      setWebhookUrl('');
      setWebhookSecret('');
      await refresh();
    } catch (failure) {
      setError(agoraErrorText(failure, 'Could not create the watch.'));
    } finally {
      setCreating(false);
    }
  };

  const remove = async (watchId: string) => {
    if (documentId === null) return;
    setError('');
    try {
      await deleteWatch(documentId, watchId);
      await refresh();
    } catch (failure) {
      setError(agoraErrorText(failure, 'Could not delete that watch.'));
    }
  };

  const select = async (watchId: string) => {
    setSelectedId(watchId);
    setHistory([]);
    setHistoryError('');
    if (documentId === null) return;
    const since = new Date(
      Date.now() - READINGS_WINDOW_HOURS * MILLISECONDS_PER_HOUR,
    ).toISOString();
    try {
      const entries = await listWatchReadings(documentId, watchId, since);
      setHistory([...entries].reverse());
    } catch (failure) {
      setHistoryError(agoraErrorText(failure, 'Could not load the readings.'));
    }
  };

  const listed = Object.values(watches);
  const canSubmit = blocked === '' && name.trim() !== '' && layer !== '';

  return (
    <PanelCard width={340} maxHeight="70vh" testId="region-watch-panel">
      <PanelHeader
        icon={<IconEye size={16} />}
        title="Region Watch"
        onClose={onClose}
        badge={
          <Badge size="xs" variant="light" color="violet">
            {listed.length}
          </Badge>
        }
      />

      <ScrollArea flex={1}>
        <Stack gap="xs">
          {error && (
            <Text size="xs" c="red" data-testid="watch-error">
              {error}
            </Text>
          )}

          {listed.length === 0 && (
            <Text size="xs" c="dimmed" data-testid="watch-empty">
              {documentId === null
                ? 'No live map, so nothing is being watched.'
                : 'No watches on this map yet.'}
            </Text>
          )}

          {listed.map((watch) => {
            const reading = latestReading(readings, watch.id);
            return (
              <Stack key={watch.id} gap={2} data-testid={`watch-row-${watch.id}`}>
                <Group gap="xs" wrap="nowrap" justify="space-between">
                  <UnstyledButton
                    style={{ minWidth: 0, flex: 1 }}
                    onClick={() => void select(watch.id)}
                  >
                    <Text size="xs" c="white" fw={500} truncate>
                      {watch.name}
                    </Text>
                  </UnstyledButton>
                  {reading?.tripped && (
                    <Badge size="xs" color="red" data-testid={`watch-tripped-${watch.id}`}>
                      Tripped
                    </Badge>
                  )}
                  {canEdit && (
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      color="red"
                      aria-label={`Delete ${watch.name}`}
                      data-testid={`watch-delete-${watch.id}`}
                      onClick={() => void remove(watch.id)}
                    >
                      <IconTrash size={14} />
                    </ActionIcon>
                  )}
                </Group>
                <Text size="xs" c="dimmed">
                  {watch.layer} · {watch.reducer} · every {watch.intervalSeconds}s ·{' '}
                  {thresholdText(watch)}
                </Text>
                <Text size="xs" c="dimmed">
                  {reading
                    ? `${reading.value} at ${formatTime(reading.at)}`
                    : watch.lastRunAt
                      ? `last ran ${formatTime(watch.lastRunAt)}`
                      : 'not run yet'}
                </Text>
                {watch.lastError && (
                  <Text size="xs" c="orange" data-testid={`watch-last-error-${watch.id}`}>
                    {watch.lastError}
                  </Text>
                )}
                {selectedId === watch.id && (
                  <Stack gap={2} pl="xs" data-testid={`watch-readings-${watch.id}`}>
                    {historyError && (
                      <Text size="xs" c="red">
                        {historyError}
                      </Text>
                    )}
                    {!historyError && history.length === 0 && (
                      <Text size="xs" c="dimmed">
                        No readings in the last {READINGS_WINDOW_HOURS} hours.
                      </Text>
                    )}
                    {history.map((entry) => (
                      <Text key={entry.at} size="xs" c="dimmed">
                        {entry.value} · {entry.count} px · {formatTime(entry.at)}
                      </Text>
                    ))}
                  </Stack>
                )}
              </Stack>
            );
          })}

          <Divider label="New watch" labelPosition="left" />

          {blocked ? (
            <Text size="xs" c="dimmed" data-testid="watch-blocked">
              {blocked}
            </Text>
          ) : (
            <Stack gap="xs" data-testid="watch-form">
              <TextInput
                size="xs"
                label="Name"
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
                data-testid="watch-name"
              />
              <Select
                size="xs"
                label="Layer"
                placeholder={layers.length === 0 ? 'No geoplumb layers' : 'Pick a layer'}
                data={layers.map((entry) => entry.name)}
                value={layer || null}
                onChange={(picked) => setLayer(picked ?? '')}
                data-testid="watch-layer"
              />
              <Select
                size="xs"
                label="Reducer"
                data={REDUCER_CHOICES}
                value={reducer}
                onChange={(picked) => setReducer((picked as WatchReducer | null) ?? 'mean')}
                data-testid="watch-reducer"
              />
              <NumberInput
                size="xs"
                label="Every (seconds)"
                min={MINIMUM_WATCH_INTERVAL_SECONDS}
                value={intervalSeconds}
                onChange={setIntervalSeconds}
                data-testid="watch-interval"
              />
              <Group gap="xs" wrap="nowrap" align="flex-end">
                <Select
                  size="xs"
                  flex={1}
                  label="Alert when"
                  placeholder="Never"
                  clearable
                  data={THRESHOLD_CHOICES}
                  value={thresholdOp}
                  onChange={(picked) => setThresholdOp(picked as WatchThresholdOp | null)}
                  data-testid="watch-threshold-op"
                />
                <NumberInput
                  size="xs"
                  flex={1}
                  aria-label="Threshold value"
                  disabled={thresholdOp === null}
                  value={thresholdValue}
                  onChange={setThresholdValue}
                  data-testid="watch-threshold-value"
                />
              </Group>
              <TextInput
                size="xs"
                label="Webhook url"
                placeholder="Optional"
                value={webhookUrl}
                onChange={(event) => setWebhookUrl(event.currentTarget.value)}
                data-testid="watch-webhook-url"
              />
              <TextInput
                size="xs"
                label="Webhook secret"
                placeholder="Optional"
                value={webhookSecret}
                onChange={(event) => setWebhookSecret(event.currentTarget.value)}
                data-testid="watch-webhook-secret"
              />
              <Select
                size="xs"
                label="Region"
                data={polygons.map((polygon, index) => ({
                  value: polygon.id,
                  label: `Polygon ${index + 1} (${polygon.coords.length} points)`,
                }))}
                value={region?.id ?? null}
                onChange={(picked) => setPolygonId(picked ?? '')}
                data-testid="watch-region"
              />
              <Button
                size="xs"
                variant="light"
                color="violet"
                loading={creating}
                disabled={!canSubmit}
                onClick={() => void add()}
                data-testid="watch-create"
              >
                Watch this region
              </Button>
            </Stack>
          )}
        </Stack>
      </ScrollArea>
    </PanelCard>
  );
}
