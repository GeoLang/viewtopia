// ptolemy converts a dataset's stored Esri style to MapLibre layers at
// /api/v1/datasets/{id}/style. The endpoint is public for visible datasets, and
// answers 404 when the dataset has no stored style and 422 when its geometry or
// style cannot be converted, so every non-200 here means "keep the caller's own
// styling" rather than an error worth surfacing.

import type { LayerSpecification } from 'maplibre-gl';
import { apiHeaders } from './apiAuth';

export interface StyleLoss {
  path: string;
  reason: string;
}

/**
 * A sprite the layers reference by name. jung-esri's contract: register it at
 * exactly width x height css px and the layers need no icon-size to look right.
 */
export interface DatasetStyleImage {
  name: string;
  dataUri: string;
  width: number;
  height: number;
}

export interface DatasetStyle {
  layers: LayerSpecification[];
  images: DatasetStyleImage[];
  losses: StyleLoss[];
}

/** ptolemy's MVT writer names its one layer `features`. */
export const PTOLEMY_SOURCE_LAYER = 'features';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseLosses(value: unknown): StyleLoss[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .filter((loss) => typeof loss.path === 'string' && typeof loss.reason === 'string')
    .map((loss) => ({ path: loss.path as string, reason: loss.reason as string }));
}

/**
 * The optional `images` object, which older ptolemy builds leave out entirely.
 * Names are prefixed like the layer ids, and `names` maps the response name to
 * the prefixed one so the layer references can follow.
 */
function parseImages(
  value: unknown,
  sourceId: string,
): { images: DatasetStyleImage[]; names: Map<string, string> } {
  const images: DatasetStyleImage[] = [];
  const names = new Map<string, string>();
  if (!isRecord(value)) return { images, names };
  for (const [name, raw] of Object.entries(value)) {
    if (!name || !isRecord(raw)) continue;
    const { data_uri: dataUri, width, height } = raw;
    // untrusted content: take image data URIs only, and a size we can draw at
    if (typeof dataUri !== 'string' || !dataUri.startsWith('data:image/')) continue;
    if (!isDrawableSize(width) || !isDrawableSize(height)) continue;
    const prefixed = `${sourceId}-${name}`;
    names.set(name, prefixed);
    images.push({ name: prefixed, dataUri, width, height });
  }
  return { images, names };
}

function isDrawableSize(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/** Layer properties naming an image, whose value may be a plain name or an expression. */
const IMAGE_REFS = [
  ['layout', 'icon-image'],
  ['paint', 'fill-pattern'],
] as const;

/**
 * Image names swapped for their prefixed form, walking into match/step
 * expressions. An operator (index 0) is left alone, as is any name we have no
 * image for, including the "" the translator uses for a hidden branch.
 */
function renameImageRefs(value: unknown, names: Map<string, string>): unknown {
  if (typeof value === 'string') return names.get(value) ?? value;
  if (Array.isArray(value)) {
    return value.map((item, index) => (index === 0 ? item : renameImageRefs(item, names)));
  }
  return value;
}

function withRenamedImages(
  layer: Record<string, unknown>,
  names: Map<string, string>,
): Record<string, unknown> {
  if (names.size === 0) return layer;
  const out = { ...layer };
  for (const [block, prop] of IMAGE_REFS) {
    const properties = out[block];
    if (isRecord(properties) && prop in properties) {
      out[block] = { ...properties, [prop]: renameImageRefs(properties[prop], names) };
    }
  }
  return out;
}

/**
 * A style response as layers ready for addLayer, or null when it carries none.
 * Layer and image ids are prefixed with the source id so two sources built from
 * the same dataset cannot collide, and source/source-layer are pinned to what we
 * asked for so a mismatched response cannot bind to some other source.
 */
export function datasetStyleLayers(
  body: unknown,
  sourceId: string,
  sourceLayer: string,
): DatasetStyle | null {
  if (!isRecord(body) || !Array.isArray(body.layers)) return null;
  const { images, names } = parseImages(body.images, sourceId);
  const layers: LayerSpecification[] = [];
  for (const [index, raw] of body.layers.entries()) {
    if (!isRecord(raw) || typeof raw.type !== 'string') continue;
    const id = typeof raw.id === 'string' && raw.id ? raw.id : `${index}`;
    layers.push({
      ...withRenamedImages(raw, names),
      id: `${sourceId}-${id}`,
      source: sourceId,
      'source-layer': sourceLayer,
    } as LayerSpecification);
  }
  if (layers.length === 0) return null;
  return { layers, images, losses: parseLosses(body.losses) };
}

/** null when the dataset has no usable style, i.e. draw it however you would otherwise. */
export async function fetchDatasetStyle(
  datasetId: string,
  sourceId: string,
  sourceLayer: string,
): Promise<DatasetStyle | null> {
  const query = new URLSearchParams({ source: sourceId, sourceLayer });
  const url = `/api/v1/datasets/${encodeURIComponent(datasetId)}/style?${query}`;
  try {
    const res = await fetch(url, { headers: apiHeaders() });
    if (!res.ok) {
      console.debug(`dataset style ${datasetId}: ${res.status}, using default styling`);
      return null;
    }
    return datasetStyleLayers(await res.json(), sourceId, sourceLayer);
  } catch (err) {
    console.debug(`dataset style ${datasetId} failed, using default styling`, err);
    return null;
  }
}
