import type { Cesium3DTileset } from 'cesium';
import { useLayerLoadErrorStore } from '../../store/layerLoadErrors';
import { useTiles3dLayerStore, type Tiles3dLayer } from '../../store/tiles3dLayers';
import { getActiveCesiumViewer } from '../../viewer/registry';
import { enterBimMode, leaveBimMode } from '../bim/bimMode';
import {
  BIM_NAVIGATIONS,
  STOREY_SCOPES,
  storeyViewShowing,
  useBimModeStore,
  type BimNavigation,
  type StoreyScope,
} from '../bim/store';
import { tiletopiaAssetId, useElementStore } from '../elements/store';
import { CLIP_AXES } from '../scene/clipping';
import {
  applyTilesetSection,
  disableTilesetSection,
  readFacePlanes,
  readTilesetSection,
  replaceFacePlanes,
  setTilesetSectionOutline,
  tilesetSectionOutlined,
  type FacePlane,
  type TilesetSection,
} from '../scene/tilesetSection';

export interface SavedModelSection extends TilesetSection {
  outlined: boolean;
}

export interface SavedStoreyView {
  storeyGlobalId: string;
  scope: StoreyScope;
}

export interface SavedBimMode {
  navigation: BimNavigation;
  storeyView: SavedStoreyView | null;
}

export interface SavedModelState {
  selected: string[];
  hidden: string[];
  isolated: string[] | null;
  section: SavedModelSection | null;
  facePlanes?: FacePlane[];
  bimMode: SavedBimMode | null;
}

const pendingRestores = new Map<string, SavedModelState>();
let latestRestore = 0;

function messageOf(failure: unknown): string {
  return failure instanceof Error ? failure.message : String(failure);
}

function storeyGlobalId(storeyKey: string): string {
  const storey = useBimModeStore.getState().storeys?.find((known) => known.node.key === storeyKey);
  if (!storey) throw new Error(`BIM mode shows the storey ${storeyKey}, which its storey list lacks.`);
  return storey.node.id;
}

function liveModelState(layer: Tiles3dLayer, tileset: Cesium3DTileset | undefined): SavedModelState {
  const elements = useElementStore.getState();
  const bim = useBimModeStore.getState();
  const open = elements.model?.layerId === layer.id;
  const inBimMode = bim.session?.model.layerId === layer.id;
  const showing = inBimMode ? storeyViewShowing(bim.storeyView, elements.isolated) : null;
  // showStorey replaces the isolated set, and restoring the storey view isolates it again
  const isolated = showing ? showing.isolatedBefore : elements.isolated;
  const section = tileset ? readTilesetSection(tileset) : null;
  const facePlanes = tileset ? readFacePlanes(tileset) : [];
  return {
    selected: open ? [...elements.selected] : [],
    hidden: open ? [...elements.hidden] : [],
    isolated: open && isolated ? [...isolated] : null,
    section: tileset && section ? { ...section, outlined: tilesetSectionOutlined(tileset) } : null,
    ...(facePlanes.length > 0 ? { facePlanes: facePlanes.map((plane) => ({ ...plane })) } : {}),
    bimMode: inBimMode
      ? {
          navigation: bim.navigation,
          storeyView: showing
            ? { storeyGlobalId: storeyGlobalId(showing.storeyKey), scope: showing.scope }
            : null,
        }
      : null,
  };
}

export function captureModelStates(): Record<string, SavedModelState> {
  const { layers, loaded } = useTiles3dLayerStore.getState();
  const statesByAsset: Record<string, SavedModelState> = {};
  for (const layer of layers) {
    const assetId = tiletopiaAssetId(layer.url);
    if (assetId === null) continue;
    // addTilesetToGlobe can put a second layer on the globe for an asset already there
    if (assetId in statesByAsset) continue;
    statesByAsset[assetId] = pendingRestores.get(assetId) ?? liveModelState(layer, loaded[layer.id]);
  }
  return statesByAsset;
}

export function readModelStates(value: unknown): Record<string, unknown> {
  if (value === undefined) return {};
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('project file: modelStatesByAsset is not an object keyed by asset id');
  }
  return { ...value };
}

function requireObject(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${field} is not an object`);
  }
  return { ...value };
}

function requireElementIds(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || !value.every((id) => typeof id === 'string')) {
    throw new Error(`${field} is not a list of element ids`);
  }
  return value;
}

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${field} is not true or false`);
  return value;
}

function requireOneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  const match = allowed.find((candidate) => candidate === value);
  if (match === undefined) throw new Error(`${field} is not one of ${allowed.join(', ')}`);
  return match;
}

