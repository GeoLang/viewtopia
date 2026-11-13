/**
 * Styling the 3D tilesets on the globe, through the same helpers the Style
 * Editor panel's buttons run. Nothing names one tileset apart from the others,
 * so each of these styles every tileset the Cesium scene holds.
 */

import type { Cesium3DTileset } from 'cesium';
import type { ElementFilter, ResolvedElements } from '../features/elements/elementService';
import { useElementStore, type ElementModel } from '../features/elements/store';
import { CLIP_AXES, DEFAULT_CLIP_AXIS, type ClipAxis } from '../features/scene/clipping';
import {
  applyTilesetSection,
  disableTilesetSection,
  replaceFacePlanes,
  tilesetSectionRange,
} from '../features/scene/tilesetSection';
import { ASSET_ID_PROPERTY } from '../live/types';
import { useTiles3dLayerStore, type Tiles3dLayer } from '../store/tiles3dLayers';
import { elementIdColumn } from '../viewer/tilesetStyle';
import {
  colorByClassification,
  colorByHeight,
  colorByProperty,
  resetStyle,
  setOpacity,
  setPointSize,
} from '../viewer/tileStyles';
import { cesiumViewer } from './globe';
import { resolveViewerLayer } from './layerIndex';
import { ActionError, registerAction, type ActionArguments, type ActionParameter } from './registry';

const MIN_OPACITY = 0;
const MAX_OPACITY = 1;

/**
 * How many tilesets the style reached. Refuses when there is no globe to hold a
 * tileset, and when the globe holds none.
 */
function styled(apply: () => number): number {
  cesiumViewer();
  const count = apply();
  if (count === 0) {
    throw new ActionError('no 3D tileset is loaded on the globe, so there is nothing to style');
  }
  return count;
}

function tilesets(count: number): string {
  return count === 1 ? '1 tileset' : `${count} tilesets`;
}

registerAction({
  name: 'tileset.shade_by_classification',
  description:
    'Colour every 3D tileset on the globe by its LIDAR classification codes, so ground, vegetation, buildings and water each take a colour.',
  parameters: {},
  run: () => {
    const count = styled(colorByClassification);
    return { text: `Coloured ${tilesets(count)} by classification code.` };
  },
});

registerAction({
  name: 'tileset.shade_by_height',
  description:
    'Colour every 3D tileset on the globe by height band, green near the ground through red at the top.',
  parameters: {},
  run: () => {
    const count = styled(colorByHeight);
    return { text: `Coloured ${tilesets(count)} by height band.` };
  },
});

registerAction({
  name: 'tileset.shade_by_property',
  description: "Colour every 3D tileset on the globe by one feature property's values.",
  parameters: {
    property: {
      type: 'string',
      description: 'Feature property the colours are spread over, as the tileset names it.',
      required: true,
    },
  },
  run: (args) => {
    const property = (args.property as string).trim();
    if (property === '') {
      throw new ActionError('property is the name of a feature property, not blank');
    }
    const count = styled(() => colorByProperty(property));
    return { text: `Coloured ${tilesets(count)} by ${property}.` };
  },
});

registerAction({
  name: 'tileset.reset_style',
  description:
    'Take any colouring, fading and point size back off every 3D tileset on the globe, so the tiles draw as they came.',
  parameters: {},
  run: () => {
    const count = styled(resetStyle);
    return { text: `Took the styling off ${tilesets(count)}.` };
  },
});

registerAction({
  name: 'tileset.set_opacity',
  description:
    'Fade every 3D tileset on the globe to a uniform white at the opacity given, which also takes off any colouring it had.',
  parameters: {
    opacity: { type: 'number', description: '0 is invisible, 1 is fully opaque.', required: true },
  },
  run: (args) => {
    const opacity = args.opacity as number;
    if (opacity < MIN_OPACITY || opacity > MAX_OPACITY) {
      throw new ActionError(`an opacity is between ${MIN_OPACITY} and ${MAX_OPACITY}, not ${opacity}`);
    }
    const count = styled(() => setOpacity(opacity));
    return { text: `Faded ${tilesets(count)} to a white at ${opacity} opacity.` };
  },
});

registerAction({
  name: 'tileset.set_point_size',
  description:
    'Draw the points of every 3D tileset on the globe at a size in pixels, which also takes off any colouring it had.',
  parameters: {
    size: {
      type: 'number',
      description: 'Width of one point in pixels, above 0. Only a point cloud has points to draw.',
      required: true,
    },
  },
  run: (args) => {
    const size = args.size as number;
    if (size <= 0) {
      throw new ActionError(`a point size is a width in pixels above 0, not ${size}`);
    }
    const count = styled(() => setPointSize(size));
    return { text: `Drew the points of ${tilesets(count)} at ${size} pixels.` };
  },
});

