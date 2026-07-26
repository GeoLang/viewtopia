/**
 * Time-dynamic imports. Pulls timestamps out of parsed features and hands Cesium
 * a CZML document, which is the only form the viewer's clock and the Timeline
 * panel can play: GeoJsonDataSource drops time properties entirely.
 *
 * Times come from a per-feature property (the same names the space-time CSV
 * import looks for) or from togeojson's `coordTimes`, which is how a GPX track
 * with <time> per point arrives.
 */
import { CzmlDataSource } from 'cesium';
import { getActiveCesiumViewer } from '../viewer/registry';

const TIME_KEYS = ['timestamp', 'time', 'datetime', 'date'];

/** A single instant has no window to animate, so it gets this much room. */
const INSTANT_WINDOW_MS = 3600_000;

export interface TimedSample {
  time: number;
  lon: number;
  lat: number;
  height: number;
}

export interface TimedFeature {
  id: string;
  name: string;
  samples: TimedSample[];
}

export interface TimedImport {
  features: TimedFeature[];
  start: number;
  stop: number;
}

/** Epoch millis from an ISO string, a date string or a numeric timestamp. */
export function parseTimeValue(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Date.parse(value);
  if (!Number.isNaN(parsed)) return parsed;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function featureTime(properties: Record<string, unknown>): number | null {
  for (const [key, value] of Object.entries(properties)) {
    if (!TIME_KEYS.includes(key.toLowerCase())) continue;
    const time = parseTimeValue(value);
    if (time !== null) return time;
  }
  return null;
}

type Coord = number[];

/** Vertices of any geometry, in order, ignoring the nesting. */
function vertices(geometry: GeoJSON.Geometry | null): Coord[] {
  if (!geometry) return [];
  if (geometry.type === 'GeometryCollection') return geometry.geometries.flatMap(vertices);
  const out: Coord[] = [];
  const walk = (value: unknown) => {
    if (Array.isArray(value) && typeof value[0] === 'number' && typeof value[1] === 'number') {
      out.push(value as Coord);
      return;
    }
    if (Array.isArray(value)) value.forEach(walk);
  };
  walk((geometry as { coordinates?: unknown }).coordinates);
  return out;
}

function sample(coord: Coord, time: number): TimedSample {
  return { time, lon: coord[0], lat: coord[1], height: coord[2] ?? 0 };
}

/** togeojson puts one ISO time per vertex on a GPX track under `coordTimes`. */
function coordTimeSamples(feature: GeoJSON.Feature): TimedSample[] {
  const raw = (feature.properties ?? {}).coordTimes;
  const times = (Array.isArray(raw) ? raw.flat() : []).map(parseTimeValue);
  if (times.length === 0) return [];
  const coords = vertices(feature.geometry);
  const samples: TimedSample[] = [];
  for (let i = 0; i < Math.min(times.length, coords.length); i++) {
    const time = times[i];
    if (time !== null) samples.push(sample(coords[i], time));
  }
  return samples.sort((a, b) => a.time - b.time);
}

function featureName(feature: GeoJSON.Feature, index: number): string {
  const props = feature.properties ?? {};
  for (const key of ['name', 'title', 'label', 'id']) {
    const value = props[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return `feature ${index + 1}`;
}

/**
 * The timed subset of a parsed import, or null when nothing carries a time.
 * Features with one timestamp become an entity that appears then; a track with
 * per-vertex times becomes one that moves along them.
 */
export function timedImport(collection: GeoJSON.FeatureCollection): TimedImport | null {
  const features: TimedFeature[] = [];
  collection.features.forEach((feature, index) => {
    let samples = coordTimeSamples(feature);
    if (samples.length === 0) {
      const time = featureTime(feature.properties ?? {});
      const coord = vertices(feature.geometry)[0];
      if (time !== null && coord) samples = [sample(coord, time)];
    }
    if (samples.length > 0) {
      features.push({ id: `timed-${index}`, name: featureName(feature, index), samples });
    }
  });
  if (features.length === 0) return null;
  const times = features.flatMap((f) => f.samples.map((s) => s.time));
  return { features, start: Math.min(...times), stop: Math.max(...times) };
}

const iso = (ms: number) => new Date(ms).toISOString();

/** CZML packets for a timed import: a document clock plus an entity per feature. */
export function timedCzml(name: string, timed: TimedImport): Record<string, unknown>[] {
  const stop = timed.stop > timed.start ? timed.stop : timed.start + INSTANT_WINDOW_MS;
  const packets: Record<string, unknown>[] = [
    {
      id: 'document',
      name,
      version: '1.0',
      // no multiplier: adopting the window is useful, dictating playback speed is not
      clock: { interval: `${iso(timed.start)}/${iso(stop)}`, currentTime: iso(timed.start) },
    },
  ];

  for (const feature of timed.features) {
    const first = feature.samples[0];
    const last = feature.samples[feature.samples.length - 1];
    const moving = feature.samples.length > 1;
    const packet: Record<string, unknown> = {
      id: feature.id,
      name: feature.name,
      // one sample marks an arrival, so the entity stays for the rest of the window
      availability: `${iso(first.time)}/${iso(moving ? last.time : stop)}`,
      point: {
        pixelSize: 10,
        color: { rgba: [56, 189, 248, 255] },
        outlineColor: { rgba: [255, 255, 255, 255] },
        outlineWidth: 1,
      },
      position: moving
        ? {
            epoch: iso(first.time),
            cartographicDegrees: feature.samples.flatMap((s) => [
              (s.time - first.time) / 1000,
              s.lon,
              s.lat,
              s.height,
            ]),
          }
        : { cartographicDegrees: [first.lon, first.lat, first.height] },
    };
    if (moving) {
      packet.path = {
        width: 2,
        leadTime: 0,
        trailTime: (last.time - first.time) / 1000,
        material: { solidColor: { color: { rgba: [56, 189, 248, 200] } } },
      };
    }
    packets.push(packet);
  }
  return packets;
}

/**
 * Load a timed import onto the active Cesium viewer as its own data source.
 * Returns false when there is no Cesium viewer to take it (deck.gl and MapLibre
 * have no clock, so those renderers keep the plain-geometry import path).
 */
export async function loadTimedImport(name: string, timed: TimedImport): Promise<boolean> {
  const viewer = getActiveCesiumViewer();
  if (!viewer) return false;
  // CzmlDataSource.name is read-only: it comes from the document packet's name
  const ds = await CzmlDataSource.load(timedCzml(name, timed));
  await viewer.dataSources.add(ds);
  return true;
}
