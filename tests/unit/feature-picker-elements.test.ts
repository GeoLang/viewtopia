import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const handlerActions = vi.hoisted(
  () => new Map<string, (click: { position: unknown }) => void>(),
);

// the canvas event source and the WebGL feature stay out, and the rest of cesium is real
vi.mock('cesium', async (importOriginal) => {
  const real = await importOriginal<typeof import('cesium')>();
  class ScreenSpaceEventHandler {
    setInputAction(action: (click: { position: unknown }) => void, type: number, modifier?: number) {
      handlerActions.set(`${type}:${modifier ?? ''}`, action);
    }
    destroy() {
      handlerActions.clear();
    }
  }
  class Cesium3DTileFeature {
    color: unknown = undefined;
    constructor(
      readonly tileset: unknown,
      readonly properties: Record<string, unknown>,
    ) {}
    getProperty(name: string) {
      return this.properties[name];
    }
    getPropertyIds() {
      return Object.keys(this.properties);
    }
  }
  return { ...real, ScreenSpaceEventHandler, Cesium3DTileFeature };
});

import {
  Cesium3DTileFeature,
  KeyboardEventModifier,
  ScreenSpaceEventType,
  type Viewer,
} from 'cesium';
import { useElementStore } from '../../src/features/elements/store';
import { SectionCapPick } from '../../src/features/scene/sectionCut';
import { useFeaturePickerCesium } from '../../src/hooks/useFeaturePickerCesium';
import { useAppStore } from '../../src/store/app';
import { useFeaturePickerStore } from '../../src/store/featurePicker';
import { useTiles3dLayerStore } from '../../src/store/tiles3dLayers';

const MODEL_LAYER = { id: 'model', name: 'model.ifc', url: '/tiles/v1/assets/model/tileset.json', visible: true };
const TILESET = { name: 'the model tileset' };

const pick = vi.fn();

function tileFeature(properties: Record<string, unknown>, tileset: unknown = TILESET) {
  const FeatureClass = Cesium3DTileFeature as unknown as new (
    tileset: unknown,
    properties: Record<string, unknown>,
  ) => Cesium3DTileFeature;
  return new FeatureClass(tileset, properties);
}

function armPicker() {
  const viewer = {
    isDestroyed: () => false,
    scene: { canvas: document.createElement('canvas'), pick },
    clock: {},
  } as unknown as Viewer;
  useFeaturePickerStore.setState({ enabled: true, selected: null });
  renderHook(() => useFeaturePickerCesium({ current: viewer }));
}

function click(picked: unknown, modifier?: KeyboardEventModifier) {
  pick.mockReturnValue(picked);
  const action = handlerActions.get(`${ScreenSpaceEventType.LEFT_CLICK}:${modifier ?? ''}`);
  if (!action) throw new Error('no click action is bound');
  action({ position: {} });
}

beforeEach(() => {
  handlerActions.clear();
  pick.mockReset();
  useElementStore.setState({
    model: null,
    selected: new Set(),
    hidden: new Set(),
    isolated: null,
    focused: null,
  });
  useTiles3dLayerStore.setState({ layers: [MODEL_LAYER], loaded: { model: TILESET as never } });
  useAppStore.setState({ activePanel: 'modelElements', renderer: 'cesium' });
});

describe('picking an element in the scene', () => {
  it('selects it through the store instead of painting one feature', () => {
    armPicker();
    const feature = tileFeature({ asset_id: 'wall' });

    click(feature);

    const elements = useElementStore.getState();
    expect(elements.model?.layerId).toBe('model');
    expect([...elements.selected]).toEqual(['wall']);
    expect(elements.focused).toEqual({ id: 'wall', fromScene: true });
    expect(feature.color).toBeUndefined();
  });

  it('leaves the element panel open', () => {
    armPicker();

    click(tileFeature({ asset_id: 'wall' }));

    expect(useAppStore.getState().activePanel).toBe('modelElements');
    expect(useFeaturePickerStore.getState().selected).toBeNull();
  });

  it('shows the feature rows in Feature Info when the element panel is closed', () => {
    useAppStore.setState({ activePanel: null });
    armPicker();

    click(tileFeature({ asset_id: 'wall' }));

    expect(useAppStore.getState().activePanel).toBe('featurePicker');
    expect(useFeaturePickerStore.getState().selected).toEqual([{ id: 'asset_id', value: 'wall' }]);
    expect([...useElementStore.getState().selected]).toEqual(['wall']);
  });

  it.each([KeyboardEventModifier.SHIFT, KeyboardEventModifier.CTRL])(
    'adds to the selection with modifier %s, and a second click takes it back out',
    (modifier) => {
      armPicker();
      click(tileFeature({ asset_id: 'wall' }));

      click(tileFeature({ asset_id: 'door' }), modifier);
      expect([...useElementStore.getState().selected]).toEqual(['wall', 'door']);

      click(tileFeature({ asset_id: 'door' }), modifier);
      expect([...useElementStore.getState().selected]).toEqual(['wall']);
    },
  );

  it('selects the element of a clicked section cap, with its row in Feature Info when the element panel is closed', () => {
    useAppStore.setState({ activePanel: null });
    armPicker();

    click({ primitive: {}, id: new SectionCapPick(TILESET as never, 'slab') });

    const elements = useElementStore.getState();
    expect(elements.model?.layerId).toBe('model');
    expect([...elements.selected]).toEqual(['slab']);
    expect(elements.focused).toEqual({ id: 'slab', fromScene: true });
    expect(useFeaturePickerStore.getState().selected).toEqual([{ id: 'asset_id', value: 'slab' }]);

    click({ primitive: {}, id: new SectionCapPick(TILESET as never, 'wall') }, KeyboardEventModifier.SHIFT);
    expect([...useElementStore.getState().selected]).toEqual(['slab', 'wall']);
  });

  it('clears the selection on a click that hits nothing', () => {
    armPicker();
    click(tileFeature({ asset_id: 'wall' }));

    click(undefined);

    expect(useElementStore.getState().selected.size).toBe(0);
  });

  it('still paints a feature with no element id, and one on a tileset no layer draws', () => {
    armPicker();
    const noId = tileFeature({ height: 3 });
    click(noId);
    expect(noId.color).toBeDefined();

    const noLayer = tileFeature({ asset_id: 'wall' }, { name: 'not a layer' });
    click(noLayer);
    expect(noLayer.color).toBeDefined();
    expect(useElementStore.getState().selected.size).toBe(0);
  });
});
