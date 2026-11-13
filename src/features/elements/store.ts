import { create } from 'zustand';
import { ASSET_ID_PROPERTY } from '../../live/types';
import type { Tiles3dLayer } from '../../store/tiles3dLayers';

// listing this many ids takes one hundred requests at the API's page size of 1000
export const ELEMENT_ID_LIMIT = 100_000;

const TILETOPIA_TILESET_PATH = /^(?:\/tiles)?\/v1\/assets\/([^/]+)\/tileset\.json$/;
const IFC_FILE_NAME = /\.ifc(zip)?$/i;

export function isIfcFileName(name: string): boolean {
  return IFC_FILE_NAME.test(name);
}

export function tiletopiaAssetId(tilesetUrl: string): string | null {
  const url = new URL(tilesetUrl, window.location.origin);
  if (url.origin !== window.location.origin) return null;
  return TILETOPIA_TILESET_PATH.exec(url.pathname)?.[1] ?? null;
}

export function elementIdOf(feature: { getProperty: (name: string) => unknown }): string | undefined {
  const id = feature.getProperty(ASSET_ID_PROPERTY);
  // tiletopia writes an empty string for a mesh that belongs to no element
  return typeof id === 'string' && id !== '' ? id : undefined;
}

export interface ElementModel {
  layerId: string;
  name: string;
  assetId: string | null;
}

export interface FocusedElement {
  id: string;
  fromScene: boolean;
}

interface ElementState {
  model: ElementModel | null;
  selected: ReadonlySet<string>;
  hidden: ReadonlySet<string>;
  isolated: ReadonlySet<string> | null;
  failed: ReadonlySet<string>;
  suppressed: ReadonlySet<string>;
  focused: FocusedElement | null;
  openModel: (layer: Tiles3dLayer) => ElementModel;
  selectElement: (
    id: string,
    options: { additive: boolean; fromScene: boolean; contents?: Iterable<string> },
  ) => void;
  focusElement: (id: string) => void;
  selectElements: (ids: Iterable<string>) => void;
  clearSelection: () => void;
  hideElements: (ids: Iterable<string>) => void;
  showHidden: () => void;
  isolateElements: (ids: Iterable<string>) => void;
  endIsolation: () => void;
  setFailed: (ids: Iterable<string>) => void;
  setSuppressed: (ids: Iterable<string>) => void;
}

export function requireWithinElementLimit(count: number): void {
  if (count > ELEMENT_ID_LIMIT) {
    throw new Error(
      `${count} elements is over the limit of ${ELEMENT_ID_LIMIT}. Narrow the choice by class or storey.`,
    );
  }
}

function idSetWithinLimit(ids: Iterable<string>): ReadonlySet<string> {
  const set = new Set(ids);
  requireWithinElementLimit(set.size);
  return set;
}

export const useElementStore = create<ElementState>((set, get) => ({
  model: null,
  selected: new Set(),
  hidden: new Set(),
  isolated: null,
  failed: new Set(),
  suppressed: new Set(),
  focused: null,

  openModel: (layer) => {
    const open = get().model;
    if (open?.layerId === layer.id) return open;
    const model = { layerId: layer.id, name: layer.name, assetId: tiletopiaAssetId(layer.url) };
    set({ model, selected: new Set(), hidden: new Set(), isolated: null, failed: new Set(), suppressed: new Set(), focused: null });
    return model;
  },

  selectElement: (id, { additive, fromScene, contents = [id] }) => {
    const chosen = [...contents];
    if (!additive) {
      set({ selected: idSetWithinLimit(chosen), focused: { id, fromScene } });
      return;
    }
    const selected = new Set(get().selected);
    const removing = chosen.every((element) => selected.has(element));
    for (const element of chosen) {
      if (removing) selected.delete(element);
      else selected.add(element);
    }
    set({ selected: idSetWithinLimit(selected), focused: { id, fromScene } });
  },

  focusElement: (id) => set({ focused: { id, fromScene: false } }),

  selectElements: (ids) => set({ selected: idSetWithinLimit(ids), focused: null }),

  clearSelection: () => set({ selected: new Set(), focused: null }),

  hideElements: (ids) => set({ hidden: idSetWithinLimit([...get().hidden, ...ids]) }),

  showHidden: () => set({ hidden: new Set() }),

  isolateElements: (ids) => set({ isolated: idSetWithinLimit(ids) }),

  endIsolation: () => set({ isolated: null }),

  setFailed: (ids) => set({ failed: idSetWithinLimit(ids) }),

  setSuppressed: (ids) => set({ suppressed: idSetWithinLimit(ids) }),
}));
