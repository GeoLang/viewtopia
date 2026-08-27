/**
 * Terrain questions the chat can answer without the mouse: what an observer can
 * see, what a water level covers, and the ground along a line.
 */

import {
  DEFAULT_OBSERVER_HEIGHT_METERS,
  DEFAULT_VIEWSHED_RADIUS_METERS,
  runFlood,
  runViewshed,
} from '../features/terrain/analysis';
import {
  CROSS_SECTION_LINE_STYLE,
  DEFAULT_PROFILE_SAMPLES,
  MAX_PROFILE_SAMPLES,
  MIN_PROFILE_SAMPLES,
  drawProfileLine,
  sampleTerrainProfile,
  type TerrainProfile,
} from '../features/terrain/profile';
import { currentBbox, type Bbox } from '../lib/terrainAnalysis';
import { useAgentLayerStore } from '../store/agentLayers';
import { checkOnTheGlobe, place } from './coordinates';
import { listViewerLayers } from './layerIndex';
import { ActionError, registerAction, type ActionArguments } from './registry';
import { resolveOne } from './resolve';

const MINIMUM_RADIUS_METERS = 1;

const SQUARE_METERS_PER_SQUARE_KILOMETER = 1_000_000;
const METERS_PER_KILOMETER = 1000;
const SQUARE_KILOMETER_DECIMALS = 2;
const KILOMETER_DECIMALS = 2;
const METER_DECIMALS = 0;

const BBOX_CORNERS = 4;

function formatMeters(value: number): string {
  return `${value.toFixed(METER_DECIMALS)} m`;
}

function formatKilometers(meters: number): string {
  return `${(meters / METERS_PER_KILOMETER).toFixed(KILOMETER_DECIMALS)} km`;
}

function formatSquareKilometers(squareMeters: number): string {
  const squareKilometers = squareMeters / SQUARE_METERS_PER_SQUARE_KILOMETER;
  return `${squareKilometers.toFixed(SQUARE_KILOMETER_DECIMALS)} km²`;
}

function readBbox(value: unknown): Bbox {
  const corners = (value as unknown[]).map(Number);
  if (corners.length !== BBOX_CORNERS || !corners.every(Number.isFinite)) {
    throw new ActionError('a bbox is four numbers: west, south, east, north');
  }
  const [west, south, east, north] = corners;
  if (east <= west || north <= south) {
    throw new ActionError(`${value} is not a box: east is past west and north is past south`);
  }
  return [west, south, east, north];
}

/** The first line a layer carries, which is what a profile runs along. */
function layerLine(query: string): [number, number][] {
  const layer = resolveOne('layer', query, listViewerLayers());
  const vector = useAgentLayerStore.getState().layers.find((known) => known.id === layer.id);
  if (!vector) {
    throw new ActionError(`${layer.name} is a ${layer.kind} layer, which carries no features`);
  }
  for (const feature of vector.geojson.features) {
    if (feature.geometry.type === 'LineString') {
      return feature.geometry.coordinates as [number, number][];
    }
    if (feature.geometry.type === 'MultiLineString') {
      return feature.geometry.coordinates[0] as [number, number][];
    }
  }
  throw new ActionError(`${layer.name} carries no line to run a profile along`);
}

const PROFILE_PARAMETERS = {
  layer: {
    type: 'string',
    description: 'Layer id or name to run along, instead of the two points.',
  },
  start_lon: { type: 'number', description: 'Longitude the line starts at.' },
  start_lat: { type: 'number', description: 'Latitude the line starts at.' },
  end_lon: { type: 'number', description: 'Longitude the line ends at.' },
  end_lat: { type: 'number', description: 'Latitude the line ends at.' },
  samples: {
    type: 'number',
    description: `How many points to read the elevation at, ${MIN_PROFILE_SAMPLES} to ${MAX_PROFILE_SAMPLES}. ${DEFAULT_PROFILE_SAMPLES} by default.`,
  },
} as const;

