/**
 * The scene the globe draws and the two analyses that read a place rather than
 * a layer's attributes: sun and shadows, the clipping plane, travel-time bands
 * and a statistics grid.
 */

import {
  DEFAULT_BAND_MINUTES,
  SECONDS_PER_MINUTE,
  drawServiceAreaBands,
  parseBandMinutes,
} from '../features/analysis/serviceArea';
import {
  DEFAULT_CELL_METERS,
  GRID_AGGREGATIONS,
  MAX_CELL_METERS,
  MIN_CELL_METERS,
  formatCellValue,
  showSpatialStatsGrid,
} from '../features/analysis/spatialStats';
import {
  CENTRE_CLIP_POSITION,
  CLIP_AXES,
  DEFAULT_CLIP_AXIS,
  MAX_CLIP_POSITION,
  MIN_CLIP_POSITION,
  applyGlobeClipping,
  type ClipAxis,
} from '../features/scene/clipping';
import {
  DEFAULT_SHADOW_DARKNESS,
  DEFAULT_SHADOW_MAP_SIZE,
  MAX_HOUR,
  MAX_SHADOW_DARKNESS,
  MIN_HOUR,
  MIN_SHADOW_DARKNESS,
  NOON_HOUR,
  applySunAndShadows,
  formatTimeOfDay,
} from '../features/scene/shadows';
import { formatArea } from '../features/scenario/compare';
import { collectPoints, type GridAggregation } from '../lib/pointData';
import { TRAVEL_PROFILES, type ServiceArea, type TravelProfile } from '../lib/travelTime';
import { useAgentLayerStore } from '../store/agentLayers';
import { geodesicAreaSquareMeters } from '../store/measure';
import { executeViewerCommand } from '../viewer/commands';
import { cesiumViewer } from './globe';
import { resolveViewerLayer } from './layerIndex';
import { ActionError, registerAction } from './registry';

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DARKNESS_DECIMALS = 2;
const COORDINATE_DECIMALS = 4;

function onOff(on: boolean): string {
  return on ? 'on' : 'off';
}

/** Today where the user is, as the date input spells it. */
function todayLocal(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}

function between(name: string, value: number, low: number, high: number): number {
  if (value < low || value > high) {
    throw new ActionError(`${name} is between ${low} and ${high}, not ${value}`);
  }
  return value;
}

registerAction({
  name: 'scene.shadows',
  description:
    'Light the globe from the sun at a date and time of day, casting shadows from buildings and terrain.',
  parameters: {
    on: { type: 'boolean', description: 'true casts shadows, false leaves the globe lit flat.', required: true },
    date: { type: 'string', description: 'The day the sun is placed on, as yyyy-mm-dd. Today by default.' },
    hour: {
      type: 'number',
      description: `Hour of the local day, ${MIN_HOUR} to ${MAX_HOUR}, fractions allowed. ${NOON_HOUR} by default.`,
    },
    darkness: {
      type: 'number',
      description: `How dark a shadow falls, ${MIN_SHADOW_DARKNESS} to ${MAX_SHADOW_DARKNESS}. ${DEFAULT_SHADOW_DARKNESS} by default.`,
    },
    soft_shadows: { type: 'boolean', description: 'true softens the shadow edges. true by default.' },
  },
  run: (args) => {
    const viewer = cesiumViewer();
    const date = (args.date as string | undefined) ?? todayLocal();
    if (!CALENDAR_DATE.test(date)) {
      throw new ActionError(`date is a day as yyyy-mm-dd, not ${date}`);
    }
    const hour = between('hour', (args.hour as number) ?? NOON_HOUR, MIN_HOUR, MAX_HOUR);
    const darkness = between(
      'darkness',
      (args.darkness as number) ?? DEFAULT_SHADOW_DARKNESS,
      MIN_SHADOW_DARKNESS,
      MAX_SHADOW_DARKNESS,
    );
    const enabled = args.on as boolean;
    const softShadows = (args.soft_shadows as boolean | undefined) ?? true;

    applySunAndShadows(viewer, {
      enabled,
      date,
      hour,
      darkness,
      softShadows,
      shadowMapSize: DEFAULT_SHADOW_MAP_SIZE,
    });
    return {
      text: `Shadows are ${onOff(enabled)}, sun at ${date} ${formatTimeOfDay(hour)}, darkness ${darkness.toFixed(DARKNESS_DECIMALS)}, soft shadows ${onOff(softShadows)}.`,
    };
  },
});

registerAction({
  name: 'scene.clipping',
  description: 'Cut the globe open along one axis to see inside it.',
  parameters: {
    on: { type: 'boolean', description: 'true cuts the globe, false puts it back whole.', required: true },
    axis: {
      type: 'string',
      description: `Earth-fixed axis the cut is made along. ${DEFAULT_CLIP_AXIS} by default.`,
      enum: CLIP_AXES,
    },
    position: {
      type: 'number',
      description: `Where along the axis the cut falls, ${MIN_CLIP_POSITION} to ${MAX_CLIP_POSITION}. ${CENTRE_CLIP_POSITION} cuts through the earth's centre.`,
    },
  },
  run: (args) => {
    const viewer = cesiumViewer();
    const axis = (args.axis as ClipAxis | undefined) ?? DEFAULT_CLIP_AXIS;
    const position = between(
      'position',
      (args.position as number) ?? CENTRE_CLIP_POSITION,
      MIN_CLIP_POSITION,
      MAX_CLIP_POSITION,
    );
    const enabled = args.on as boolean;

    applyGlobeClipping(viewer, { axis, position, enabled });
    return {
      text: enabled
        ? `The globe is cut along the ${axis} axis at ${position}%.`
        : 'The globe is whole again.',
    };
  },
});