function readSavedSection(value: unknown): SavedModelSection | null {
  if (value === null) return null;
  const section = requireObject(value, 'section');
  const { position } = section;
  if (typeof position !== 'number' || !Number.isFinite(position)) {
    throw new Error('section.position is not a number');
  }
  return {
    axis: requireOneOf(section.axis, CLIP_AXES, 'section.axis'),
    position,
    flip: requireBoolean(section.flip, 'section.flip'),
    enabled: requireBoolean(section.enabled, 'section.enabled'),
    outlined: requireBoolean(section.outlined, 'section.outlined'),
  };
}

function readSavedStoreyView(value: unknown): SavedStoreyView | null {
  if (value === null) return null;
  const storeyView = requireObject(value, 'bimMode.storeyView');
  const { storeyGlobalId } = storeyView;
  if (typeof storeyGlobalId !== 'string') throw new Error('bimMode.storeyView.storeyGlobalId is not a string');
  return { storeyGlobalId, scope: requireOneOf(storeyView.scope, STOREY_SCOPES, 'bimMode.storeyView.scope') };
}

function readSavedBimMode(value: unknown): SavedBimMode | null {
  if (value === null) return null;
  const bimMode = requireObject(value, 'bimMode');
  return {
    navigation: requireOneOf(bimMode.navigation, BIM_NAVIGATIONS, 'bimMode.navigation'),
    storeyView: readSavedStoreyView(bimMode.storeyView),
  };
}

function readSavedFacePlanes(value: unknown): FacePlane[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error('facePlanes is not a list');
  return value.map((plane, index) => {
    const face = requireObject(plane, `facePlanes[${index}]`);
    const normal = face.normal;
    if (
      !Array.isArray(normal) ||
      normal.length !== 3 ||
      !normal.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate))
    ) {
      throw new Error(`facePlanes[${index}].normal is not a direction`);
    }
    if (typeof face.offset !== 'number' || !Number.isFinite(face.offset)) {
      throw new Error(`facePlanes[${index}].offset is not a number`);
    }
    if (typeof face.id !== 'string' || face.id.length === 0) {
      throw new Error(`facePlanes[${index}].id is not a string`);
    }
    return { id: face.id, normal: [normal[0], normal[1], normal[2]], offset: face.offset };
  });
}

function readSavedModelState(value: unknown): SavedModelState {
  const saved = requireObject(value, 'the saved state');
  const facePlanes = readSavedFacePlanes(saved.facePlanes);
  return {
    selected: requireElementIds(saved.selected, 'selected'),
    hidden: requireElementIds(saved.hidden, 'hidden'),
    isolated: saved.isolated === null ? null : requireElementIds(saved.isolated, 'isolated'),
    section: readSavedSection(saved.section),
    ...(facePlanes ? { facePlanes } : {}),
    bimMode: readSavedBimMode(saved.bimMode),
  };
}

// loadedTileset stops waiting after a minute, and a tileset on a 2D renderer loads only after a switch to Cesium
function tilesetOnceLoaded(layerId: string): Promise<Cesium3DTileset | null> {
  return new Promise((resolve, reject) => {
    const check = (): void => {
      const { layers, loaded } = useTiles3dLayerStore.getState();
      const tileset = loaded[layerId];
      const layerGone = !layers.some((layer) => layer.id === layerId);
      // useTilesets3dCesium records a failed tileset.json here and loads it again only on a retry
      const loadError = useLayerLoadErrorStore.getState().errors[layerId];
      if (!tileset && !layerGone && loadError === undefined) return;
      unsubscribeLayers();
      unsubscribeErrors();
      if (tileset || layerGone) {
        resolve(tileset ?? null);
        return;
      }
      reject(new Error(`its tileset did not load: ${loadError}`));
    };
    const unsubscribeLayers = useTiles3dLayerStore.subscribe(check);
    const unsubscribeErrors = useLayerLoadErrorStore.subscribe(check);
    check();
  });
}

