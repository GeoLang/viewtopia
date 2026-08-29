import { suggestSymbology, type Symbology } from '../features/symbology/symbology';
import { asColor } from '../lib/color';
import { propertyKeys } from '../lib/geojsonSources';
import { pointWeight } from '../lib/mapHeatmap';
import { collectPoints, type PointRecord } from '../lib/pointData';
import { type AgentLayer, useAgentLayerStore } from '../store/agentLayers';
import { useAppStore } from '../store/app';
import { useOgcLayerStore } from '../store/ogcLayers';
import { useTiles3dLayerStore } from '../store/tiles3dLayers';
import { executeViewerCommand } from '../viewer/commands';
import { resolveViewerLayer, type ViewerLayer } from './layerIndex';
import { ActionError, registerAction } from './registry';

const MIN_OPACITY = 0;
const MAX_OPACITY = 1;

/** What asColor answers for a value the browser does not read as a colour. */
const UNREADABLE_COLOR = '';

const POSITIONS = ['top', 'bottom', 'up', 'down'] as const;
type Position = (typeof POSITIONS)[number];

/** The end of the stack each position reaches for, so a refusal can name it. */
const POSITION_END: Record<Position, 'top' | 'bottom'> = {
  top: 'top',
  up: 'top',
  bottom: 'bottom',
  down: 'bottom',
};

function alreadyAtEnd(name: string, position: Position): string {
  return `${name} is already at the ${POSITION_END[position]} of the drawing order.`;
}

const LAYER_PARAMETER = {
  type: 'string',
  description: 'Layer id or name.',
  required: true,
} as const;

function vectorLayer(layer: ViewerLayer): AgentLayer {
  const found = useAgentLayerStore.getState().layers.find((known) => known.id === layer.id);
  if (!found) {
    throw new ActionError(`${layer.name} is a ${layer.kind} layer, which carries no features`);
  }
  return found;
}

/** The column a layer is shaded by, unset for the kinds that shade by rules or an expression. */
function shadedColumn(symbology: Symbology | undefined): string | undefined {
  if (!symbology) return undefined;
  const shadesByColumn = symbology.kind === 'graduated' || symbology.kind === 'categorized';
  return shadesByColumn ? symbology.field : undefined;
}

/** The features a layer was styled from, which is what its columns come from. */
function baseGeojson(layer: AgentLayer): GeoJSON.FeatureCollection {
  return layer.sourceGeojson ?? layer.geojson;
}

/** Later in a list draws on top, so the last entry is the top of the stack. */
function positionIndex(position: Position, from: number, length: number): number {
  switch (position) {
    case 'top':
      return length - 1;
    case 'bottom':
      return 0;
    case 'up':
      return Math.min(from + 1, length - 1);
    case 'down':
      return Math.max(from - 1, 0);
  }
}

registerAction({
  name: 'layers.set_visible',
  description: 'Show or hide one layer.',
  parameters: {
    layer: LAYER_PARAMETER,
    visible: { type: 'boolean', description: 'true shows the layer, false hides it.', required: true },
  },
  run: (args) => {
    const layer = resolveViewerLayer(args.layer as string);
    const visible = args.visible as boolean;
    if (layer.visible === visible) {
      throw new ActionError(`${layer.name} is already ${visible ? 'visible' : 'hidden'}.`);
    }
    // an id can sit in two stores, so every store holding it moves together
    useAppStore.getState().setLayerVisible(layer.id, visible);
    useAgentLayerStore.getState().setLayerVisible(layer.id, visible);
    useOgcLayerStore.getState().setLayerVisible(layer.id, visible);
    useTiles3dLayerStore.getState().setLayerVisible(layer.id, visible);
    return { text: `${layer.name} is now ${visible ? 'visible' : 'hidden'}.` };
  },
});