export const MODEL_LAYER_PARAMETER: ActionParameter = {
  type: 'string',
  description:
    'The 3D model layer, by id or name. Needed only when more than one model is on the globe.',
};

const ELEMENT_CHOICE_PARAMETERS: Record<string, ActionParameter> = {
  layer: MODEL_LAYER_PARAMETER,
  ids: {
    type: 'array',
    description:
      'IFC GlobalIds of the elements, as a list of strings. An id of a storey, space, building or site acts on what is inside it. Send this or filter, not both.',
  },
  filter: {
    type: 'object',
    description:
      'Every element this element filter matches, resolved by the viewer, so a large choice costs one call. Send this or ids, not both. For example {"@classFullName": "IfcDoor", "@storey": "Level 3"} or {"Pset_DoorCommon.FireRating": {"$like": "%60%"}}. Keys are a property key such as Element.Tag, or @label, @classFullName, @id, @storey. Operators are $eq, $ne, $in, $like, $gt, $gte, $lt, $lte, $and, $or.',
  },
};

function modelLayer(wanted: string | undefined): Tiles3dLayer {
  const { layers } = useTiles3dLayerStore.getState();
  if (wanted !== undefined) {
    const resolved = resolveViewerLayer(wanted);
    const layer = layers.find((known) => known.id === resolved.id);
    if (!layer) throw new ActionError(`${resolved.name} is not a 3D model layer`);
    return layer;
  }
  const open = useElementStore.getState().model;
  const opened = layers.find((known) => known.id === open?.layerId);
  if (opened) return opened;
  if (layers.length === 0) throw new ActionError('no 3D model layer is on the globe');
  if (layers.length > 1) {
    const names = layers.map((known) => known.name).join(', ');
    throw new ActionError(`layer is required when several models are on the globe: ${names}`);
  }
  return layers[0];
}

export function drawnModel(wanted: string | undefined): { layer: Tiles3dLayer; tileset: Cesium3DTileset } {
  cesiumViewer();
  const layer = modelLayer(wanted);
  const tileset = useTiles3dLayerStore.getState().loaded[layer.id];
  if (!tileset) throw new ActionError(`${layer.name} has not finished loading`);
  return { layer, tileset };
}

async function chosenElements(
  action: string,
  args: ActionArguments,
  model: ElementModel,
): Promise<ResolvedElements> {
  if (args.ids !== undefined && args.filter !== undefined) {
    throw new ActionError(`${action} takes ids or filter, and it was sent both`);
  }
  if (args.ids === undefined && args.filter === undefined) {
    throw new ActionError(`${action} takes ids or filter, and it was sent neither`);
  }
  const ids = (args.ids ?? []) as unknown[];
  const notText = ids.find((id) => typeof id !== 'string');
  if (notText !== undefined) {
    throw new ActionError(`ids is a list of GlobalId strings, not ${JSON.stringify(notText)}`);
  }
  if (model.assetId === null) {
    throw new ActionError(`${model.name} is not a tiletopia asset, so its elements cannot be checked`);
  }
  // elementService extends a cesium class as it loads, and unit tests load this module with cesium partly mocked
  const { TiletopiaElementService, resolveElementFilter, resolveElementIds } = await import(
    '../features/elements/elementService'
  );
  const service = new TiletopiaElementService(model.assetId);
  if (args.filter !== undefined) return resolveElementFilter(service, args.filter as ElementFilter);
  return resolveElementIds(service, ids as string[]);
}

