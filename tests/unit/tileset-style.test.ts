import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { Cesium3DTileset, Color, Model, type Cesium3DTileFeature, type Viewer } from 'cesium';
import { ELEMENT_ID_LIMIT, useElementStore } from '../../src/features/elements/store';
import { useElementStyleCesium } from '../../src/features/elements/useElementStyleCesium';
import { useTiles3dLayerStore } from '../../src/store/tiles3dLayers';
import { setActiveCesiumViewer } from '../../src/viewer/registry';
import { colorByHeight, resetStyle, setOpacity, setPointSize } from '../../src/viewer/tileStyles';
import { elementIdColumn, setTilesetStyleInputs, tileHighlightColor } from '../../src/viewer/tilesetStyle';
import { fakeTileFeature } from './stubs/fakeElementServer';

const MODEL_LAYER = { id: 'model', name: 'model.ifc', url: '/tiles/v1/assets/model/tileset.json', visible: true };

const RULE_CONDITIONS = (fallback: string | undefined) => [
  ['${asset_id} === "BOX-01"', 'color("#e74c3c")'],
  ['true', fallback ?? 'color("white")'],
];

function fakeTileset(): Cesium3DTileset {
  // an own style field stands in for the prototype's accessor, which needs the WebGL style engine
  return Object.create(Cesium3DTileset.prototype, {
    style: { value: undefined, writable: true },
    isDestroyed: { value: () => false },
  }) as Cesium3DTileset;
}

function feature(id: string | undefined): Cesium3DTileFeature {
  return fakeTileFeature(id === undefined ? {} : { asset_id: id }) as unknown as Cesium3DTileFeature;
}

function shown(tileset: Cesium3DTileset, id: string | undefined): unknown {
  return tileset.style?.show.evaluate(feature(id));
}

function colorOf(tileset: Cesium3DTileset, id: string | undefined): Color {
  const style = tileset.style;
  if (!style) throw new Error('the tileset has no style');
  return style.color.evaluateColor(feature(id), new Color());
}

beforeEach(() => {
  useElementStore.setState({
    model: null,
    selected: new Set(),
    hidden: new Set(),
    isolated: null,
    failed: new Set(),
    suppressed: new Set(),
    focused: null,
  });
  useTiles3dLayerStore.setState({ layers: [], loaded: {} });
});

afterEach(() => {
  setActiveCesiumViewer(null);
});

describe('the one owner of tileset.style', () => {
  it('writes the base style as given, and no style when every input is gone', () => {
    const tileset = fakeTileset();

    setTilesetStyleInputs(tileset, { base: { color: 'color("white", 0.4)' } });
    expect(tileset.style?.style.color).toBe('color("white", 0.4)');

    setTilesetStyleInputs(tileset, { base: undefined });
    expect(tileset.style).toBeUndefined();
  });

  it('keeps the asset rule through a base style change, falling back to a plain base colour', () => {
    const tileset = fakeTileset();
    setTilesetStyleInputs(tileset, { assetColorConditions: RULE_CONDITIONS });
    setTilesetStyleInputs(tileset, { base: { color: 'color("blue")' } });

    expect(Color.equals(colorOf(tileset, 'BOX-01'), Color.fromCssColorString('#e74c3c'))).toBe(true);
    expect(Color.equals(colorOf(tileset, 'other'), Color.BLUE)).toBe(true);

    setTilesetStyleInputs(tileset, { assetColorConditions: undefined });
    expect(tileset.style?.style.color).toBe('color("blue")');
  });

  it('keeps the base point size under a rule', () => {
    const tileset = fakeTileset();
    setTilesetStyleInputs(tileset, { base: { pointSize: '6' } });
    setTilesetStyleInputs(tileset, { assetColorConditions: RULE_CONDITIONS });

    expect(tileset.style?.style.pointSize).toBe('6');
  });

  it('routes the style editor helpers through the owner, which keeps a rule on the tileset', () => {
    const tileset = fakeTileset();
    const primitives = [tileset];
    setActiveCesiumViewer({
      isDestroyed: () => false,
      scene: { primitives: { length: 1, get: (index: number) => primitives[index] } },
    } as unknown as Viewer);
    setTilesetStyleInputs(tileset, { assetColorConditions: RULE_CONDITIONS });

    expect(setOpacity(0.4)).toBe(1);
    expect(Color.equals(colorOf(tileset, 'BOX-01'), Color.fromCssColorString('#e74c3c'))).toBe(true);
    expect(colorOf(tileset, 'other').alpha).toBeCloseTo(0.4);

    resetStyle();
    expect(Color.equals(colorOf(tileset, 'BOX-01'), Color.fromCssColorString('#e74c3c'))).toBe(true);

    setPointSize(3);
    colorByHeight();
    setTilesetStyleInputs(tileset, { assetColorConditions: undefined });
    expect(JSON.stringify(tileset.style?.style.color)).toContain('#d73027');
  });
});

