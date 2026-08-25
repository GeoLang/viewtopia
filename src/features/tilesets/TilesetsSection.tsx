import { useEffect, useState } from 'react';
import { ActionIcon, Badge, Button, Code, Group, Paper, Stack, Text } from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useOgcLayerStore } from '../../store/ogcLayers';
import { useAuthStore } from '../auth/store';
import { tilesetLayerId, useTilesetStore } from './store';
import { formatBytes, type Tileset, type TilesetStatus } from './api';
import { LayerLoadError } from '../../components/layers/LayerLoadError';

const STATUS_COLOR: Record<TilesetStatus, string> = {
  building: 'yellow',
  ready: 'green',
  failed: 'red',
};

/** An archive is a snapshot, so when it was built is what dates the data in it. */
function builtOn(tileset: Tileset): string {
  if (!tileset.built_at) return 'not built';
  return `built ${new Date(tileset.built_at).toLocaleString()}`;
}

function TilesetRow({ tileset }: { tileset: Tileset }) {
  const [confirming, setConfirming] = useState(false);
  const [showError, setShowError] = useState(false);
  const [busy, setBusy] = useState(false);
  const drawn = useOgcLayerStore((s) => s.layers.some((l) => l.tileset?.id === tileset.id));
  const removeLayer = useOgcLayerStore((s) => s.removeLayer);
  const addLayer = useTilesetStore((s) => s.addLayer);
  const remove = useTilesetStore((s) => s.remove);

  const add = async () => {
    setBusy(true);
    try {
      await addLayer(tileset);
    } catch (err) {
      notifications.show({
        title: 'Could not add the tileset',
        message: err instanceof Error ? err.message : 'the tileset does not serve tiles',
        color: 'red',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Paper
      p="xs"
      radius="sm"
      data-testid="tileset-row"
      style={{
        background: 'var(--mantine-color-dark-6)',
        border: '1px solid var(--mantine-color-dark-5)',
      }}
    >
      <Group justify="space-between" wrap="nowrap">
        <Stack gap={0} style={{ minWidth: 0 }}>
          <Text size="xs" c="white" lineClamp={1}>
            {tileset.name}
          </Text>
          <Text size="xs" c="dimmed">
            {builtOn(tileset)}
            {tileset.status === 'ready' && ` · ${formatBytes(tileset.size_bytes)}`}
          </Text>
        </Stack>
        <Group gap={4} wrap="nowrap">
          <LayerLoadError layerId={tilesetLayerId(tileset.id)} layerName={tileset.name} />
          <Badge size="xs" variant="light" color={STATUS_COLOR[tileset.status]}>
            {tileset.status}
          </Badge>
        </Group>
      </Group>

      {tileset.status === 'failed' && tileset.error && (
        <>
          <Button
            size="compact-xs"
            variant="subtle"
            color="gray"
            mt={4}
            onClick={() => setShowError(!showError)}
          >
            {showError ? 'Hide the build output' : 'Why it failed'}
          </Button>
          {showError && (
            <Code
              block
              mt={4}
              style={{ maxHeight: 160, overflow: 'auto', whiteSpace: 'pre-wrap' }}
              data-testid="tileset-error"
            >
              {tileset.error}
            </Code>
          )}
        </>
      )}

      <Group gap="xs" mt={4}>
        {tileset.status === 'ready' &&
          (drawn ? (
            <Button
              size="compact-xs"
              variant="subtle"
              color="gray"
              onClick={() => removeLayer(tilesetLayerId(tileset.id))}
            >
              Remove layer
            </Button>
          ) : (
            <Button
              size="compact-xs"
              variant="subtle"
              color="violet"
              loading={busy}
              data-testid="tileset-add-layer"
              onClick={() => void add()}
            >
              Add as layer
            </Button>
          ))}
        {confirming ? (
          <Group gap={4}>
            <Button
              size="compact-xs"
              color="red"
              data-testid="tileset-delete-confirm"
              onClick={() => void remove(tileset.id)}
            >
              Delete for everyone
            </Button>
            <Button
              size="compact-xs"
              variant="subtle"
              color="gray"
              onClick={() => setConfirming(false)}
            >
              Keep
            </Button>
          </Group>
        ) : (
          <Button
            size="compact-xs"
            variant="subtle"
            color="red"
            data-testid="tileset-delete"
            onClick={() => setConfirming(true)}
          >
            Delete
          </Button>
        )}
      </Group>
    </Paper>
  );
}

/**
 * The archives tiletopia holds, listed where the layers are. Each one is a
 * snapshot of the file it was built from, so the date it was built is the date
 * of the data on screen.
 */
export function TilesetsSection() {
  const tilesets = useTilesetStore((s) => s.tilesets);
  const listing = useTilesetStore((s) => s.listing);
  const listError = useTilesetStore((s) => s.listError);
  const refresh = useTilesetStore((s) => s.refresh);
  // every tileset route needs the platform bearer, so a signed-out viewer has
  // nothing to list and asking would only be a 401
  const signedIn = useAuthStore((s) => !!s.token);

  useEffect(() => {
    if (signedIn) void refresh();
  }, [refresh, signedIn]);

  if (!signedIn) return null;

  return (
    <Stack gap={4} mt="xs" data-testid="tilesets-section">
      <Group justify="space-between">
        <Text size="xs" c="dimmed" fw={600}>
          Server tilesets ({tilesets.length})
        </Text>
        <ActionIcon
          size="sm"
          variant="subtle"
          color="gray"
          aria-label="Refresh tilesets"
          loading={listing}
          onClick={() => void refresh()}
        >
          <IconRefresh size={14} />
        </ActionIcon>
      </Group>
      {listError && (
        <Text size="xs" c="red" data-testid="tilesets-error">
          {listError}
        </Text>
      )}
      {!listError && tilesets.length === 0 && (
        <Text size="xs" c="dimmed">
          No tilesets built. Import a large vector file to build one.
        </Text>
      )}
      {tilesets.map((tileset) => (
        <TilesetRow key={tileset.id} tileset={tileset} />
      ))}
      {tilesets.length > 0 && (
        <Text size="xs" c="dimmed">
          Drawn by the MapLibre renderer only.
        </Text>
      )}
    </Stack>
  );
}