registerAction({
  name: 'scene.clear',
  description: 'Remove every marker and drawn entity from the map.',
  parameters: {},
  run: () => {
    const cleared = useAgentLayerStore.getState().markers.length;
    executeViewerCommand({ action: 'clear_entities' });
    return { text: cleared === 1 ? 'Cleared 1 marker.' : `Cleared ${cleared} markers.` };
  },
});

registerAction({
  name: 'scene.screenshot',
  description: 'Download a PNG picture of the globe as it looks now.',
  parameters: {},
  run: () => {
    cesiumViewer();
    executeViewerCommand({ action: 'screenshot' });
    // the picture is written from a blob callback the browser answers later
    return { text: 'Took a PNG picture of the globe.' };
  },
});

function bandArea(area: ServiceArea): string {
  const ring = area.ring.map((position): [number, number] => [position[0], position[1]]);
  return `${Math.round(area.maxSeconds / SECONDS_PER_MINUTE)} min ${formatArea(geodesicAreaSquareMeters(ring))}`;
}

registerAction({
  name: 'analysis.travel_time',
  description:
    'Draw how far a vehicle gets from one point within given minutes, one polygon per band.',
  parameters: {
    lon: { type: 'number', description: 'Longitude of the point travelled from.', required: true },
    lat: { type: 'number', description: 'Latitude of the point travelled from.', required: true },
    bands: {
      type: 'string',
      description: `Minutes to reach, comma separated. "${DEFAULT_BAND_MINUTES}" by default.`,
    },
    profile: {
      type: 'string',
      description: 'What is travelling. car by default.',
      enum: TRAVEL_PROFILES,
    },
  },
  run: async (args) => {
    const centre = { lon: args.lon as number, lat: args.lat as number };
    const bandMinutes = parseBandMinutes((args.bands as string | undefined) ?? DEFAULT_BAND_MINUTES);
    if (bandMinutes.length === 0) {
      throw new ActionError(`bands is a list of minutes, not ${args.bands}`);
    }
    const profile = (args.profile as TravelProfile | undefined) ?? 'car';

    const drawn = await drawServiceAreaBands(centre, bandMinutes, profile);
    const place = `${centre.lon.toFixed(COORDINATE_DECIMALS)}, ${centre.lat.toFixed(COORDINATE_DECIMALS)}`;
    if (drawn.areas.length === 0) {
      throw new ActionError(`no band drew from ${place}: ${drawn.failure}`);
    }
    const bands = [...drawn.areas]
      .sort((a, b) => a.maxSeconds - b.maxSeconds)
      .map(bandArea)
      .join(', ');
    const missing = drawn.failure ? ` ${drawn.failure}.` : '';
    return { text: `By ${profile} from ${place}: ${bands}.${missing}` };
  },
});

registerAction({
  name: 'analysis.spatial_stats',
  description:
    "Bin one layer's points into a grid and reduce each cell, drawn as extruded cells on the map.",
  parameters: {
    layer: { type: 'string', description: 'Layer id or name to read the points from.', required: true },
    method: {
      type: 'string',
      description: 'How a cell reduces the points in it. count by default.',
      enum: GRID_AGGREGATIONS,
    },
    property: {
      type: 'string',
      description: 'Numeric property sum and mean weigh. count ignores it.',
    },
    cell_size: {
      type: 'number',
      description: `Cell side in metres, ${MIN_CELL_METERS} to ${MAX_CELL_METERS}. ${DEFAULT_CELL_METERS} by default.`,
    },
  },
  run: (args) => {
    const layer = resolveViewerLayer(args.layer as string);
    const drawn = useAgentLayerStore.getState().layers.find((known) => known.id === layer.id);
    if (!drawn) {
      throw new ActionError(`${layer.name} is a ${layer.kind} layer, which carries no features`);
    }
    const points = collectPoints(drawn.geojson);
    if (points.length === 0) {
      throw new ActionError(`${layer.name} has no points to grid`);
    }
    const method = (args.method as GridAggregation | undefined) ?? 'count';
    const property = (args.property as string | undefined) ?? null;
    const cellMeters = between(
      'cell_size',
      (args.cell_size as number) ?? DEFAULT_CELL_METERS,
      MIN_CELL_METERS,
      MAX_CELL_METERS,
    );

    const { summary, label } = showSpatialStatsGrid(points, method, property, cellMeters);
    return {
      text: `${summary.total} points of ${layer.name} in ${summary.cells} cells of ${cellMeters} m, ${label} from ${formatCellValue(summary.min)} to ${formatCellValue(summary.max)}.`,
    };
  },
});
