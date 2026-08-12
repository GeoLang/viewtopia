import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Text,
  Stack,
  Group,
  ActionIcon,
  Button,
  ScrollArea,
  Badge,
  FileButton,
  Progress,
} from '@mantine/core';
import {
  IconPackage,
  IconUpload,
  IconTrash,
  IconRefresh,
  IconWorldUpload,
} from '@tabler/icons-react';
import { Cesium3DTileset } from 'cesium';
import type { Viewer } from 'cesium';
import { PanelCard, PanelHeader } from '../PanelCard';
import { getActiveCesiumViewer } from '../../viewer/registry';
import { getAuthToken } from '../../features/auth/store';
import { noticeRefusal } from '../../lib/apiAuth';
import { useAppStore } from '../../store/app';

const API = '/api/v1';
const POLL_MS = 3000;
const ACCEPT =
  '.las,.laz,.e57,.ply,.tif,.tiff,.hgt,.dt0,.dt1,.dt2,.gltf,.glb,.obj,.fbx,.ifc,.dae,.jpg,.jpeg,.png,.jp2';

type AssetStatus = 'uploading' | 'tiling' | 'ready' | 'error';

interface Asset {
  id: string;
  name: string;
  assetType: string;
  status: AssetStatus;
  sizeBytes: number;
  /** How far its tiling job has got, 0..1. Unset until the job reports. */
  tilingProgress?: number;
}

function authHeaders(base: Record<string, string> = {}): Record<string, string> {
  const token = getAuthToken();
  return token ? { ...base, Authorization: `Bearer ${token}` } : base;
}

function firstLine(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).split('\n')[0];
}

function parseAsset(raw: unknown): Asset | null {
  const a = raw as Record<string, unknown> | null;
  if (!a || typeof a.id !== 'string') return null;
  const status = a.status;
  return {
    id: a.id,
    name: typeof a.name === 'string' && a.name ? a.name : a.id,
    assetType: typeof a.asset_type === 'string' ? a.asset_type : 'unknown',
    status:
      status === 'uploading' || status === 'tiling' || status === 'ready' || status === 'error'
        ? status
        : 'error',
    sizeBytes: typeof a.size_bytes === 'number' ? a.size_bytes : 0,
  };
}

/** The tiling job an upload queued, absent for a type that tiles on demand. */
function jobIdOf(raw: unknown): string | null {
  const id = (raw as Record<string, unknown> | null)?.job_id;
  return typeof id === 'string' ? id : null;
}

/**
 * The job behind an asset this session did not upload, so a tiling row survives
 * a reload. No job is the normal answer for a type that tiles on demand.
 */
async function newestJobId(assetId: string): Promise<string | null> {
  const res = await fetch(`${API}/assets/${assetId}/jobs`, { headers: authHeaders() }).catch(
    () => null,
  );
  if (res) noticeRefusal(res.status);
  if (!res?.ok) return null;
  const jobs = await res.json().catch(() => null);
  const id = (Array.isArray(jobs) ? jobs[0] : null)?.id;
  return typeof id === 'string' ? id : null;
}

/** A tiling job's progress, 0..1, or null when the server sent no number. */
function parseJobProgress(raw: unknown): number | null {
  const progress = (raw as Record<string, unknown> | null)?.progress;
  return typeof progress === 'number' && Number.isFinite(progress) ? progress : null;
}