describe('element inputs', () => {
  const elements = (changes: Partial<{ selected: string[]; hidden: string[]; isolated: string[] }>) => ({
    selected: new Set(changes.selected),
    hidden: new Set(changes.hidden),
    isolated: changes.isolated ? new Set(changes.isolated) : null,
  });

  it('hides an element on every feature carrying its id, in any tile', () => {
    const tileset = fakeTileset();
    setTilesetStyleInputs(tileset, { elements: elements({ hidden: ['wall'] }) });

    const fragmentInOneTile = tileset.style?.show.evaluate(feature('wall'));
    const fragmentInAnotherTile = tileset.style?.show.evaluate(feature('wall'));
    expect([fragmentInOneTile, fragmentInAnotherTile]).toEqual([false, false]);
    expect(shown(tileset, 'door')).toBe(true);
  });

  it('isolates, hiding a feature with no id too, and a hidden element stays hidden', () => {
    const tileset = fakeTileset();
    setTilesetStyleInputs(tileset, {
      elements: elements({ isolated: ['wall', 'door'], hidden: ['door'] }),
    });

    expect(shown(tileset, 'wall')).toBe(true);
    expect(shown(tileset, 'door')).toBe(false);
    expect(shown(tileset, 'window')).toBe(false);
    expect(shown(tileset, undefined)).toBe(false);
  });

  it('highlights a selected element over the rule, and leaves the rest to the rule and the base', () => {
    const tileset = fakeTileset();
    setTilesetStyleInputs(tileset, {
      base: { color: 'color("blue")' },
      assetColorConditions: RULE_CONDITIONS,
      elements: elements({ selected: ['BOX-01'] }),
    });

    expect(Color.equals(colorOf(tileset, 'BOX-01'), tileHighlightColor())).toBe(true);
    expect(Color.equals(colorOf(tileset, 'other'), Color.BLUE)).toBe(true);
  });

  it('paints white with no base and keeps the base show expression', () => {
    const tileset = fakeTileset();
    setTilesetStyleInputs(tileset, { elements: elements({ selected: ['a'] }) });
    expect(Color.equals(colorOf(tileset, 'b'), Color.WHITE)).toBe(true);
  });

  it('styles a tile with no feature table, which cesium evaluates with no feature', () => {
    const tileset = fakeTileset();
    // cesium's index.d.ts leaves out Model.applyColorAndShow, which is marked private
    const { applyColorAndShow } = Model.prototype as unknown as {
      applyColorAndShow: (this: object, style: unknown) => void;
    };
    const applyStyle = (style: unknown) => {
      const model = { _color: new Color(), _show: true, resetDrawCommands: () => undefined };
      applyColorAndShow.call(model, style);
      return { show: model._show, color: model._color };
    };

    setTilesetStyleInputs(tileset, {
      base: { color: 'color("blue")' },
      elements: elements({ hidden: ['wall'] }),
    });
    const plain = applyStyle(tileset.style);
    expect(plain.show).toBe(true);
    expect(Color.equals(plain.color, Color.WHITE)).toBe(true);

    setTilesetStyleInputs(tileset, { elements: elements({ isolated: ['wall'] }) });
    expect(applyStyle(tileset.style).show).toBe(false);
  });

  it('paints an IDS failure red, and a selection stays yellow', () => {
    const tileset = fakeTileset();
    setTilesetStyleInputs(tileset, {
      elements: {
        selected: new Set(['door']),
        hidden: new Set(),
        isolated: null,
        failed: new Set(['wall', 'door']),
      },
    });

    expect(Color.equals(colorOf(tileset, 'wall'), Color.RED.withAlpha(tileHighlightColor().alpha))).toBe(true);
    expect(Color.equals(colorOf(tileset, 'door'), tileHighlightColor())).toBe(true);
    expect(Color.equals(colorOf(tileset, 'window'), Color.WHITE)).toBe(true);
  });

  it('hides a suppressed element and leaves the others shown', () => {
    const tileset = fakeTileset();
    setTilesetStyleInputs(tileset, {
      elements: {
        selected: new Set(),
        hidden: new Set(),
        isolated: null,
        suppressed: new Set(['wall']),
      },
    });

    expect(shown(tileset, 'wall')).toBe(false);
    expect(shown(tileset, 'door')).toBe(true);
  });

  it('answers on a set of the largest size with no condition per element', () => {
    const tileset = fakeTileset();
    const ids = Array.from({ length: ELEMENT_ID_LIMIT }, (_, index) => `element-${index}`);
    setTilesetStyleInputs(tileset, { elements: elements({ hidden: ids }) });

    expect(shown(tileset, `element-${ELEMENT_ID_LIMIT - 1}`)).toBe(false);
    expect(shown(tileset, 'not-hidden')).toBe(true);
    expect(tileset.style?.style.show.conditions).toBeUndefined();
  });
});