export function countOf(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function leftOut({ notFound, withoutMesh }: ResolvedElements): string[] {
  return [
    ...(notFound.length > 0 ? [`${countOf(notFound.length, 'id', 'ids')} not found`] : []),
    ...(withoutMesh.length > 0
      ? [`${countOf(withoutMesh.length, 'element has', 'elements have')} no mesh`]
      : []),
  ];
}

function elementCount(count: number): string {
  return countOf(count, 'element', 'elements');
}

const ELEMENT_ACTIONS = [
  {
    name: 'tileset.select_elements',
    description:
      'Highlight elements of an IFC model on the globe, in every tile they appear in. Replaces the current selection.',
    clearDescription: 'true takes the highlight off everything instead.',
    apply: (ids: string[]) => useElementStore.getState().selectElements(ids),
    applied: (count: number, model: string) => `Selected ${elementCount(count)} in ${model}`,
    clear: () => useElementStore.getState().clearSelection(),
    cleared: (model: string) => `Nothing is selected in ${model}.`,
  },
  {
    name: 'tileset.isolate_elements',
    description:
      'Show only these elements of an IFC model on the globe and hide the rest of it. Replaces any earlier isolation.',
    clearDescription: 'true ends the isolation instead, so the rest comes back.',
    apply: (ids: string[]) => useElementStore.getState().isolateElements(ids),
    applied: (count: number, model: string) => `Isolated ${elementCount(count)} in ${model}`,
    clear: () => useElementStore.getState().endIsolation(),
    cleared: (model: string) => `${model} is no longer isolated.`,
  },
  {
    name: 'tileset.hide_elements',
    description:
      'Hide elements of an IFC model on the globe, in every tile they appear in. Adds to what is already hidden.',
    clearDescription: 'true shows every hidden element again instead.',
    apply: (ids: string[]) => useElementStore.getState().hideElements(ids),
    applied: (count: number, model: string) => `Hid ${elementCount(count)} in ${model}`,
    clear: () => useElementStore.getState().showHidden(),
    cleared: (model: string) => `Nothing is hidden in ${model}.`,
  },
];

for (const action of ELEMENT_ACTIONS) {
  registerAction({
    name: action.name,
    description: action.description,
    // dispatch sends only a reads action's text back to the model, which needs the resolved count
    reads: true,
    parameters: {
      ...ELEMENT_CHOICE_PARAMETERS,
      clear: { type: 'boolean', description: action.clearDescription },
    },
    run: async (args) => {
      const { layer, tileset } = drawnModel(args.layer as string | undefined);
      const model = useElementStore.getState().openModel(layer);
      if (args.clear) {
        const chosen = ['ids', 'filter'].filter((key) => args[key] !== undefined);
        if (chosen.length > 0) throw new ActionError(`clear takes no choice of elements, not ${chosen.join(', ')}`);
        action.clear();
        return { text: action.cleared(layer.name) };
      }
      const column = elementIdColumn(tileset);
      if (column === 'absent') {
        throw new ActionError(
          `${layer.name} has no ${ASSET_ID_PROPERTY} column on its tile features, so nothing in it can be chosen by element`,
        );
      }
      const resolved = await chosenElements(action.name, args, model);
      const notes = leftOut(resolved);
      if (resolved.located.length === 0) {
        const why = notes.length > 0 ? `: ${notes.join(', ')}` : '';
        throw new ActionError(`no element of ${layer.name} with a mesh matches that choice, so nothing changed${why}`);
      }
      action.apply(resolved.located.map((row) => row.id));
      if (column === 'not loaded') notes.push(`no tile of it has loaded yet, so its ${ASSET_ID_PROPERTY} column is unconfirmed`);
      const applied = action.applied(resolved.located.length, layer.name);
      return { text: `${[applied, ...notes].join(', ')}.` };
    },
  });
}

registerAction({
  name: 'tileset.section',
  description:
    "Cut a 3D model on the globe with one plane along an axis of the model's own frame, to see inside it.",
  parameters: {
    layer: MODEL_LAYER_PARAMETER,
    on: { type: 'boolean', description: 'true cuts the model, false puts it back whole.', required: true },
    axis: {
      type: 'string',
      description: `Axis of the model's own frame the cut is made along. ${DEFAULT_CLIP_AXIS} by default, which is up.`,
      enum: CLIP_AXES,
    },
    position: {
      type: 'number',
      description: "Metres along the axis from the origin of the model's frame. The middle of the model by default.",
    },
    flip: {
      type: 'boolean',
      description: 'false keeps the part below the position on the axis, true keeps the part above. false by default.',
    },
  },
  run: (args) => {
    const viewer = cesiumViewer();
    const { layer, tileset } = drawnModel(args.layer as string | undefined);
    const requestRender = () => viewer.scene.requestRender();
    if (!args.on) {
      disableTilesetSection(tileset, requestRender);
      replaceFacePlanes(tileset, [], requestRender);
      return { text: `${layer.name} is whole again.` };
    }
    const axis = (args.axis as ClipAxis | undefined) ?? DEFAULT_CLIP_AXIS;
    const range = tilesetSectionRange(tileset, axis);
    const position = (args.position as number | undefined) ?? (range.min + range.max) / 2;
    if (position < range.min || position > range.max) {
      throw new ActionError(
        `position on the ${axis} axis of ${layer.name} is between ${range.min.toFixed(1)} and ${range.max.toFixed(1)} metres, not ${position}`,
      );
    }
    const flip = (args.flip as boolean | undefined) ?? false;
    applyTilesetSection(tileset, { axis, position, flip, enabled: true }, requestRender);
    return {
      text: `${layer.name} is cut along its ${axis} axis at ${position.toFixed(1)} metres, keeping the part ${flip ? 'above' : 'below'}.`,
    };
  },
});
