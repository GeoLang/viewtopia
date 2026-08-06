// Client for geoplumb-server's tile service, proxied at /plumb/ (nginx strips
// the prefix, so /plumb/layers reaches the server's /layers). Public by
// design: these are tiles rendered from public STAC collections, so no token
// is sent. The time axis is the point of this client — a layer's STAC
// collection advertises a temporal extent, and this turns that into the
// discrete steps an A/B compare can pick from.

const API = '/plumb';

/** How wide one step of the sequence is. */
export type StepSize = 'month' | 'year';

/** A collection's advertised temporal extent, either end open. */
export interface TemporalExtent {
  start: string | null;
  end: string | null;
}

export interface PlumbLayer {
  name: string;
  /** `stac` or `cog` */
  source: string;
  collection: string | null;
  /** the interval the server's own pulls take when a request names none */
  defaultDatetime: string | null;
  temporalExtent: TemporalExtent | null;
}

/**
 * Steps one sequence may hold. A collection open at the far end (Landsat back
 * to 1972) would otherwise fill a picker with hundreds of entries, so the
 * sequence keeps the most recent ones.
 */
export const MAX_STEPS = 240;

export function layersUrl(): string {
  return `${API}/layers`;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function parseExtent(value: unknown): TemporalExtent | null {
  if (!value || typeof value !== 'object') return null;
  const e = value as Record<string, unknown>;
  return { start: str(e.start), end: str(e.end) };
}

export function parseLayers(body: unknown): PlumbLayer[] {
  if (!Array.isArray(body)) return [];
  return body.flatMap((raw) => {
    const l = raw as Record<string, unknown> | null;
    if (!l || typeof l.name !== 'string' || !l.name) return [];
    return [
      {
        name: l.name,
        source: str(l.source) ?? 'unknown',
        collection: str(l.collection),
        defaultDatetime: str(l.default_datetime),
        temporalExtent: parseExtent(l.temporal_extent),
      },
    ];
  });
}

/**
 * The layers an A/B compare can offer. A COG layer has no time axis at all,
 * and a collection whose extent carries no readable start gives nothing to
 * step from, so neither is selectable.
 */
export function timedLayers(layers: PlumbLayer[]): PlumbLayer[] {
  return layers.filter((l) => {
    const start = l.temporalExtent?.start;
    return !!start && Number.isFinite(Date.parse(start));
  });
}

export async function listLayers(): Promise<PlumbLayer[]> {
  const res = await fetch(layersUrl()).catch(() => null);
  if (!res) throw new Error('The geoplumb tile service is unreachable.');
  if (!res.ok) throw new Error(`the layer list came back HTTP ${res.status}`);
  return parseLayers(await res.json());
}

const pad = (n: number, width: number) => String(n).padStart(width, '0');

/** The UTC instant a calendar step starts, as the rfc 3339 the server parses. */
function stamp(year: number, month: number): string {
  return `${pad(year, 4)}-${pad(month + 1, 2)}-01T00:00:00Z`;
}

/** `{year, month}` of the step containing `ms`, months collapsed for a year step. */
function stepOf(ms: number, step: StepSize) {
  const d = new Date(ms);
  return {
    year: d.getUTCFullYear(),
    month: step === 'year' ? 0 : d.getUTCMonth(),
  };
}

function advance(year: number, month: number, step: StepSize, by: number) {
  if (step === 'year') return { year: year + by, month };
  const total = year * 12 + month + by;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

/**
 * The step starts a temporal extent covers, oldest first. Both ends snap to
 * their calendar step, so an extent that starts on the 14th still offers the
 * whole month it falls in and a trailing partial month is a step of its own.
 * An open end runs to `now`.
 */
export function buildSteps(
  extent: TemporalExtent,
  step: StepSize,
  now: number = Date.now(),
): string[] {
  const startMs = extent.start ? Date.parse(extent.start) : NaN;
  if (!Number.isFinite(startMs)) return [];
  const parsedEnd = extent.end ? Date.parse(extent.end) : NaN;
  const endMs = Number.isFinite(parsedEnd) ? parsedEnd : now;
  if (endMs < startMs) return [];

  const first = stepOf(startMs, step);
  const last = stepOf(endMs, step);
  const span =
    step === 'year'
      ? last.year - first.year
      : (last.year - first.year) * 12 + (last.month - first.month);
  // drop the oldest steps rather than looping over an extent that reaches
  // back centuries, so the count is bounded before anything is built
  const skip = Math.max(0, span + 1 - MAX_STEPS);

  const steps: string[] = [];
  let at = advance(first.year, first.month, step, skip);
  for (let i = skip; i <= span; i += 1) {
    steps.push(stamp(at.year, at.month));
    at = advance(at.year, at.month, step, 1);
  }
  return steps;
}

/**
 * The `t` parameter for one step: the half-open interval `[step, next step)`.
 * The server takes an rfc 3339 `start/end` pair and STAC compares it closed at
 * both ends, so a tile at a month boundary can also catch the next step's
 * first instant.
 */
export function stepInterval(stepStart: string, step: StepSize): string {
  const ms = Date.parse(stepStart);
  if (!Number.isFinite(ms)) throw new Error(`not a step start: ${stepStart}`);
  const from = stepOf(ms, 'month');
  const to = advance(from.year, from.month, step, 1);
  return `${stamp(from.year, from.month)}/${stamp(to.year, to.month)}`;
}

/** How a step reads in the picker: `2024-06` for a month, `2024` for a year. */
export function stepLabel(stepStart: string, step: StepSize): string {
  return step === 'year' ? stepStart.slice(0, 4) : stepStart.slice(0, 7);
}

/**
 * The MapLibre raster template for a layer at one interval. The `{z}/{x}/{y}`
 * placeholders stay literal for MapLibre to fill; everything else is encoded,
 * so the interval's `:` and `/` reach the server as one query value.
 */
export function tileUrl(layer: string, interval: string): string {
  return `${API}/tiles/${encodeURIComponent(layer)}/{z}/{x}/{y}.png?t=${encodeURIComponent(interval)}`;
}
