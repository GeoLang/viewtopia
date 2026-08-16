import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Text,
  Stack,
  Group,
  Anchor,
  Badge,
  Button,
  ScrollArea,
  Select,
} from '@mantine/core';
import { IconDownload, IconPrinter } from '@tabler/icons-react';
import { PanelCard, PanelHeader } from '../PanelCard';
import { getAuthToken } from '../../features/auth/store';
import { noticeRefusal } from '../../lib/apiAuth';

// nginx /api/ is ptolemy; /tiles/ rewrites to tiletopia /api/
const API = '/tiles/v1';
const POLL_MS = 3000;

interface FormatOption {
  id: string;
  name: string;
}

interface ReadyAsset {
  id: string;
  name: string;
}

type JobState = 'queued' | 'running' | 'ready' | 'failed';

interface ExportJob {
  id: string;
  state: JobState;
  detail: string;
}

function authHeaders(base: Record<string, string> = {}): Record<string, string> {
  const token = getAuthToken();
  return token ? { ...base, Authorization: `Bearer ${token}` } : base;
}

export function downloadUrl(jobId: string): string {
  return `${API}/exports/download/${jobId}`;
}

/**
 * The server writes a settled status as a bare string and a failure as
 * `{ "Failed": reason }`, so both shapes are read here.
 */
function parseJob(raw: unknown): ExportJob | null {
  const j = raw as Record<string, unknown> | null;
  if (!j || typeof j.id !== 'string') return null;
  const status = j.status;
  if (status === 'Queued') return { id: j.id, state: 'queued', detail: 'queued' };
  if (status === 'Processing') return { id: j.id, state: 'running', detail: 'encoding' };
  if (status === 'Ready') return { id: j.id, state: 'ready', detail: 'ready' };
  const reason = (status as Record<string, unknown> | null)?.Failed;
  return { id: j.id, state: 'failed', detail: typeof reason === 'string' ? reason : 'failed' };
}

const STATE_COLOR: Record<JobState, string> = {
  queued: 'yellow',
  running: 'yellow',
  ready: 'green',
  failed: 'red',
};