function profileLine(args: ActionArguments): [number, number][] {
  if (args.layer !== undefined) return layerLine(args.layer as string);
  const ends = [args.start_lon, args.start_lat, args.end_lon, args.end_lat];
  if (ends.some((end) => end === undefined)) {
    throw new ActionError(
      'a profile runs along a layer, or between start_lon, start_lat, end_lon and end_lat',
    );
  }
  return [
    checkOnTheGlobe(args.start_lon as number, args.start_lat as number),
    checkOnTheGlobe(args.end_lon as number, args.end_lat as number),
  ];
}

function profile(args: ActionArguments): Promise<TerrainProfile> {
  const sampleCount = (args.samples as number) ?? DEFAULT_PROFILE_SAMPLES;
  if (sampleCount < MIN_PROFILE_SAMPLES || sampleCount > MAX_PROFILE_SAMPLES) {
    throw new ActionError(
      `a profile reads ${MIN_PROFILE_SAMPLES} to ${MAX_PROFILE_SAMPLES} points, not ${sampleCount}`,
    );
  }
  return sampleTerrainProfile(profileLine(args), sampleCount);
}

function profileText({ stats }: TerrainProfile): string {
  return (
    `${formatKilometers(stats.totalDist)} of ground: ` +
    `lowest ${formatMeters(stats.minElev)}, highest ${formatMeters(stats.maxElev)}, ` +
    `${formatMeters(stats.gain)} of climb and ${formatMeters(stats.loss)} of descent.`
  );
}

registerAction({
  name: 'analysis.viewshed',
  description: 'Work out what an observer standing at a point can see, and draw the visible ground.',
  parameters: {
    lon: { type: 'number', description: 'Observer longitude in degrees.', required: true },
    lat: { type: 'number', description: 'Observer latitude in degrees.', required: true },
    height_m: {
      type: 'number',
      description: `How far the observer's eyes are above the ground, in metres. ${DEFAULT_OBSERVER_HEIGHT_METERS} by default.`,
    },
    radius_m: {
      type: 'number',
      description: `How far out to look, in metres. ${DEFAULT_VIEWSHED_RADIUS_METERS} by default.`,
    },
  },
  run: async (args) => {
    const [longitude, latitude] = checkOnTheGlobe(args.lon as number, args.lat as number);
    const radiusMeters = (args.radius_m as number) ?? DEFAULT_VIEWSHED_RADIUS_METERS;
    if (radiusMeters < MINIMUM_RADIUS_METERS) {
      throw new ActionError(`an observer looks at least ${MINIMUM_RADIUS_METERS} metre out`);
    }
    const result = await runViewshed({
      longitude,
      latitude,
      heightMeters: (args.height_m as number) ?? DEFAULT_OBSERVER_HEIGHT_METERS,
      radiusMeters,
    });
    return {
      text: `The observer at ${place(longitude, latitude)} sees ${formatSquareKilometers(result.visibleSquareMeters)} within ${formatMeters(radiusMeters)}.`,
    };
  },
});

registerAction({
  name: 'analysis.flood',
  description: 'Flood the ground under a water level and draw what it covers.',
  parameters: {
    level_m: { type: 'number', description: 'Water level in metres above sea level.', required: true },
    bbox: {
      type: 'array',
      description: 'Where to flood, as [west, south, east, north] in degrees. The current view by default.',
    },
  },
  run: async (args) => {
    const bbox = args.bbox === undefined ? currentBbox() : readBbox(args.bbox);
    if (!bbox) throw new ActionError('the current map view has no bounds to flood');
    const levelMeters = args.level_m as number;
    const result = await runFlood(levelMeters, bbox);
    return {
      text: `A ${formatMeters(levelMeters)} water level floods ${result.floodedCells} cells.`,
    };
  },
});

registerAction({
  name: 'analysis.terrain_profile',
  description: 'Read the ground elevation along a line, and answer how it rises and falls.',
  parameters: PROFILE_PARAMETERS,
  reads: true,
  run: async (args) => ({ text: profileText(await profile(args)) }),
});

registerAction({
  name: 'analysis.cross_section',
  description: 'Draw a line on the map and answer how the ground under it rises and falls.',
  parameters: PROFILE_PARAMETERS,
  reads: true,
  run: async (args) => {
    const sampled = await profile(args);
    drawProfileLine(sampled.coordinates, CROSS_SECTION_LINE_STYLE);
    return { text: profileText(sampled) };
  },
});
