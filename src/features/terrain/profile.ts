/**
 * One elevation profile: sample the line, look up the elevation at every
 * sample, and draw the sampled line on the map. The Terrain Profile and Cross
 * Section panels and the chat actions all run this.
 */

import {
  buildProfile,
  fetchElevations,
  sampleAlongLine,
  type ProfilePoint,
  type ProfileStats,
} from '../../lib/elevationProfile';
import { addGeoJsonLayer } from '../../lib/mapLayers';

export const MIN_PROFILE_SAMPLES = 10;
export const MAX_PROFILE_SAMPLES = 200;
export const DEFAULT_PROFILE_SAMPLES = 100;
export const DEFAULT_CROSS_SECTION_SAMPLES = 50;

export interface ProfileLineStyle {
  layerId: string;
  /** what the layer panel and the chat call it */
  name: string;
  color: string;
}

export const PROFILE_LINE_STYLE: ProfileLineStyle = {
  layerId: 'terrain-profile-line',
  name: 'Terrain profile',
  color: '#a78bfa',
};

export const CROSS_SECTION_LINE_STYLE: ProfileLineStyle = {
  layerId: 'cross-section-line',
  name: 'Cross section',
  color: '#e74c3c',
};

export interface TerrainProfile {
  /** the samples the elevations were read at, which is what gets drawn */
  coordinates: [number, number][];
  points: ProfilePoint[];
  stats: ProfileStats;
}

export async function sampleTerrainProfile(
  line: [number, number][],
  sampleCount: number,
): Promise<TerrainProfile> {
  const coordinates = sampleAlongLine(line, sampleCount);
  const elevations = await fetchElevations(coordinates);
  const { points, stats } = buildProfile(coordinates, elevations);
  return { coordinates, points, stats };
}

/** The sampled line as an ordinary layer, so the layer panel can reach it. */
export function drawProfileLine(
  coordinates: [number, number][],
  style: ProfileLineStyle,
): void {
  addGeoJsonLayer(
    style.layerId,
    {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'LineString', coordinates }, properties: {} },
      ],
    },
    // the line runs between points the caller already chose, so framing it
    // would move the view those points were picked in
    { name: style.name, color: style.color, fit: false },
  );
}
