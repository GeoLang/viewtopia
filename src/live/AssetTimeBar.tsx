import { useEffect, useState } from 'react';
import { Box, Button, Group, Select, Slider, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { agoraErrorText } from './api';
import { showAssetsAt, showLiveAssets } from './assetHistory';
import { useAssetStateStore } from './assetState';
import { useLiveStore } from './liveStore';
import { ASSET_RULE_ID } from './types';

const HOUR_SECONDS = 3600;
const DAY_SECONDS = 24 * HOUR_SECONDS;

const WINDOW_CHOICES = [
  { value: String(HOUR_SECONDS), label: '1h' },
  { value: String(6 * HOUR_SECONDS), label: '6h' },
  { value: String(DAY_SECONDS), label: '24h' },
  { value: String(7 * DAY_SECONDS), label: '7d' },
  { value: String(30 * DAY_SECONDS), label: '30d' },
];

const DEFAULT_WINDOW_SECONDS = String(HOUR_SECONDS);

/** How long a drag or a keystroke settles before it asks agora. */
const REQUEST_DEBOUNCE_MS = 200;

const MILLISECONDS_PER_SECOND = 1000;

function toSeconds(milliseconds: number): number {
  return Math.round(milliseconds / MILLISECONDS_PER_SECOND);
}

/** An ISO string, or a datetime the browser reads as local time, as an instant. */
function parseMoment(text: string): number | null {
  const parsed = new Date(text.trim());
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
}

/**
 * The scrubber over the readings table: it asks agora for every asset's state at
 * one past moment and hands it to the asset store, which the map colours and the
 * inspector read instead of the live feed until Live is pressed.
 */
export function AssetTimeBar() {
  const documentId = useLiveStore((state) => state.documentId);
  const rule = useLiveStore((state) => state.document.assets[ASSET_RULE_ID]);
  const historyAt = useAssetStateStore((state) => state.historyAt);

  const [windowSeconds, setWindowSeconds] = useState(DEFAULT_WINDOW_SECONDS);
  const [windowEndMs, setWindowEndMs] = useState(() => Date.now());
  const [requestedMs, setRequestedMs] = useState<number | null>(null);
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (requestedMs === null || documentId === null) return;
    const at = new Date(requestedMs).toISOString();
    const timer = setTimeout(() => {
      void showAssetsAt(documentId, at).catch((failure: unknown) => {
        notifications.show({
          title: 'Asset history failed',
          message: agoraErrorText(failure, 'Could not read that moment.'),
          color: 'red',
        });
      });
    }, REQUEST_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [documentId, requestedMs]);

  if (documentId === null || !rule) return null;

  const windowStartMs = windowEndMs - Number(windowSeconds) * MILLISECONDS_PER_SECOND;

  const goLive = () => {
    setRequestedMs(null);
    setTyped('');
    setWindowEndMs(Date.now());
    showLiveAssets();
  };

  const chooseWindow = (choice: string | null) => {
    if (choice === null) return;
    setWindowSeconds(choice);
    setWindowEndMs(Date.now());
  };

  const typeMoment = (text: string) => {
    setTyped(text);
    const moment = parseMoment(text);
    if (moment !== null) setRequestedMs(moment);
  };

  return (
    <Box
      data-testid="asset-time-bar"
      style={{
        position: 'absolute',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'min(680px, calc(100% - 140px))',
        background: 'rgba(13, 17, 23, 0.9)',
        border: '1px solid var(--mantine-color-dark-5)',
        borderRadius: 6,
        padding: '6px 12px',
        zIndex: 200,
      }}
    >
      <Group gap="xs" wrap="nowrap">
        <Select
          data-testid="asset-time-window"
          aria-label="History window"
          size="xs"
          w={80}
          data={WINDOW_CHOICES}
          value={windowSeconds}
          onChange={chooseWindow}
          allowDeselect={false}
        />
        <Slider
          data-testid="asset-time-slider"
          style={{ flex: 1 }}
          size="sm"
          min={toSeconds(windowStartMs)}
          max={toSeconds(windowEndMs)}
          value={toSeconds(requestedMs ?? windowEndMs)}
          onChange={(value) => setRequestedMs(value * MILLISECONDS_PER_SECOND)}
          label={(value) => new Date(value * MILLISECONDS_PER_SECOND).toLocaleTimeString()}
        />
        <TextInput
          data-testid="asset-time-input"
          aria-label="Show this moment"
          size="xs"
          w={190}
          placeholder="2026-08-25T10:00"
          value={typed}
          onChange={(event) => typeMoment(event.currentTarget.value)}
        />
        <Button data-testid="asset-time-live" size="xs" variant="light" onClick={goLive}>
          Live
        </Button>
        <Text data-testid="asset-time-label" size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
          {historyAt === null ? 'Live' : new Date(historyAt).toLocaleString()}
        </Text>
      </Group>
    </Box>
  );
}