registerAction({
  name: 'layers.set_opacity',
  description: 'Set how opaque one layer draws.',
  parameters: {
    layer: LAYER_PARAMETER,
    opacity: { type: 'number', description: '0 is invisible, 1 is fully opaque.', required: true },
  },
  run: (args) => {
    const layer = resolveViewerLayer(args.layer as string);
    const opacity = args.opacity as number;
    if (opacity < MIN_OPACITY || opacity > MAX_OPACITY) {
      throw new ActionError(`an opacity is between ${MIN_OPACITY} and ${MAX_OPACITY}, not ${opacity}`);
    }
    if (layer.kind === 'tiles3d') {
      throw new ActionError(`${layer.name} is a 3D Tiles layer, which draws at one opacity only`);
    }
    if (layer.opacity === opacity) {
      throw new ActionError(`${layer.name} already draws at ${opacity} opacity.`);
    }
    const agent = useAgentLayerStore.getState();
    useAppStore.getState().setLayerOpacity(layer.id, opacity);
    agent.setLayerOpacity(layer.id, opacity);
    agent.setRasterOpacity(layer.id, opacity);
    useOgcLayerStore.getState().setLayerOpacity(layer.id, opacity);
    return { text: `${layer.name} draws at ${opacity} opacity.` };
  },
});

registerAction({
  name: 'layers.remove',
  description: 'Take one layer off the map.',
  parameters: { layer: LAYER_PARAMETER },
  run: (args) => {
    const layer = resolveViewerLayer(args.layer as string);
    const agent = useAgentLayerStore.getState();
    useAppStore.getState().removeLayer(layer.id);
    agent.removeLayer(layer.id);
    agent.removeRasterLayer(layer.id);
    useOgcLayerStore.getState().removeLayer(layer.id);
    useTiles3dLayerStore.getState().removeLayer(layer.id);
    return { text: `${layer.name} is off the map.` };
  },
});

registerAction({
  name: 'layers.move',
  description: 'Move one layer in the drawing order.',
  parameters: {
    layer: LAYER_PARAMETER,
    position: {
      type: 'string',
      description: 'Where the layer goes.',
      enum: POSITIONS,
      required: true,
    },
  },
  run: (args) => {
    const layer = resolveViewerLayer(args.layer as string);
    const position = args.position as Position;

    const mapLayers = useAppStore.getState().layers;
    const mapIndex = mapLayers.findIndex((known) => known.id === layer.id);
    if (mapIndex >= 0) {
      const to = positionIndex(position, mapIndex, mapLayers.length);
      if (to === mapIndex) throw new ActionError(alreadyAtEnd(layer.name, position));
      useAppStore.getState().reorderLayers(mapIndex, to);
      return { text: `${layer.name} moved ${position}.` };
    }

    const rasters = useAgentLayerStore.getState().rasterLayers;
    const rasterIndex = rasters.findIndex((known) => known.id === layer.id);
    if (rasterIndex >= 0) {
      const to = positionIndex(position, rasterIndex, rasters.length);
      if (to === rasterIndex) throw new ActionError(alreadyAtEnd(layer.name, position));
      useAgentLayerStore.getState().reorderRasterLayers(rasterIndex, to);
      return { text: `${layer.name} moved ${position}.` };
    }

    throw new ActionError(`${layer.name} is a ${layer.kind} layer, which has no drawing order`);
  },
});

registerAction({
  name: 'layers.set_color',
  description: 'Paint one vector layer a single colour.',
  parameters: {
    layer: LAYER_PARAMETER,
    color: { type: 'string', description: 'A css colour, e.g. #38bdf8 or teal.', required: true },
  },
  run: (args) => {
    const layer = resolveViewerLayer(args.layer as string);
    const vector = vectorLayer(layer);
    const color = args.color as string;
    if (asColor(color, UNREADABLE_COLOR) === UNREADABLE_COLOR) {
      throw new ActionError(`${color} is not a colour`);
    }
    if (vector.color === color) {
      throw new ActionError(`${layer.name} is already ${color}.`);
    }
    useAgentLayerStore.getState().setLayerColor(vector.id, color);
    return { text: `${layer.name} is now ${color}.` };
  },
});

/**
 * Every drawing below rides on the MapLibre map, either as a deck overlay layer
 * or as a native heatmap, and its own helper switches the renderer to reach it.
 */
const RENDERER_SWITCHED = 'The map is now on the maplibre renderer, which is what draws it.';