describe('elementIdColumn', () => {
  const loaded = (hasIds: boolean) => ({
    featuresLength: 1,
    trianglesLength: 12,
    hasProperty: () => hasIds,
  });
  const tilesetWithRoot = (root: unknown) => ({ root }) as unknown as Cesium3DTileset;

  it('reads a child under a root whose content cesium has not loaded', () => {
    const tileset = tilesetWithRoot({ content: undefined, children: [{ content: loaded(true), children: [] }] });

    expect(elementIdColumn(tileset)).toBe('present');
  });

  it('calls a tree with no loaded content not loaded', () => {
    const tileset = tilesetWithRoot({ content: undefined, children: [{ content: undefined, children: [] }] });

    expect(elementIdColumn(tileset)).toBe('not loaded');
  });

  it('calls loaded tiles without the id property absent', () => {
    const tileset = tilesetWithRoot({ content: undefined, children: [{ content: loaded(false), children: [] }] });

    expect(elementIdColumn(tileset)).toBe('absent');
  });
});

describe('the element store limit', () => {
  const tooMany = Array.from({ length: ELEMENT_ID_LIMIT + 1 }, (_, index) => `element-${index}`);
  const refusal = `${ELEMENT_ID_LIMIT + 1} elements is over the limit of ${ELEMENT_ID_LIMIT}`;

  it('refuses to hide, isolate or select more, and changes nothing', () => {
    const store = useElementStore.getState();
    expect(() => store.hideElements(tooMany)).toThrow(refusal);
    expect(() => store.isolateElements(tooMany)).toThrow(refusal);
    expect(() => store.selectElements(tooMany)).toThrow(refusal);

    const after = useElementStore.getState();
    expect(after.hidden.size).toBe(0);
    expect(after.isolated).toBeNull();
    expect(after.selected.size).toBe(0);
  });

  it('counts what is already hidden', () => {
    const store = useElementStore.getState();
    store.hideElements(tooMany.slice(0, ELEMENT_ID_LIMIT));

    expect(() => store.hideElements(['one-more'])).toThrow(refusal);
  });
});

