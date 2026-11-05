import { endStoreyView, enterBimMode, leaveBimMode } from '../features/bim/bimMode';
import {
  BIM_NAVIGATIONS,
  STOREY_SCOPES,
  useBimModeStore,
  type BimNavigation,
  type StoreyScope,
} from '../features/bim/store';
import { useElementStore } from '../features/elements/store';
import { ASSET_ID_PROPERTY } from '../live/types';
import { cesiumViewer } from './globe';
import { ActionError, registerAction } from './registry';
import { MODEL_LAYER_PARAMETER, countOf, drawnModel } from './tileset';

async function storeyListText(modelName: string, assetId: string | null): Promise<string> {
  if (assetId === null) return `${modelName} is not a tiletopia asset, so it has no storeys to choose from.`;
  // elementService extends a cesium class as it loads, and unit tests load this module with cesium partly mocked
  const [{ bimStoreys }, { ElementApiError }] = await Promise.all([
    import('../features/bim/storeys'),
    import('../features/elements/elementService'),
  ]);
  try {
    const storeys = await bimStoreys();
    if (storeys.length === 0) return 'Its element tree lists no storeys.';
    return `Its storeys are: ${storeys.map((storey) => storey.label).join(', ')}.`;
  } catch (failure) {
    if (failure instanceof ElementApiError) return `Its storeys could not be listed: ${failure.message}`;
    throw failure;
  }
}

registerAction({
  name: 'bim.enter',
  description:
    "Turn on BIM mode for an IFC model on the globe, with camera settings for moving inside a building and orbit or walk navigation. Answers with the model's storeys. bim.leave puts every setting back.",
  reads: true,
  parameters: {
    layer: MODEL_LAYER_PARAMETER,
    navigation: {
      type: 'string',
      description:
        'orbit circles a point the user double-clicks on the model. walk moves at eye height above a floor the user clicks, with W A S D or the arrow keys and drag to look. In walk, walls stop the camera or turn the move along them, steps up to 0.3 m high are climbed, and higher steps stop it. orbit by default, and a call while BIM mode is on changes it.',
      enum: BIM_NAVIGATIONS,
    },
  },
  run: async (args) => {
    const viewer = cesiumViewer();
    const { layer, tileset } = drawnModel(args.layer as string | undefined);
    const model = useElementStore.getState().openModel(layer);
    const navigation = (args.navigation as BimNavigation | undefined) ?? 'orbit';
    enterBimMode({ viewer, tileset, model, navigation });
    const storeys = await storeyListText(layer.name, model.assetId);
    return { text: `BIM mode is on for ${layer.name} with ${navigation} navigation. ${storeys}` };
  },
});

registerAction({
  name: 'bim.leave',
  description:
    'Turn off BIM mode and put the camera settings, the tile edge display and any isolation it changed back as they were. The camera stays where it is.',
  parameters: {},
  run: () => {
    const { session } = useBimModeStore.getState();
    if (!session) throw new ActionError('BIM mode is off, so there is nothing to leave');
    leaveBimMode();
    return { text: `BIM mode is off for ${session.model.name}, and its camera settings are back as they were.` };
  },
});

registerAction({
  name: 'bim.show_storey',
  description:
    'In BIM mode, show one storey of the model, alone or with the storeys below it, and hide the rest of the model.',
  reads: true,
  parameters: {
    storey: { type: 'string', description: 'Storey name or GlobalId, from the list bim.enter answers with.' },
    scope: {
      type: 'string',
      description:
        'only shows that storey. and_below adds the storeys of the same building whose elements sit lower. only by default.',
      enum: STOREY_SCOPES,
    },
    clear: { type: 'boolean', description: 'true shows the whole model again instead.' },
  },
  run: async (args) => {
    const { session } = useBimModeStore.getState();
    if (!session) throw new ActionError('BIM mode is off, so run bim.enter first');
    const { name } = session.model;
    if (args.clear) {
      if (args.storey !== undefined) throw new ActionError('clear takes no storey');
      endStoreyView();
      return { text: `All of ${name} is showing again.` };
    }
    if (args.storey === undefined) throw new ActionError('bim.show_storey takes a storey or clear');
    const { bimStoreys, findStorey, showStorey } = await import('../features/bim/storeys');
    const storey = findStorey(await bimStoreys(), args.storey as string);
    const scope = (args.scope as StoreyScope | undefined) ?? 'only';
    const shown = await showStorey(storey, scope);
    if (!shown) return { text: `A later storey choice or leaving BIM mode replaced ${storey.label}.` };
    const elements = countOf(shown.elementCount, 'element', 'elements');
    const sentences = [
      scope === 'only'
        ? `Showing only ${storey.label} of ${name}, ${elements}.`
        : `Showing ${storey.label} and what is below it in ${name}, ${countOf(shown.storeys.length, 'storey', 'storeys')} and ${elements}. The order comes from the middle height of each storey's elements.`,
      ...(shown.idColumn === 'not loaded'
        ? [`No tile of it has loaded yet, so its ${ASSET_ID_PROPERTY} column is unconfirmed.`]
        : []),
    ];
    return { text: sentences.join(' ') };
  },
});