async function restoreElementSets(
  assetId: string,
  layer: Tiles3dLayer,
  saved: SavedModelState,
  isLatest: () => boolean,
): Promise<string[]> {
  const savedIds = new Set([...saved.selected, ...saved.hidden, ...(saved.isolated ?? [])]);
  if (savedIds.size === 0) {
    const elements = useElementStore.getState();
    if (elements.model?.layerId !== layer.id) return [];
    elements.clearSelection();
    elements.showHidden();
    elements.endIsolation();
    return [];
  }
  // elementService extends a cesium class as it loads, and unit tests load this module with cesium partly mocked
  const { TiletopiaElementService, readElementsById } = await import('../elements/elementService');
  let notFound: string[];
  try {
    ({ notFound } = await readElementsById(new TiletopiaElementService(assetId), savedIds));
  } catch (failure) {
    return [
      `The saved selected, hidden and isolated elements of ${layer.name} could not be checked, so none were applied: ${messageOf(failure)}`,
    ];
  }
  if (!isLatest()) return [];
  const missing = new Set(notFound);
  const exists = (id: string) => !missing.has(id);
  const elements = useElementStore.getState();
  elements.openModel(layer);
  elements.selectElements(saved.selected.filter(exists));
  elements.showHidden();
  elements.hideElements(saved.hidden.filter(exists));
  const isolated = (saved.isolated ?? []).filter(exists);
  if (isolated.length > 0) elements.isolateElements(isolated);
  else elements.endIsolation();
  if (missing.size === 0) return [];
  return [
    `${missing.size} of the ${savedIds.size} saved element ids of ${layer.name} no longer exist in the model, so they were left out.`,
  ];
}

async function restoreBimMode(
  layer: Tiles3dLayer,
  tileset: Cesium3DTileset,
  bimMode: SavedBimMode,
  isLatest: () => boolean,
): Promise<string[]> {
  const viewer = getActiveCesiumViewer();
  if (!viewer) return [`${layer.name} was saved in BIM mode, and no Cesium globe is on screen to enter it on.`];
  const model = useElementStore.getState().openModel(layer);
  try {
    enterBimMode({ viewer, tileset, model, navigation: bimMode.navigation });
  } catch (failure) {
    return [`${layer.name} was saved in BIM mode, which could not be entered: ${messageOf(failure)}`];
  }
  const { storeyView } = bimMode;
  if (!storeyView) return [];
  // storeys imports elementService, which extends a cesium class as it loads
  const { bimStoreys, findStorey, showStorey } = await import('../bim/storeys');
  try {
    const storey = findStorey(await bimStoreys(), storeyView.storeyGlobalId);
    if (isLatest()) await showStorey(storey, storeyView.scope);
  } catch (failure) {
    return [`The saved storey view of ${layer.name} was not shown: ${messageOf(failure)}`];
  }
  return [];
}

function layerDrawingAsset(assetId: string): Tiles3dLayer | undefined {
  return useTiles3dLayerStore.getState().layers.find((known) => tiletopiaAssetId(known.url) === assetId);
}

async function restoreModelState(
  assetId: string,
  saved: SavedModelState,
  isLatest: () => boolean,
): Promise<string[]> {
  const layer = layerDrawingAsset(assetId);
  if (!layer) {
    return [`The project saved the state of asset ${assetId}, and none of its 3D model layers draws that asset.`];
  }
  const tileset = await tilesetOnceLoaded(layer.id);
  if (!tileset || !isLatest()) return [];
  const notes = await restoreElementSets(assetId, layer, saved, isLatest);
  if (!isLatest()) return [];
  const requestRender = () => getActiveCesiumViewer()?.scene.requestRender();
  if (saved.section) {
    const { outlined, ...section } = saved.section;
    applyTilesetSection(tileset, section, requestRender);
    setTilesetSectionOutline(tileset, { visible: outlined }, requestRender);
  } else {
    disableTilesetSection(tileset, requestRender);
  }
  replaceFacePlanes(tileset, saved.facePlanes ?? [], requestRender);
  if (saved.bimMode) notes.push(...(await restoreBimMode(layer, tileset, saved.bimMode, isLatest)));
  return notes;
}

export async function restoreModelStates(statesByAsset: unknown): Promise<string[]> {
  const entries = Object.entries(readModelStates(statesByAsset));
  latestRestore += 1;
  const restore = latestRestore;
  const isLatest = () => restore === latestRestore;
  leaveBimMode();
  pendingRestores.clear();
  const notes = await Promise.all(
    entries.map(async ([assetId, value]) => {
      const modelName = layerDrawingAsset(assetId)?.name ?? `asset ${assetId}`;
      try {
        const saved = readSavedModelState(value);
        pendingRestores.set(assetId, saved);
        return await restoreModelState(assetId, saved, isLatest);
      } catch (failure) {
        return [`The saved state of ${modelName} was not restored: ${messageOf(failure)}`];
      } finally {
        if (isLatest()) pendingRestores.delete(assetId);
      }
    }),
  );
  return isLatest() ? notes.flat() : [];
}
