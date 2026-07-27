/**
 * Point-data sourcing for the deck.gl analysis panels (Heatmap, Spatial Stats).
 * Turns a drawn layer or pasted GeoJSON into flat [lng,lat] records the deck
 * aggregation layers consume, and helpers to add/remove a panel's layer group
 * on the map's deck overlay.
 */
import type { Layer } from '@deck.gl/core';
import { useDeckLayersStore } from '../hooks/deckLayers';
import { useAppStore } from '../store/app';
import { useDrawStore, featuresToGeoJSON, type DrawnFeature } from '../store/draw';

export interface PointRecord {
  position: [number, number];
  properties: Record<string, unknown>;
}

/** Flatten a GeoJSON object into point records, using every vertex of each geometry. */
export function collectPoints(geojson: unknown): PointRecord[] {
  const out: PointRecord[] = [];
  const features = (geojson as { features?: unknown[] })?.features;
  const list = Array.isArray(features)
    ? features
    : geojson && (geojson as { type?: string }).type === 'Feature'
      ? [geojson]
      : [];

  const pushCoords = (coords: unknown, props: Record<string, unknown>) => {
    if (
      Array.isArray(coords) &&
      typeof coords[0] === 'number' &&
      typeof coords[1] === 'number'
    ) {
      out.push({ position: [coords[0], coords[1]], properties: props });
      return;
    }
    if (Array.isArray(coords)) for (const c of coords) pushCoords(c, props);
  };

  for (const f of list) {
    const feat = f as { geometry?: { coordinates?: unknown }; properties?: Record<string, unknown> };
    if (!feat?.geometry?.coordinates) continue;
    pushCoords(feat.geometry.coordinates, feat.properties ?? {});
  }
  return out;
}

/** Property keys whose values parse as finite numbers across the records. */
export function numericProperties(records: PointRecord[]): string[] {
  const keys = new Set<string>();
  for (const r of records) {
    for (const [k, v] of Object.entries(r.properties)) {
      if (v !== '' && v != null && Number.isFinite(Number(v))) keys.add(k);
    }
  }
  return [...keys];
}

/** Select options for the drawn features that carry point data. */
export function drawLayerOptions(features: DrawnFeature[]): { value: string; label: string }[] {
  return features.map((f, i) => ({ value: f.id, label: `${f.type} #${i + 1}` }));
}

/** Points from a single drawn feature by id, or all drawn features when id is null. */
export function pointsFromDraw(featureId: string | null): PointRecord[] {
  const features = useDrawStore.getState().features;
  const selected = featureId ? features.filter((f) => f.id === featureId) : features;
  return collectPoints(featuresToGeoJSON(selected));
}

export type GridAggregation = 'count' | 'sum' | 'mean';

export interface GridSummary {
  total: number;
  cells: number;
  min: number;
  max: number;
}

/** Weight of one record, matching what the deck aggregation layers are given. */
export function gridWeight(record: PointRecord, property: string | null): number {
  return property ? Number(record.properties[property]) || 0 : 1;
}

/**
 * Bin points into a rough metric grid and reduce each cell with `method`. sum and
 * mean weigh the chosen numeric property; count ignores it. min/max are over the
 * per-cell values, so they only match cell counts when the method is count.
 */
export function gridSummary(
  points: PointRecord[],
  cellMeters: number,
  method: GridAggregation,
  property: string | null,
): GridSummary {
  if (points.length === 0) return { total: 0, cells: 0, min: 0, max: 0 };
  const avgLat = points.reduce((s, p) => s + p.position[1], 0) / points.length;
  const latDeg = cellMeters / 111320;
  const lngDeg = cellMeters / (111320 * Math.cos((avgLat * Math.PI) / 180) || 1);
  const cells = new Map<string, { count: number; sum: number }>();
  for (const p of points) {
    const key = `${Math.floor(p.position[0] / lngDeg)}_${Math.floor(p.position[1] / latDeg)}`;
    const cell = cells.get(key) ?? { count: 0, sum: 0 };
    cell.count += 1;
    cell.sum += gridWeight(p, property);
    cells.set(key, cell);
  }
  const values = [...cells.values()].map((c) => {
    if (method === 'sum') return c.sum;
    if (method === 'mean') return c.sum / c.count;
    return c.count;
  });
  return {
    total: points.length,
    cells: cells.size,
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

/** Show a panel's deck layer(s), switching to the renderer that draws them. */
export function showPanelDeckLayer(group: string, layer: Layer | Layer[]): void {
  useDeckLayersStore.getState().setGroup(group, Array.isArray(layer) ? layer : [layer]);
  const app = useAppStore.getState();
  app.setActiveTab('globe');
  app.setRenderer('maplibre');
}

export function clearPanelDeckLayer(group: string): void {
  useDeckLayersStore.getState().setGroup(group, []);
}