function formatSize(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(0)} kB`;
  return `${bytes} B`;
}

const STATUS_COLOR: Record<AssetStatus, string> = {
  uploading: 'yellow',
  tiling: 'yellow',
  ready: 'green',
  error: 'red',
};

export function AssetsPanel({ onClose }: { onClose: () => void }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [added, setAdded] = useState<string[]>([]);

  const timers = useRef(new Map<string, ReturnType<typeof setInterval>>());
  const renderer = useAppStore((s) => s.renderer);
  const [viewer, setViewer] = useState<Viewer | null>(null);

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

  const poll = useCallback((id: string, uploadJobId: string | null = null) => {
    if (timers.current.has(id)) return;
    let jobId = uploadJobId;
    let jobLookedUp = uploadJobId !== null;
    const stop = () => {
      const t = timers.current.get(id);
      if (t) clearInterval(t);
      timers.current.delete(id);
    };
    const readProgress = async () => {
      const res = await fetch(`${API}/jobs/${jobId}`, { headers: authHeaders() }).catch(
        () => null,
      );
      if (res) noticeRefusal(res.status);
      if (!res?.ok) return;
      const progress = parseJobProgress(await res.json().catch(() => null));
      if (progress === null) return;
      setAssets((prev) =>
        prev.map((a) => (a.id === id ? { ...a, tilingProgress: progress } : a)),
      );
    };
    const tick = async () => {
      const res = await fetch(`${API}/assets/${id}`, { headers: authHeaders() }).catch(() => null);
      if (res) noticeRefusal(res.status);
      if (!res?.ok) {
        stop();
        return;
      }
      const asset = parseAsset(await res.json().catch(() => null));
      if (!asset) {
        stop();
        return;
      }
      // spread over the previous row: the asset endpoint knows nothing of the
      // job, so a plain replace would drop the progress read from it
      setAssets((prev) => prev.map((a) => (a.id === asset.id ? { ...a, ...asset } : a)));
      if (asset.status === 'ready' || asset.status === 'error') {
        stop();
        return;
      }
      if (!jobLookedUp) {
        jobLookedUp = true;
        jobId = await newestJobId(id);
      }
      if (jobId) await readProgress();
    };
    timers.current.set(
      id,
      setInterval(() => void tick(), POLL_MS),
    );
  }, []);

  const refresh = useCallback(async () => {
    // without a token every call can only answer 401, so we never send one
    if (!getAuthToken()) {
      setNeedsSignIn(true);
      setAssets([]);
      return;
    }
    setNeedsSignIn(false);
    setLoading(true);
    setError(null);
    const res = await fetch(`${API}/assets`, { headers: authHeaders() }).catch(() => null);
    setLoading(false);
    if (res) noticeRefusal(res.status);
    if (!res) {
      setError('The asset service is unreachable.');
      return;
    }
    if (res.status === 401) {
      setNeedsSignIn(true);
      return;
    }
    if (!res.ok) {
      setError(`Asset list failed with HTTP ${res.status}`);
      return;
    }
    const body = await res.json().catch(() => null);
    const list = (Array.isArray(body) ? body : []).flatMap((raw) => {
      const a = parseAsset(raw);
      return a ? [a] : [];
    });
    setAssets(list);
    for (const a of list) {
      if (a.status === 'uploading' || a.status === 'tiling') poll(a.id);
    }
  }, [poll]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const running = timers.current;
    return () => {
      for (const t of running.values()) clearInterval(t);
      running.clear();
    };
  }, []);

  const upload = (file: File | null) => {
    if (!file) return;
    setError(null);
    setUploadPct(0);
    const form = new FormData();
    form.append('name', file.name);
    form.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API}/assets`);
    const token = getAuthToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setUploadPct(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      setUploadPct(null);
      noticeRefusal(xhr.status);
      if (xhr.status === 401) {
        setNeedsSignIn(true);
        return;
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        setError(`Upload failed with HTTP ${xhr.status}`);
        return;
      }
      let asset: Asset | null = null;
      let jobId: string | null = null;
      try {
        const body: unknown = JSON.parse(xhr.responseText);
        asset = parseAsset(body);
        jobId = jobIdOf(body);
      } catch {
        asset = null;
      }
      if (!asset) {
        setError('The server returned an asset we could not read.');
        return;
      }
      const created = asset;
      setAssets((prev) => [...prev.filter((a) => a.id !== created.id), created]);
      if (created.status !== 'ready' && created.status !== 'error') poll(created.id, jobId);
    };
    xhr.onerror = () => {
      setUploadPct(null);
      setError('Upload failed. The asset service is unreachable.');
    };
    xhr.send(form);
  };

  const remove = async (id: string) => {
    setConfirmId(null);
    setError(null);
    const res = await fetch(`${API}/assets/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    }).catch(() => null);
    if (res) noticeRefusal(res.status);
    if (!res?.ok) {
      setError(res ? `Delete failed with HTTP ${res.status}` : 'The asset service is unreachable.');
      return;
    }
    const t = timers.current.get(id);
    if (t) clearInterval(t);
    timers.current.delete(id);
    setAssets((prev) => prev.filter((a) => a.id !== id));
  };

  // tileset.json and its tiles are public reads on the server, so no token here
  const addToGlobe = async (asset: Asset) => {
    if (!viewer) return;
    setError(null);
    try {
      const tileset = await Cesium3DTileset.fromUrl(`${API}/assets/${asset.id}/tileset.json`);
      viewer.scene.primitives.add(tileset);
      setAdded((prev) => [...prev, asset.id]);
      await viewer.flyTo(tileset);
    } catch (e) {
      setError(`${asset.name} failed to load: ${firstLine(e)}`);
    }
  };

  return (
    <PanelCard width={320} maxHeight="60vh">
      <PanelHeader
        icon={<IconPackage size={16} />}
        title="Assets"
        onClose={onClose}
        badge={
          <Badge size="xs" variant="light" color="violet">
            {assets.length}
          </Badge>
        }
        actions={
          <ActionIcon
            size="sm"
            variant="subtle"
            color="gray"
            aria-label="Refresh assets"
            loading={loading}
            onClick={() => void refresh()}
          >
            <IconRefresh size={14} />
          </ActionIcon>
        }
      />

      {needsSignIn ? (
        <Text size="xs" c="dimmed" py="lg" ta="center" data-testid="assets-signin">
          Sign in to browse and upload assets.
        </Text>
      ) : (
        <>
          <FileButton onChange={upload} accept={ACCEPT}>
            {(props) => (
              <Button
                size="xs"
                variant="subtle"
                color="violet"
                leftSection={<IconUpload size={14} />}
                mb="xs"
                fullWidth
                loading={uploadPct !== null}
                {...props}
              >
                Upload and tile
              </Button>
            )}
          </FileButton>

          {uploadPct !== null && (
            <Progress
              size="xs"
              mb="xs"
              color="violet"
              value={uploadPct}
              data-testid="assets-upload-progress"
            />
          )}

          {error && (
            <Text size="xs" c="red" mb="xs" data-testid="assets-error">
              {error}
            </Text>
          )}

          <ScrollArea flex={1}>
            <Stack gap={4}>
              {assets.length === 0 ? (
                <Text size="xs" c="dimmed" ta="center" py="xl">
                  No assets. Upload a file to get started.
                </Text>
              ) : (
                assets.map((asset) => (
                  <Group
                    key={asset.id}
                    justify="space-between"
                    wrap="nowrap"
                    p="xs"
                    data-testid={`assets-row-${asset.id}`}
                    style={{ background: 'var(--mantine-color-dark-6)', borderRadius: 4 }}
                  >
                    <Stack gap={2} style={{ minWidth: 0 }}>
                      <Text size="xs" c="white" fw={500} truncate>
                        {asset.name}
                      </Text>
                      <Group gap={4}>
                        <Badge size="xs" variant="light">
                          {asset.assetType}
                        </Badge>
                        <Badge size="xs" variant="light" color={STATUS_COLOR[asset.status]}>
                          {asset.status}
                        </Badge>
                        <Text size="xs" c="dimmed">
                          {formatSize(asset.sizeBytes)}
                        </Text>
                      </Group>
                      {asset.tilingProgress !== undefined && asset.status === 'tiling' && (
                        <Progress
                          size="xs"
                          color="violet"
                          value={Math.round(asset.tilingProgress * 100)}
                          aria-label={`Tiling ${asset.name}`}
                          data-testid={`assets-tiling-${asset.id}`}
                        />
                      )}
                    </Stack>
                    {confirmId === asset.id ? (
                      <Group gap={4} wrap="nowrap">
                        <Button
                          size="compact-xs"
                          color="red"
                          onClick={() => void remove(asset.id)}
                        >
                          Delete
                        </Button>
                        <Button
                          size="compact-xs"
                          variant="default"
                          onClick={() => setConfirmId(null)}
                        >
                          Cancel
                        </Button>
                      </Group>
                    ) : (
                      <Group gap={4} wrap="nowrap">
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          color="violet"
                          aria-label={`Add ${asset.name} to globe`}
                          disabled={
                            asset.status !== 'ready' || !viewer || added.includes(asset.id)
                          }
                          onClick={() => void addToGlobe(asset)}
                        >
                          <IconWorldUpload size={14} />
                        </ActionIcon>
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          color="red"
                          aria-label={`Delete ${asset.name}`}
                          onClick={() => setConfirmId(asset.id)}
                        >
                          <IconTrash size={14} />
                        </ActionIcon>
                      </Group>
                    )}
                  </Group>
                ))
              )}
            </Stack>
          </ScrollArea>
        </>
      )}
    </PanelCard>
  );
}
