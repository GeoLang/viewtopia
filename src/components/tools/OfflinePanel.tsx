import { useCallback, useEffect, useState } from 'react';
import {
  Text,
  Stack,
  Group,
  ActionIcon,
  Button,
  Badge,
  Progress,
  TextInput,
} from '@mantine/core';
import { IconDeviceFloppy, IconDownload, IconTrash } from '@tabler/icons-react';
import { PanelCard, PanelHeader } from '../PanelCard';
import { cacheTilesForArea, countTilesForArea, evictTilesForArea } from '../../offline/cache';
import { cachedRegions, type CachedRegion } from '../../offline/db';
import { getViewBounds } from '../../lib/viewBounds';
import { getSharedCamera } from '../../hooks/sharedCamera';
import { isVectorBasemap, rasterTiles } from '../../hooks/basemapTiles';
import { useAppStore } from '../../store/app';

/** a full world view at any zoom is far past this, so the cap has to bite early */
const MAX_TILES = 2000;
/** levels below the current one, so a cached area stays useful when zooming in */
const ZOOM_DEPTH = 2;
const MAX_ZOOM = 19;

function megabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

export function OfflinePanel({ onClose }: { onClose: () => void }) {
  const [caching, setCaching] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [name, setName] = useState('');
  const [regions, setRegions] = useState<CachedRegion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const basemap = useAppStore((s) => s.basemap);
  const customBasemap = useAppStore((s) => s.customBasemap);

  const load = useCallback(async () => {
    try {
      const all = await cachedRegions.getAll();
      setRegions(all.sort((a, b) => b.createdAt - a.createdAt));
    } catch {
      setError('Cannot read the offline store');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const tile = rasterTiles(basemap, customBasemap);

  const handleCache = async () => {
    if (!tile) return;
    const view = getViewBounds();
    const bounds = { west: view.west, south: view.south, east: view.east, north: view.north };
    const min = Math.max(0, Math.min(MAX_ZOOM, Math.round(getSharedCamera().zoom)));
    const zoomRange = { min, max: Math.min(MAX_ZOOM, min + ZOOM_DEPTH) };
    const tiles = countTilesForArea(bounds, zoomRange);

    setError(null);
    if (tiles > MAX_TILES) {
      setError(`This view needs ${tiles} tiles, over the ${MAX_TILES} limit. Zoom in first.`);
      return;
    }

    setCaching(true);
    setDone(0);
    setTotal(tiles);
    try {
      const result = await cacheTilesForArea(tile.url, bounds, zoomRange, (d, t) => {
        setDone(d);
        setTotal(t);
      });
      await cachedRegions.put({
        id: crypto.randomUUID(),
        name:
          name.trim() ||
          `${view.centerLat.toFixed(2)}, ${view.centerLng.toFixed(2)} z${zoomRange.min}-${zoomRange.max}`,
        tileUrlTemplate: tile.url,
        bounds,
        minZoom: zoomRange.min,
        maxZoom: zoomRange.max,
        tiles: result.cached,
        bytes: result.bytes,
        createdAt: Date.now(),
      });
      setName('');
      await load();
      if (result.cached < result.total) {
        setError(`${result.total - result.cached} of ${result.total} tiles failed to download`);
      }
    } catch {
      setError('Caching failed');
    } finally {
      setCaching(false);
    }
  };

  const handleDelete = async (region: CachedRegion) => {
    try {
      await evictTilesForArea(region.tileUrlTemplate, region.bounds, {
        min: region.minZoom,
        max: region.maxZoom,
      });
      await cachedRegions.remove(region.id);
      await load();
    } catch {
      setError('Delete failed');
    }
  };

  return (
    <PanelCard width={280}>
      <PanelHeader
        icon={<IconDeviceFloppy size={16} />}
        title="Offline Cache"
        onClose={onClose}
      />

      <Stack gap="xs">
        <Text size="xs" c="dimmed">
          Cache the current view area for offline use.
        </Text>

        <TextInput
          size="xs"
          placeholder="Region name"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          disabled={caching}
        />

        {caching && (
          <Progress value={total ? (done / total) * 100 : 0} color="violet" size="sm" animated />
        )}

        <Button
          size="xs"
          variant="filled"
          color="violet"
          leftSection={<IconDownload size={14} />}
          onClick={handleCache}
          disabled={caching || !tile}
          fullWidth
        >
          {caching ? `Caching... ${done}/${total}` : 'Cache Current View'}
        </Button>

        {!tile && (
          <Text size="xs" c="dimmed" data-testid="offline-local-notice">
            A local archive is already on disk, so there is nothing to download.
          </Text>
        )}

        {tile && isVectorBasemap(basemap) && (
          <Text size="xs" c="dimmed" data-testid="offline-raster-notice">
            Vector basemap, so the closest raster tiles are cached instead.
          </Text>
        )}

        {error && (
          <Text size="xs" c="red" data-testid="offline-error">
            {error}
          </Text>
        )}

        {regions.length > 0 ? (
          regions.map((r) => (
            <Group key={r.id} justify="space-between" wrap="nowrap">
              <Text size="xs" c="white" truncate>
                {r.name}
              </Text>
              <Group gap={4} wrap="nowrap">
                <Badge size="xs" variant="light">{r.tiles} tiles</Badge>
                <Badge size="xs" variant="light">{megabytes(r.bytes)}</Badge>
                <ActionIcon
                  size="xs"
                  variant="subtle"
                  color="red"
                  aria-label={`Delete ${r.name}`}
                  onClick={() => handleDelete(r)}
                >
                  <IconTrash size={12} />
                </ActionIcon>
              </Group>
            </Group>
          ))
        ) : (
          <Text size="xs" c="dimmed" ta="center" py="xs">
            No cached regions
          </Text>
        )}
      </Stack>
    </PanelCard>
  );
}
