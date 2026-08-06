/**
 * Keyless nearby-photo search over Panoramax (federated street-level, STAC)
 * and Wikimedia Commons geosearch. Both answer CORS-anonymous requests, so the
 * browser talks to them directly; Commons needs origin=* to do so.
 */

export type PhotoSource = 'panoramax' | 'commons';

export interface PhotoResult {
  id: string;
  source: PhotoSource;
  lon: number;
  lat: number;
  title: string;
  thumbUrl: string;
  fullUrl: string;
  credit: string;
  license: string;
  /** license deed for Panoramax, file page for Commons */
  licenseUrl: string;
}

export const PANORAMAX_API = 'https://api.panoramax.xyz/api';
export const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';

export const SOURCE_COLOR: Record<PhotoSource, string> = {
  panoramax: '#e6533c',
  commons: '#3b82f6',
};

const M_PER_DEG_LAT = 111_320;

/** [minLon, minLat, maxLon, maxLat] around a point, the radius in metres. */
export function radiusBbox(
  lon: number,
  lat: number,
  radiusM: number,
): [number, number, number, number] {
  const dLat = radiusM / M_PER_DEG_LAT;
  // near the poles the cosine collapses and the longitude span blows up
  const dLon = radiusM / (M_PER_DEG_LAT * Math.max(Math.cos((lat * Math.PI) / 180), 1e-4));
  return [
    lon - dLon,
    Math.max(lat - dLat, -90),
    lon + dLon,
    Math.min(lat + dLat, 90),
  ];
}

export function panoramaxUrl(lon: number, lat: number, radiusM: number): string {
  return `${PANORAMAX_API}/search?bbox=${radiusBbox(lon, lat, radiusM).join(',')}&limit=50`;
}

export function commonsUrl(lon: number, lat: number, radiusM: number): string {
  const params = new URLSearchParams({
    action: 'query',
    generator: 'geosearch',
    ggscoord: `${lat}|${lon}`,
    // geosearch rejects anything outside 10..10000 m
    ggsradius: String(Math.min(Math.max(Math.round(radiusM), 10), 10_000)),
    ggslimit: '20',
    ggsnamespace: '6',
    prop: 'imageinfo|coordinates',
    iiprop: 'url',
    iiurlwidth: '320',
    format: 'json',
    origin: '*',
  });
  return `${COMMONS_API}?${params}`;
}

interface StacItem {
  id: string;
  geometry?: { coordinates?: [number, number] };
  properties?: { datetime?: string; license?: string };
  providers?: Array<{ name?: string }>;
  links?: Array<{ rel?: string; href?: string }>;
  assets?: Record<string, { href?: string }>;
}

export function parsePanoramax(data: unknown): PhotoResult[] {
  const features = (data as { features?: StacItem[] } | null)?.features ?? [];
  const out: PhotoResult[] = [];
  for (const f of features) {
    const coords = f.geometry?.coordinates;
    const thumbUrl = f.assets?.thumb?.href ?? f.assets?.sd?.href;
    if (!coords || !thumbUrl) continue;
    const date = f.properties?.datetime?.slice(0, 10);
    out.push({
      id: `panoramax-${f.id}`,
      source: 'panoramax',
      lon: coords[0],
      lat: coords[1],
      title: date ? `Street view ${date}` : 'Street view',
      thumbUrl,
      fullUrl: f.assets?.hd?.href ?? f.assets?.sd?.href ?? thumbUrl,
      credit: f.providers?.map((p) => p.name).filter(Boolean).join(', ') || 'Unknown author',
      license: f.properties?.license ?? 'CC-BY-SA-4.0',
      licenseUrl:
        f.links?.find((l) => l.rel === 'license')?.href ??
        'https://creativecommons.org/licenses/by-sa/4.0/',
    });
  }
  return out;
}

