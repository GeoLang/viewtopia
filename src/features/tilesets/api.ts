// tiletopia's vector tilesets: a vector file too large for the browser goes up
// as a multipart upload, tippecanoe builds it into one PMTiles archive, and the
// archive is served as a martin source. nginx reaches tiletopia's /api/* as
// /tiles/* and passes /martin/* through unchanged.

import { authHeaders, noticeRefusal } from '../../lib/apiAuth';
import { isUnreachableStatus, unreachableMessage } from '../../offline/backends';
import type { TilesetSource } from '../../store/ogcLayers';

const TILESETS_URL = '/tiles/v1/tilesets';
const MARTIN_URL = '/martin';

/** what an upload that never reached the server is reported as */
const NO_RESPONSE = 0;

/**
 * Above this a vector file goes to the server instead of into the browser. Held
 * in one FeatureCollection plus its parsed geometry, a file this size already
 * costs several times its own bytes in the tab.
 */
export const BROWSER_IMPORT_LIMIT_BYTES = 50 * 1024 * 1024;

/** Extensions tippecanoe reads, longest first so `.geojson.gz` wins over `.geojson`. */
export const TILESET_FORMATS = ['.geojson.gz', '.geojson', '.fgb', '.csv'];

/** How often a building tileset is asked about. */
const POLL_INTERVAL_MS = 2000;

export type TilesetStatus = 'building' | 'ready' | 'failed';

/** A registry row as tiletopia serializes it. */
export interface Tileset {
  id: string;
  name: string;
  status: TilesetStatus;
  /** The `/martin/{source}` id the archive is registered under. */
  source_id: string;
  object_key: string;
  original_filename: string;
  /** The layer name inside the archive, passed to tippecanoe as `-l`. */
  layer_name: string;
  argv: string[];
  size_bytes: number;
  created_at: string;
  built_at: string | null;
  /** The tail of tippecanoe's stderr when the build failed. */
  error: string | null;
}

/** Whether a tileset can be built from this file at all. */
export function tilesetFormat(filename: string): string | null {
  const lower = filename.toLowerCase();
  return TILESET_FORMATS.find((format) => lower.endsWith(format)) ?? null;
}

/** Files the browser should not parse itself. */
export function tooLargeForBrowser(file: File): boolean {
  return file.size > BROWSER_IMPORT_LIMIT_BYTES;
}

export function formatBytes(bytes: number): string {
  const megabytes = bytes / (1024 * 1024);
  if (megabytes >= 1024) return `${(megabytes / 1024).toFixed(1)} GB`;
  if (megabytes >= 1) return `${megabytes.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** TileJSON for a built archive. */
function tileJsonUrl(sourceId: string): string {
  return `${MARTIN_URL}/${encodeURIComponent(sourceId)}`;
}

/** Whether a URL is one tiletopia checks the platform JWT on. */
export function isMartinUrl(url: string): boolean {
  const path = url.startsWith('http') ? new URL(url).pathname : url;
  return path.startsWith(`${MARTIN_URL}/`);
}

/**
 * MapLibre's request transform: a `/martin` tile carries the platform bearer,
 * everything else goes out untouched. The url is made absolute because a
 * request with headers is issued as `fetch(new Request(url))` from a worker,
 * which has no base to resolve a root-relative one against.
 */
export function martinRequest(url: string): { url: string; headers?: Record<string, string> } {
  if (!isMartinUrl(url)) return { url };
  return { url: new URL(url, window.location.origin).toString(), headers: authHeaders() };
}

async function readError(response: Response, fallback: string): Promise<never> {
  noticeRefusal(response.status);
  if (isUnreachableStatus(response.status)) {
    throw new Error(unreachableMessage('tiletopia', response.status));
  }
  const body = await response.text().catch(() => '');
  throw new Error(body.trim() || `${fallback} (HTTP ${response.status})`);
}

export async function listTilesets(): Promise<Tileset[]> {
  const response = await fetch(TILESETS_URL, { headers: authHeaders() });
  if (!response.ok) await readError(response, 'could not list tilesets');
  return (await response.json()) as Tileset[];
}

export async function getTileset(id: string): Promise<Tileset> {
  const response = await fetch(`${TILESETS_URL}/${encodeURIComponent(id)}`, {
    headers: authHeaders(),
  });
  if (!response.ok) await readError(response, 'could not read the tileset');
  return (await response.json()) as Tileset;
}

export async function deleteTileset(id: string): Promise<void> {
  const response = await fetch(`${TILESETS_URL}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!response.ok) await readError(response, 'could not delete the tileset');
}

/**
 * Upload one file and get back the row the build was queued against. XHR rather
 * than fetch: it is the only way to read how much of the body has gone out, and
 * a file this size is minutes of upload.
 */
export function uploadTileset(
  file: File,
  onProgress: (fraction: number) => void,
): Promise<Tileset> {
  const form = new FormData();
  form.append('name', file.name);
  form.append('file', file);

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', TILESETS_URL);
    for (const [header, value] of Object.entries(authHeaders())) {
      request.setRequestHeader(header, value);
    }
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    request.onerror = () => reject(new Error(unreachableMessage('tiletopia', NO_RESPONSE)));
    request.onload = () => {
      noticeRefusal(request.status);
      if (isUnreachableStatus(request.status)) {
        reject(new Error(unreachableMessage('tiletopia', request.status)));
        return;
      }
      if (request.status < 200 || request.status >= 300) {
        reject(new Error(request.responseText.trim() || `upload failed (HTTP ${request.status})`));
        return;
      }
      try {
        const body = JSON.parse(request.responseText) as { tileset: Tileset };
        resolve(body.tileset);
      } catch {
        reject(new Error('the server answered something that is not a tileset'));
      }
    };
    request.send(form);
  });
}

/** Ask about a building tileset until it is ready or failed. */
export async function pollUntilBuilt(
  id: string,
  onUpdate: (tileset: Tileset) => void,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((done) => setTimeout(done, ms)),
): Promise<Tileset> {
  for (;;) {
    const tileset = await getTileset(id);
    onUpdate(tileset);
    if (tileset.status !== 'building') return tileset;
    await wait(POLL_INTERVAL_MS);
  }
}

/**
 * Where the archive's tiles are and what is inside them, from the source's
 * TileJSON. The tile URL is the server's to name, so it is taken as given. An
 * archive tippecanoe built holds the one layer it was told to write, which is
 * what answers when the TileJSON carries no `vector_layers`.
 */
export async function readTileset(
  tileset: Tileset,
): Promise<{ url: string; source: TilesetSource }> {
  const response = await fetch(tileJsonUrl(tileset.source_id), { headers: authHeaders() });
  if (!response.ok) await readError(response, 'the tileset does not serve tiles yet');
  const tileJson = (await response.json()) as {
    tiles?: string[];
    vector_layers?: { id: string }[];
    minzoom?: number;
    maxzoom?: number;
  };
  const url = tileJson.tiles?.[0];
  if (!url) throw new Error(`${tileset.name} serves no tile url`);
  const named = (tileJson.vector_layers ?? []).map((layer) => layer.id).filter(Boolean);
  return {
    url,
    source: {
      id: tileset.id,
      layers: named.length ? named : [tileset.layer_name],
      minZoom: tileJson.minzoom,
      maxZoom: tileJson.maxzoom,
    },
  };
}
