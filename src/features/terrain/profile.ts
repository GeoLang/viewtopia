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
import { drawTerrainResult } from './resultLayer';

export const MIN_PROFILE_SAMPLES = 10;
export const MAX_PROFILE_SAMPLES = 200;
export const DEFAULT_PROFILE_SAMPLES = 100;
export const DEFAULT_CROSS_SECTION_SAMPLES = 50;

export interface ProfileLineStyle {
  layerId: string;
  color: string;
}

export const PROFILE_LINE_STYLE: ProfileLineStyle = {
  layerId: 'terrain-profile-line',
  color: '#a78bfa',
};

export const CROSS_SECTION_LINE_STYLE: ProfileLineStyle = {
  layerId: 'cross-section-line',
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

export async function drawProfileLine(
  coordinates: [number, number][],
  style: ProfileLineStyle,
): Promise<void> {
  await drawTerrainResult(
    style.layerId,
    {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'LineString', coordinates }, properties: {} },
      ],
    },
    style.color,
    false,
  );
}