export function Export3DPanel({ onClose }: { onClose: () => void }) {
  const [assets, setAssets] = useState<ReadyAsset[]>([]);
  const [formats, setFormats] = useState<FormatOption[]>([]);
  const [assetId, setAssetId] = useState<string | null>(null);
  const [format, setFormat] = useState<string | null>(null);
  const [jobs, setJobs] = useState<ExportJob[]>([]);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);

  const timers = useRef(new Map<string, ReturnType<typeof setInterval>>());

  const poll = useCallback((id: string) => {
    if (timers.current.has(id)) return;
    const stop = () => {
      const t = timers.current.get(id);
      if (t) clearInterval(t);
      timers.current.delete(id);
    };
    const tick = async () => {
      const res = await fetch(`${API}/exports/${id}`, { headers: authHeaders() }).catch(() => null);
      if (res) noticeRefusal(res.status);
      if (!res?.ok) {
        stop();
        return;
      }
      const job = parseJob(await res.json().catch(() => null));
      if (!job) {
        stop();
        return;
      }
      setJobs((prev) => prev.map((j) => (j.id === job.id ? job : j)));
      if (job.state === 'ready' || job.state === 'failed') stop();
    };
    timers.current.set(
      id,
      setInterval(() => void tick(), POLL_MS),
    );
  }, []);

  const load = useCallback(async () => {
    // without a token every call can only answer 401, so we never send one
    if (!getAuthToken()) {
      setNeedsSignIn(true);
      return;
    }
    setNeedsSignIn(false);
    setError(null);

    const [assetRes, formatRes] = await Promise.all([
      fetch(`${API}/assets`, { headers: authHeaders() }).catch(() => null),
      fetch(`${API}/exports/formats`, { headers: authHeaders() }).catch(() => null),
    ]);

    if (!assetRes || !formatRes) {
      setError('The export service is unreachable.');
      return;
    }
    noticeRefusal(assetRes.status);
    noticeRefusal(formatRes.status);
    if (assetRes.status === 401 || formatRes.status === 401) {
      setNeedsSignIn(true);
      return;
    }
    if (!assetRes.ok || !formatRes.ok) {
      setError(`Could not load the export options (HTTP ${assetRes.status}/${formatRes.status})`);
      return;
    }

    const assetBody = await assetRes.json().catch(() => null);
    const ready: ReadyAsset[] = (Array.isArray(assetBody) ? assetBody : []).flatMap(
      (raw: unknown) => {
        const a = raw as Record<string, unknown> | null;
        if (typeof a?.id !== 'string' || a.status !== 'ready') return [];
        return [{ id: a.id, name: typeof a.name === 'string' && a.name ? a.name : a.id }];
      },
    );
    setAssets(ready);
    setAssetId((prev) => prev ?? ready[0]?.id ?? null);

    const formatBody = (await formatRes.json().catch(() => null)) as { formats?: unknown } | null;
    const offered: FormatOption[] = (
      Array.isArray(formatBody?.formats) ? formatBody.formats : []
    ).flatMap((raw: unknown) => {
      const f = raw as Record<string, unknown> | null;
      if (typeof f?.id !== 'string') return [];
      return [{ id: f.id, name: typeof f.name === 'string' && f.name ? f.name : f.id }];
    });
    setFormats(offered);
    setFormat((prev) => prev ?? offered[0]?.id ?? null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const running = timers.current;
    return () => {
      for (const t of running.values()) clearInterval(t);
      running.clear();
    };
  }, []);

  const start = async () => {
    if (!assetId || !format) return;
    setStarting(true);
    setError(null);
    const res = await fetch(`${API}/exports`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ asset_id: assetId, format }),
    }).catch(() => null);
    setStarting(false);

    if (!res) {
      setError('The export service is unreachable.');
      return;
    }
    noticeRefusal(res.status);
    if (res.status === 401) {
      setNeedsSignIn(true);
      return;
    }
    if (res.status === 403) {
      setError('Your account cannot start exports. Ask for edit access.');
      return;
    }
    if (!res.ok) {
      setError(`Export failed to start with HTTP ${res.status}`);
      return;
    }
    const job = parseJob(await res.json().catch(() => null));
    if (!job) {
      setError('The server returned a job we could not read.');
      return;
    }
    setJobs((prev) => [job, ...prev.filter((j) => j.id !== job.id)]);
    if (job.state !== 'ready' && job.state !== 'failed') poll(job.id);
  };

  // the download route needs the bearer token, so the href cannot just be
  // followed and the bytes come through a tokened fetch instead
  const download = async (jobId: string) => {
    setError(null);
    const res = await fetch(downloadUrl(jobId), { headers: authHeaders() }).catch(() => null);
    if (res) noticeRefusal(res.status);
    if (!res?.ok) {
      setError(
        res ? `Download failed with HTTP ${res.status}` : 'The export service is unreachable.',
      );
      return;
    }
    const name = res.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ?? jobId;
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <PanelCard width={300} maxHeight="60vh">
      <PanelHeader
        icon={<IconPrinter size={16} />}
        title="Asset Export"
        onClose={onClose}
      />

      {needsSignIn ? (
        <Text size="xs" c="dimmed" py="lg" ta="center" data-testid="export3d-signin">
          Sign in to export an asset.
        </Text>
      ) : (
        <Stack gap="xs" style={{ minHeight: 0 }}>
          <Select
            size="xs"
            label="Asset"
            placeholder={assets.length ? 'Pick an asset' : 'No tiled assets yet'}
            data={assets.map((a) => ({ value: a.id, label: a.name }))}
            value={assetId}
            onChange={setAssetId}
            disabled={assets.length === 0}
          />

          <Select
            size="xs"
            label="Format"
            placeholder="Pick a format"
            data={formats.map((f) => ({ value: f.id, label: f.name }))}
            value={format}
            onChange={setFormat}
            disabled={formats.length === 0}
          />

          <Button
            size="xs"
            variant="filled"
            color="violet"
            fullWidth
            loading={starting}
            disabled={!assetId || !format}
            onClick={() => void start()}
          >
            Start export
          </Button>

          {error && (
            <Text size="xs" c="red" data-testid="export3d-error">
              {error}
            </Text>
          )}

          <ScrollArea style={{ minHeight: 0 }}>
            <Stack gap={4}>
              {jobs.map((job) => (
                <Group
                  key={job.id}
                  justify="space-between"
                  wrap="nowrap"
                  p="xs"
                  data-testid={`export3d-job-${job.id}`}
                  style={{ background: 'var(--mantine-color-dark-6)', borderRadius: 4 }}
                >
                  <Badge size="xs" variant="light" color={STATE_COLOR[job.state]}>
                    {job.detail}
                  </Badge>
                  {job.state === 'ready' && (
                    <Anchor
                      href={downloadUrl(job.id)}
                      size="xs"
                      c="violet"
                      onClick={(e) => {
                        e.preventDefault();
                        void download(job.id);
                      }}
                    >
                      <Group gap={4} wrap="nowrap">
                        <IconDownload size={12} />
                        Download
                      </Group>
                    </Anchor>
                  )}
                </Group>
              ))}
            </Stack>
          </ScrollArea>
        </Stack>
      )}
    </PanelCard>
  );
}