function pointsCounted(count: number): string {
  return count === 1 ? '1 point' : `${count} points`;
}

/** The points of one named layer, refusing a layer that carries none. */
function layerPoints(named: string): { layer: ViewerLayer; points: PointRecord[] } {
  const layer = resolveViewerLayer(named);
  const points = collectPoints(vectorLayer(layer).geojson);
  if (points.length === 0) {
    throw new ActionError(`${layer.name} has no points to draw`);
  }
  return { layer, points };
}

registerAction({
  name: 'layers.add_heatmap',
  description:
    "Draw one layer's points as a heatmap, which switches the map to the maplibre renderer.",
  parameters: {
    layer: LAYER_PARAMETER,
    radius: { type: 'number', description: 'How far one point spreads, in pixels.' },
    intensity: { type: 'number', description: 'How hot the heatmap reads overall.' },
  },
  run: (args) => {
    const { layer, points } = layerPoints(args.layer as string);
    // the panel weighs a point by its own weight property, so the chat does too
    const weighed = points.map((point) => ({
      position: point.position,
      weight: pointWeight(point.properties),
    }));
    executeViewerCommand({
      action: 'add_heatmap',
      params: { data: weighed, radius: args.radius, intensity: args.intensity },
    });
    return {
      text: `Drew ${pointsCounted(points.length)} of ${layer.name} as a heatmap. ${RENDERER_SWITCHED}`,
    };
  },
});

registerAction({
  name: 'layers.add_hexbin',
  description:
    "Bin one layer's points into extruded hexagons, which switches the map to the maplibre renderer.",
  parameters: {
    layer: LAYER_PARAMETER,
    radius: { type: 'number', description: 'Hexagon radius in metres.' },
    elevation_scale: {
      type: 'number',
      description: 'How tall a hexagon stands for the points in it.',
    },
  },
  run: (args) => {
    const { layer, points } = layerPoints(args.layer as string);
    executeViewerCommand({
      action: 'add_hexbin',
      params: { data: points, radius: args.radius, elevationScale: args.elevation_scale },
    });
    return {
      text: `Binned ${pointsCounted(points.length)} of ${layer.name} into hexagons. ${RENDERER_SWITCHED}`,
    };
  },
});

registerAction({
  name: 'layers.add_scatter',
  description:
    "Draw one layer's points as filled circles, which switches the map to the maplibre renderer.",
  parameters: {
    layer: LAYER_PARAMETER,
    radius: { type: 'number', description: 'Circle radius in metres.' },
    color: { type: 'string', description: 'CSS colour of the circles. Violet by default.' },
  },
  run: (args) => {
    const { layer, points } = layerPoints(args.layer as string);
    executeViewerCommand({
      action: 'add_scatter',
      params: { data: points, radius: args.radius, color: args.color },
    });
    return {
      text: `Drew ${pointsCounted(points.length)} of ${layer.name} as circles. ${RENDERER_SWITCHED}`,
    };
  },
});

registerAction({
  name: 'layers.shade_by',
  description: 'Colour one vector layer by the values in a column.',
  parameters: {
    layer: LAYER_PARAMETER,
    column: { type: 'string', description: 'The feature property to shade by.', required: true },
  },
  run: (args) => {
    const layer = resolveViewerLayer(args.layer as string);
    const vector = vectorLayer(layer);
    const column = args.column as string;
    if (shadedColumn(vector.symbology) === column) {
      throw new ActionError(`${layer.name} is already shaded by ${column}.`);
    }

    const columns = propertyKeys({ id: vector.id, name: vector.name, geojson: baseGeojson(vector) });
    if (!columns.includes(column)) {
      throw new ActionError(`${layer.name} has no column ${column}. It carries: ${columns.join(', ')}`);
    }
    const symbology = suggestSymbology(vector, column);
    if (!symbology) {
      throw new ActionError(`${column} has too few distinct values in ${layer.name} to shade by`);
    }
    useAgentLayerStore.getState().setSymbology(layer.id, symbology);
    return { text: `${layer.name} is shaded by ${column}.` };
  },
});