describe('useElementStyleCesium', () => {
  it('styles the open model from the store, and takes the inputs off when nothing is left', () => {
    const tileset = fakeTileset();
    useTiles3dLayerStore.setState({ layers: [MODEL_LAYER], loaded: { model: tileset } });
    useElementStore.getState().openModel(MODEL_LAYER);
    renderHook(() => useElementStyleCesium());
    expect(tileset.style).toBeUndefined();

    act(() => useElementStore.getState().hideElements(['wall']));
    expect(shown(tileset, 'wall')).toBe(false);

    act(() => useElementStore.getState().showHidden());
    expect(tileset.style).toBeUndefined();
  });

  it('applies to a tileset that loads after the choice was made', () => {
    useElementStore.getState().openModel(MODEL_LAYER);
    useElementStore.getState().hideElements(['wall']);
    renderHook(() => useElementStyleCesium());

    const tileset = fakeTileset();
    act(() => useTiles3dLayerStore.getState().setLoaded('model', tileset));

    expect(shown(tileset, 'wall')).toBe(false);
  });

  it('paints failures from the store and hides a suppressed mesh', () => {
    const tileset = fakeTileset();
    useTiles3dLayerStore.setState({ layers: [MODEL_LAYER], loaded: { model: tileset } });
    useElementStore.getState().openModel(MODEL_LAYER);
    renderHook(() => useElementStyleCesium());

    act(() => useElementStore.getState().setFailed(['wall', 'door']));
    act(() => useElementStore.getState().selectElements(['door']));
    expect(Color.equals(colorOf(tileset, 'wall'), Color.RED.withAlpha(tileHighlightColor().alpha))).toBe(true);
    expect(Color.equals(colorOf(tileset, 'door'), tileHighlightColor())).toBe(true);

    act(() => useElementStore.getState().setSuppressed(['window']));
    expect(shown(tileset, 'window')).toBe(false);
    expect(shown(tileset, 'wall')).toBe(true);
  });

  it('refuses a failure or suppressed list over the limit, and clears both when another model opens', () => {
    const tileset = fakeTileset();
    useTiles3dLayerStore.setState({ layers: [MODEL_LAYER], loaded: { model: tileset } });
    useElementStore.getState().openModel(MODEL_LAYER);
    useElementStore.getState().setFailed(['wall']);
    useElementStore.getState().setSuppressed(['window']);
    const tooMany = Array.from({ length: ELEMENT_ID_LIMIT + 5 }, (_, index) => `element-${index}`);
    expect(() => useElementStore.getState().setFailed(tooMany)).toThrow(/over the limit/);
    expect(() => useElementStore.getState().setSuppressed(tooMany)).toThrow(/over the limit/);
    expect([...useElementStore.getState().failed]).toEqual(['wall']);
    expect([...useElementStore.getState().suppressed]).toEqual(['window']);

    useElementStore.getState().openModel(MODEL_LAYER);
    expect(useElementStore.getState().failed.size).toBe(1);

    const other = { ...MODEL_LAYER, id: 'other', url: '/tiles/v1/assets/other/tileset.json' };
    useElementStore.getState().openModel(other);
    expect(useElementStore.getState().failed.size).toBe(0);
    expect(useElementStore.getState().suppressed.size).toBe(0);
  });

  it('clears the previous model when another one opens', () => {
    const first = fakeTileset();
    const second = fakeTileset();
    const other = { ...MODEL_LAYER, id: 'other', url: '/tiles/v1/assets/other/tileset.json' };
    useTiles3dLayerStore.setState({ layers: [MODEL_LAYER, other], loaded: { model: first, other: second } });
    useElementStore.getState().openModel(MODEL_LAYER);
    useElementStore.getState().hideElements(['wall']);
    renderHook(() => useElementStyleCesium());
    expect(shown(first, 'wall')).toBe(false);

    act(() => {
      useElementStore.getState().openModel(other);
    });

    expect(first.style).toBeUndefined();
    expect(second.style).toBeUndefined();
  });
});
