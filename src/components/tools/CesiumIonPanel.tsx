import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  TextInput,
  Button,
  Badge,
  ScrollArea,
} from '@mantine/core';
import { IconSatellite, IconX, IconPlus, IconTrash } from '@tabler/icons-react';
import {
  Cesium3DTileset,
  CesiumTerrainProvider,
  EllipsoidTerrainProvider,
  Ion,
  IonImageryProvider,
} from 'cesium';
import type { ImageryLayer, Viewer } from 'cesium';
import { getActiveCesiumViewer } from '../../viewer/registry';
import { useAppStore } from '../../store/app';

const ION_ASSETS_URL = 'https://api.cesium.com/v1/assets';

interface IonAsset {
  id: number;
  name: string;
  type: string;
}

// the three ion asset types cesium can attach straight to a scene
const ADDABLE = new Set(['3DTILES', 'IMAGERY', 'TERRAIN']);

type Added =
  | { kind: '3DTILES'; tileset: Cesium3DTileset }
  | { kind: 'IMAGERY'; layer: ImageryLayer }
  | { kind: 'TERRAIN' };

function firstLine(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).split('\n')[0];
}

function parseAssets(body: unknown): IonAsset[] {
  const items = (body as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return [];
  return items.flatMap((raw): IonAsset[] => {
    const a = raw as { id?: unknown; name?: unknown; type?: unknown } | null;
    if (typeof a?.id !== 'number') return [];
    return [
      {
        id: a.id,
        name: typeof a.name === 'string' && a.name ? a.name : `Asset ${a.id}`,
        type: typeof a.type === 'string' ? a.type.toUpperCase() : 'UNKNOWN',
      },
    ];
  });
}

async function fetchIonAssets(
  token: string,
): Promise<{ assets: IonAsset[] } | { error: string }> {
  const res = await fetch(ION_ASSETS_URL, {
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => null);
  if (!res) return { error: 'Cesium Ion is unreachable.' };
  if (res.status === 401 || res.status === 403) return { error: 'Cesium Ion rejected that token.' };
  if (!res.ok) return { error: `Cesium Ion returned HTTP ${res.status}` };
  const body = await res.json().catch(() => null);
  return { assets: parseAssets(body) };
}

export function CesiumIonPanel({ onClose }: { onClose: () => void }) {
  const renderer = useAppStore((s) => s.renderer);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [token, setToken] = useState(() => useAppStore.getState().settings.cesiumIonToken);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assets, setAssets] = useState<IonAsset[]>([]);
  const added = useRef(new Map<number, Added>());
  const [addedIds, setAddedIds] = useState<number[]>([]);

  useEffect(() => {
    setViewer(getActiveCesiumViewer());
    if (renderer !== 'cesium') return;
    const timer = setInterval(() => {
      const v = getActiveCesiumViewer();
      if (v) {
        setViewer(v);
        clearInterval(timer);
      }
    }, 100);
    return () => clearInterval(timer);
  }, [renderer]);

  const connect = useCallback(async (raw: string) => {
    const t = raw.trim();
    if (!t) return;
    setBusy(true);
    setError(null);
    const result = await fetchIonAssets(t);
    setBusy(false);
    if ('error' in result) {
      setConnected(false);
      setError(result.error);
      return;
    }
    Ion.defaultAccessToken = t;
    useAppStore.getState().updateSettings({ cesiumIonToken: t });
    setAssets(result.assets);
    setConnected(true);
  }, []);

  useEffect(() => {
    const saved = useAppStore.getState().settings.cesiumIonToken;
    if (saved) void connect(saved);
  }, [connect]);

  const addAsset = async (asset: IonAsset) => {
    if (!viewer || added.current.has(asset.id)) return;
    setError(null);
    try {
      if (asset.type === '3DTILES') {
        const tileset = await Cesium3DTileset.fromIonAssetId(asset.id);
        viewer.scene.primitives.add(tileset);
        added.current.set(asset.id, { kind: '3DTILES', tileset });
        await viewer.flyTo(tileset);
      } else if (asset.type === 'IMAGERY') {
        const provider = await IonImageryProvider.fromAssetId(asset.id);
        added.current.set(asset.id, {
          kind: 'IMAGERY',
          layer: viewer.imageryLayers.addImageryProvider(provider),
        });
      } else {
        viewer.terrainProvider = await CesiumTerrainProvider.fromIonAssetId(asset.id);
        added.current.set(asset.id, { kind: 'TERRAIN' });
      }
      setAddedIds([...added.current.keys()]);
    } catch (e) {
      setError(`${asset.name} failed to load: ${firstLine(e)}`);
    }
  };

  const removeAsset = (id: number) => {
    const entry = added.current.get(id);
    if (!entry || !viewer) return;
    if (entry.kind === '3DTILES') viewer.scene.primitives.remove(entry.tileset);
    else if (entry.kind === 'IMAGERY') {
      if (viewer.imageryLayers.contains(entry.layer)) {
        viewer.imageryLayers.remove(entry.layer, true);
      }
    } else viewer.terrainProvider = new EllipsoidTerrainProvider();
    added.current.delete(id);
    setAddedIds([...added.current.keys()]);
  };

  const shell = (children: ReactNode) => (
    <Paper
      shadow="xl"
      radius="md"
      p="sm"
      style={{
        position: 'absolute',
        top: 60,
        right: 16,
        width: 300,
        maxHeight: '60vh',
        background: '#161b22',
        border: '1px solid #30363d',
        zIndex: 300,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconSatellite size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Cesium Ion
          </Text>
          {connected && (
            <Badge size="xs" color="green">
              Connected
            </Badge>
          )}
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>
      {children}
    </Paper>
  );

  if (!viewer) {
    return shell(
      <Text size="xs" c="dimmed" data-testid="ion-no-cesium">
        Cesium Ion needs the Cesium globe. Switch to the CesiumJS renderer.
      </Text>,
    );
  }

  return shell(
    <Stack gap="xs" style={{ minHeight: 0 }}>
      <TextInput
        size="xs"
        label="Access Token"
        placeholder="Paste your Cesium Ion token…"
        value={token}
        onChange={(e) => setToken(e.currentTarget.value)}
        type="password"
        styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
      />
      <Button
        size="xs"
        variant="filled"
        color="violet"
        onClick={() => void connect(token)}
        loading={busy}
        disabled={!token.trim()}
        fullWidth
      >
        {connected ? 'Refresh' : 'Connect'}
      </Button>

      {error && (
        <Text size="xs" c="red" data-testid="ion-error">
          {error}
        </Text>
      )}

      {connected && (
        <ScrollArea style={{ minHeight: 0 }}>
          {assets.length > 0 ? (
            assets.map((asset) => (
              <Group
                key={asset.id}
                justify="space-between"
                wrap="nowrap"
                p="xs"
                data-testid={`ion-asset-${asset.id}`}
                style={{ background: '#21262d', borderRadius: 4, marginBottom: 4 }}
              >
                <Stack gap={2} style={{ minWidth: 0 }}>
                  <Text size="xs" c="white" truncate>
                    {asset.name}
                  </Text>
                  <Group gap={4}>
                    <Badge size="xs" variant="light">
                      {asset.type}
                    </Badge>
                    <Text size="xs" c="dimmed">
                      {asset.id}
                    </Text>
                  </Group>
                </Stack>
                {addedIds.includes(asset.id) ? (
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    color="red"
                    aria-label={`Remove ${asset.name}`}
                    onClick={() => removeAsset(asset.id)}
                  >
                    <IconTrash size={14} />
                  </ActionIcon>
                ) : (
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    color="violet"
                    aria-label={`Add ${asset.name} to scene`}
                    disabled={!ADDABLE.has(asset.type)}
                    onClick={() => void addAsset(asset)}
                  >
                    <IconPlus size={14} />
                  </ActionIcon>
                )}
              </Group>
            ))
          ) : (
            <Text size="xs" c="dimmed" ta="center" py="md">
              No assets found. Upload data to Cesium Ion to see it here.
            </Text>
          )}
        </ScrollArea>
      )}
    </Stack>,
  );
}
