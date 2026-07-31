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

export interface DatasetStyle {
  layers: LayerSpecification[];
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
 * A style response as layers ready for addLayer, or null when it carries none.
 * Layer ids are prefixed with the source id so two sources built from the same
 * dataset cannot collide, and source/source-layer are pinned to what we asked
 * for so a mismatched response cannot bind to some other source.
 */
export function datasetStyleLayers(
  body: unknown,
  sourceId: string,
  sourceLayer: string,
): DatasetStyle | null {
  if (!isRecord(body) || !Array.isArray(body.layers)) return null;
  const layers: LayerSpecification[] = [];
  for (const [index, raw] of body.layers.entries()) {
    if (!isRecord(raw) || typeof raw.type !== 'string') continue;
    const id = typeof raw.id === 'string' && raw.id ? raw.id : `${index}`;
    layers.push({
      ...raw,
      id: `${sourceId}-${id}`,
      source: sourceId,
      'source-layer': sourceLayer,
    } as LayerSpecification);
  }
  if (layers.length === 0) return null;
  return { layers, losses: parseLosses(body.losses) };
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
