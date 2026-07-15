/**
 * Point-data sourcing for the deck.gl analysis panels (Heatmap, Spatial Stats).
 * Turns a drawn layer or pasted GeoJSON into flat [lng,lat] records the deck
 * aggregation layers consume, and helpers to add/remove a panel's deck group.
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

/** Show a panel's deck layer, switching the app to the deck.gl globe renderer. */
export function showPanelDeckLayer(group: string, layer: Layer): void {
  useDeckLayersStore.getState().setGroup(group, [layer]);
  const app = useAppStore.getState();
  app.setActiveTab('globe');
  app.setRenderer('deckgl');
}

export function clearPanelDeckLayer(group: string): void {
  useDeckLayersStore.getState().setGroup(group, []);
}