interface CommonsPage {
  pageid?: number;
  title?: string;
  coordinates?: Array<{ lat?: number; lon?: number }>;
  imageinfo?: Array<{ thumburl?: string; url?: string; descriptionurl?: string }>;
}

export function parseCommons(data: unknown): PhotoResult[] {
  const pages = (data as { query?: { pages?: Record<string, CommonsPage> } } | null)?.query?.pages;
  const out: PhotoResult[] = [];
  for (const page of Object.values(pages ?? {})) {
    const info = page.imageinfo?.[0];
    const coord = page.coordinates?.[0];
    if (!info?.thumburl || typeof coord?.lat !== 'number' || typeof coord?.lon !== 'number') {
      continue;
    }
    const title = page.title ?? `File:${page.pageid}`;
    out.push({
      id: `commons-${page.pageid ?? title}`,
      source: 'commons',
      lon: coord.lon,
      lat: coord.lat,
      title: title.replace(/^File:/, ''),
      thumbUrl: info.thumburl,
      fullUrl: info.url ?? info.thumburl,
      credit: 'Wikimedia Commons',
      license: 'See file page',
      licenseUrl:
        info.descriptionurl ??
        `https://commons.wikimedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
    });
  }
  return out;
}

// panoramax images live on origin instances that go down independently of the
// federated catalog, so probe each distinct host once and keep the verdict
const hostProbe = new Map<string, { ok: boolean; at: number }>();
const PROBE_TTL_MS = 5 * 60_000;

async function reachableHosts(urls: string[]): Promise<Set<string>> {
  const samples = new Map<string, string>();
  for (const url of urls) {
    const host = new URL(url).host;
    if (!samples.has(host)) samples.set(host, url);
  }
  const live = new Set<string>();
  await Promise.all(
    [...samples].map(async ([host, url]) => {
      const cached = hostProbe.get(host);
      if (cached && Date.now() - cached.at < PROBE_TTL_MS) {
        if (cached.ok) live.add(host);
        return;
      }
      let ok = false;
      try {
        ok = (await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(4000) })).ok;
      } catch {
        // host unreachable
      }
      hostProbe.set(host, { ok, at: Date.now() });
      if (ok) live.add(host);
    }),
  );
  return live;
}

async function fetchJson(url: string, what: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${what} returned ${res.status}`);
  return res.json();
}

export interface PhotoSearchResult {
  photos: PhotoResult[];
  errors: string[];
}

/** Both catalogues at once; a source that fails costs its results, not the search. */
export async function searchPhotos(
  lon: number,
  lat: number,
  radiusM: number,
): Promise<PhotoSearchResult> {
  const [panoramax, commons] = await Promise.allSettled([
    fetchJson(panoramaxUrl(lon, lat, radiusM), 'Panoramax').then(parsePanoramax),
    fetchJson(commonsUrl(lon, lat, radiusM), 'Commons').then(parseCommons),
  ]);

  const errors: string[] = [];
  let photos: PhotoResult[] = [];

  if (panoramax.status === 'fulfilled') {
    const live = await reachableHosts(panoramax.value.map((p) => p.thumbUrl));
    photos = panoramax.value.filter((p) => live.has(new URL(p.thumbUrl).host));
    if (panoramax.value.length > 0 && photos.length === 0) {
      errors.push('Panoramax: the host instance for these photos is unreachable');
    }
  } else {
    errors.push(`Panoramax: ${firstLine(panoramax.reason)}`);
  }

  if (commons.status === 'fulfilled') {
    photos = photos.concat(commons.value);
  } else {
    errors.push(`Commons: ${firstLine(commons.reason)}`);
  }

  const cosLat = Math.cos((lat * Math.PI) / 180);
  const dist = (p: PhotoResult) => ((p.lon - lon) * cosLat) ** 2 + (p.lat - lat) ** 2;
  photos.sort((a, b) => dist(a) - dist(b));
  return { photos, errors };
}

function firstLine(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).split('\n')[0];
}
