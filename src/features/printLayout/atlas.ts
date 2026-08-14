import { featuresBounds } from '../../hooks/agentLayerBounds';
import type { Bbox } from '../../lib/terrainAnalysis';

/**
 * Past this a series is a batch job rather than a print: every page costs a
 * camera move, a tile wait and a full-resolution image in the document.
 */
export const MAX_ATLAS_PAGES = 60;

export interface AtlasPage {
  title: string;
  bounds: Bbox;
}

/** Property names the features carry, for choosing which one titles a page. */
export function atlasFields(features: GeoJSON.Feature[]): string[] {
  const names = new Set<string>();
  for (const feature of features) {
    for (const name of Object.keys(feature.properties ?? {})) names.add(name);
  }
  return [...names].sort();
}

/** Grow the bounds by a fraction of each span, so the feature is not flush to the edge. */
export function expandBounds(bounds: Bbox, fraction: number): Bbox {
  const [west, south, east, north] = bounds;
  const padX = (east - west) * fraction;
  const padY = (north - south) * fraction;
  return [
    Math.max(-180, west - padX),
    Math.max(-90, south - padY),
    Math.min(180, east + padX),
    Math.min(90, north + padY),
  ];
}

function pageTitle(feature: GeoJSON.Feature, field: string | null, index: number): string {
  const value = field ? feature.properties?.[field] : undefined;
  if (value === undefined || value === null || value === '') return `Page ${index + 1}`;
  return String(value);
}

/**
 * One page per feature that has a geometry, capped at MAX_ATLAS_PAGES. `total`
 * is how many pages the layer would make uncapped, so the panel can say what it
 * left out.
 */
export function atlasPages(
  features: GeoJSON.Feature[],
  titleField: string | null,
  marginFraction: number,
): { pages: AtlasPage[]; total: number } {
  const pages: AtlasPage[] = [];
  let total = 0;

  for (const [index, feature] of features.entries()) {
    const bounds = featuresBounds([feature]);
    if (!bounds) continue;
    total += 1;
    if (pages.length >= MAX_ATLAS_PAGES) continue;
    pages.push({
      title: pageTitle(feature, titleField, index),
      bounds: expandBounds(bounds, marginFraction),
    });
  }

  return { pages, total };
}
