import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook, cleanup } from '@testing-library/react';
import {
  useAssetStateStore,
  colorForAsset,
  parseBreakpoints,
  visibleAssets,
  type AssetState,
} from '../../src/live/assetState';
import { useLiveStore } from '../../src/live/liveStore';
import { emptyLiveDocument, type AssetRule } from '../../src/live/types';
import {
  assetColorExpression,
  useAssetColorsMapLibre,
} from '../../src/hooks/useAssetColorsMapLibre';
import { buildTwinFeatures, assetId } from '../../scripts/seed-twin.mjs';

const RULE: AssetRule = {
  layerId: 'twin-assets',
  kind: 'temperature',
  breakpoints: [
    { value: 0, color: '#2ecc71' },
    { value: 25, color: '#f1c40f' },
    { value: 30, color: '#e74c3c' },
  ],
  defaultColor: '#95a5a6',
  offlineColor: '#7f8c8d',
};

const AT = '2026-08-25T10:00:00Z';

const asset = (overrides: Partial<AssetState> = {}): AssetState => ({
  feed: 'feed-1',
  online: true,
  values: { temperature: { value: 21, at: AT } },
  ...overrides,
});

describe('colorForAsset', () => {
  it('gives an unknown asset the default colour', () => {
    expect(colorForAsset(RULE, undefined)).toBe('#95a5a6');
  });

  it('gives an offline asset the offline colour, whatever it last read', () => {
    expect(colorForAsset(RULE, asset({ online: false }))).toBe('#7f8c8d');
  });

  it('gives an asset with no reading of that kind the default colour', () => {
    expect(colorForAsset(RULE, asset({ values: { humidity: { value: 80, at: AT } } }))).toBe(
      '#95a5a6',
    );
  });

  it('takes the last breakpoint at or below the reading', () => {
    const at = (value: number) =>
      colorForAsset(RULE, asset({ values: { temperature: { value, at: AT } } }));
    expect(at(21)).toBe('#2ecc71');
    expect(at(25)).toBe('#f1c40f');
    expect(at(29.9)).toBe('#f1c40f');
    expect(at(31)).toBe('#e74c3c');
  });

  it('falls back to the default below every breakpoint', () => {
    const below = { ...RULE, breakpoints: [{ value: 10, color: '#2ecc71' }] };
    expect(colorForAsset(below, asset({ values: { temperature: { value: 3, at: AT } } }))).toBe(
      '#95a5a6',
    );
  });

  it('sorts the breakpoints itself, so the rule may arrive in any order', () => {
    const shuffled = { ...RULE, breakpoints: [...RULE.breakpoints].reverse() };
    expect(colorForAsset(shuffled, asset({ values: { temperature: { value: 26, at: AT } } }))).toBe(
      '#f1c40f',
    );
  });
});

describe('parseBreakpoints', () => {
  it('reads the form field and sorts it', () => {
    expect(parseBreakpoints('30:#e74c3c, 0:#2ecc71,25:#f1c40f')).toEqual(RULE.breakpoints);
  });

  it('drops entries that are not a number and a colour', () => {
    expect(parseBreakpoints('warm, 5:#fff, :#000, 7:')).toEqual([{ value: 5, color: '#fff' }]);
  });
});

describe('the asset state store', () => {
  beforeEach(() => {
    useAssetStateStore.getState().clear();
  });

  it('replaces the whole map on an assets frame', () => {
    useAssetStateStore.setState({ assets: { 'TWIN-09': asset() } });
    useAssetStateStore.getState().receive({
      type: 'assets',
      assets: [
        {
          asset: 'TWIN-03',
          feed: 'feed-1',
          online: false,
          values: [{ kind: 'temperature', value: 18, at: AT }],
        },
      ],
    });
    const { assets } = useAssetStateStore.getState();
    expect(Object.keys(assets)).toEqual(['TWIN-03']);
    expect(assets['TWIN-03']).toEqual({
      feed: 'feed-1',
      online: false,
      values: { temperature: { value: 18, at: AT } },
    });
  });

  it('upserts on a readings frame, keeping the kinds it did not carry', () => {
    useAssetStateStore.setState({
      assets: { 'TWIN-03': asset({ values: { humidity: { value: 40, at: AT } } }) },
    });
    useAssetStateStore.getState().receive({
      type: 'readings',
      feed: 'feed-1',
      readings: [
        { asset: 'TWIN-03', kind: 'temperature', value: 31, at: AT },
        { asset: 'TWIN-07', kind: 'temperature', value: 12, at: AT },
      ],
    });
    const { assets } = useAssetStateStore.getState();
    expect(assets['TWIN-03'].values).toEqual({
      humidity: { value: 40, at: AT },
      temperature: { value: 31, at: AT },
    });
    // an asset agora never announced still has to land somewhere
    expect(assets['TWIN-07']).toEqual({
      feed: 'feed-1',
      online: true,
      values: { temperature: { value: 12, at: AT } },
    });
  });

  it('flips online on a liveness frame and ignores an asset it does not hold', () => {
    useAssetStateStore.setState({ assets: { 'TWIN-03': asset() } });
    useAssetStateStore.getState().receive({
      type: 'liveness',
      asset: 'TWIN-03',
      online: false,
      at: AT,
    });
    useAssetStateStore.getState().receive({
      type: 'liveness',
      asset: 'TWIN-11',
      online: false,
      at: AT,
    });
    const { assets } = useAssetStateStore.getState();
    expect(assets['TWIN-03'].online).toBe(false);
    expect(assets['TWIN-03'].values).toEqual(asset().values);
    expect(assets['TWIN-11']).toBeUndefined();
  });
});

describe('the asset store showing a past moment', () => {
  const PAST = '2026-08-25T09:00:00.000Z';

  const snapshot = (value: number, online = true) => ({
    asset: 'TWIN-03',
    feed: 'feed-1',
    online,
    values: [{ kind: 'temperature', value, at: PAST }],
  });

  beforeEach(() => {
    useAssetStateStore.getState().clear();
  });

  it('shows the past assets, then the live ones again', () => {
    useAssetStateStore.setState({ assets: { 'TWIN-03': asset() } });
    useAssetStateStore.getState().showHistory(PAST, [snapshot(31, false)]);

    const held = useAssetStateStore.getState();
    expect(held.historyAt).toBe(PAST);
    expect(visibleAssets(held)['TWIN-03']).toEqual({
      feed: 'feed-1',
      online: false,
      values: { temperature: { value: 31, at: PAST } },
    });
    // the live map is still underneath, untouched
    expect(held.assets['TWIN-03']).toEqual(asset());

    useAssetStateStore.getState().showLive();
    expect(useAssetStateStore.getState().historyAt).toBeNull();
    expect(visibleAssets(useAssetStateStore.getState())['TWIN-03']).toEqual(asset());
  });

  it('keeps showing the past moment while live frames land', () => {
    useAssetStateStore.getState().showHistory(PAST, [snapshot(31)]);
    const receive = useAssetStateStore.getState().receive;
    receive({
      type: 'readings',
      feed: 'feed-1',
      readings: [{ asset: 'TWIN-03', kind: 'temperature', value: 12, at: AT }],
    });
    receive({ type: 'liveness', asset: 'TWIN-03', online: false, at: AT });
    receive({
      type: 'assets',
      assets: [{ asset: 'TWIN-03', feed: 'feed-1', online: true, values: [] }],
    });

    const held = useAssetStateStore.getState();
    expect(held.historyAt).toBe(PAST);
    expect(visibleAssets(held)['TWIN-03'].values.temperature.value).toBe(31);
    // the rejoin frame replaced the live map only
    expect(held.assets['TWIN-03'].values).toEqual({});
  });

  it('goes back to live on clear', () => {
    useAssetStateStore.getState().showHistory(PAST, [snapshot(31)]);
    useAssetStateStore.getState().clear();
    const held = useAssetStateStore.getState();
    expect(held.historyAt).toBeNull();
    expect(held.history).toBeNull();
    expect(held.assets).toEqual({});
  });
});

describe('the live store forwards the asset frames', () => {
  beforeEach(() => {
    useAssetStateStore.getState().clear();
  });

  it('routes readings, assets and liveness to the asset store', () => {
    const receive = useLiveStore.getState().receive;
    receive({
      type: 'assets',
      assets: [{ asset: 'TWIN-03', feed: 'feed-1', online: true, values: [] }],
    });
    receive({
      type: 'readings',
      feed: 'feed-1',
      readings: [{ asset: 'TWIN-03', kind: 'temperature', value: 26, at: AT }],
    });
    receive({ type: 'liveness', asset: 'TWIN-03', online: false, at: AT });

    const held = useAssetStateStore.getState().assets['TWIN-03'];
    expect(held.values.temperature.value).toBe(26);
    expect(held.online).toBe(false);
    // asset state is not document state, so nothing reached the document
    expect(useLiveStore.getState().document.assets).toEqual({});
  });

  it('clears the asset store on disconnect', () => {
    useAssetStateStore.setState({ assets: { 'TWIN-03': asset() } });
    useLiveStore.getState().disconnect();
    expect(useAssetStateStore.getState().assets).toEqual({});
  });
});

describe('assetColorExpression', () => {
  const fallback = ['coalesce', ['get', 'marker-color'], '#ff0000'];

  it('keeps the layer own colour when there is nothing to colour', () => {
    expect(assetColorExpression(RULE, {}, fallback)).toBe(fallback);
  });

  it('maps every known asset to its colour and falls back for the rest', () => {
    const expression = assetColorExpression(
      RULE,
      {
        'TWIN-03': asset({ values: { temperature: { value: 31, at: AT } } }),
        'TWIN-04': asset({ online: false }),
      },
      fallback,
    );
    expect(expression).toEqual([
      'match',
      ['get', 'asset_id'],
      'TWIN-03',
      '#e74c3c',
      'TWIN-04',
      '#7f8c8d',
      fallback,
    ]);
  });
});

/** Enough of a maplibre surface for the paint this hook reads and writes. */
function fakeMap(paint: Record<string, Record<string, unknown>>) {
  const listeners: Record<string, Array<() => void>> = {};
  return {
    getLayer: (id: string) => (paint[id] ? { id } : undefined),
    getPaintProperty: (id: string, property: string) => paint[id]?.[property],
    setPaintProperty: (id: string, property: string, value: unknown) => {
      paint[id][property] = value;
    },
    on: (event: string, handler: () => void) => {
      listeners[event] ??= [];
      listeners[event].push(handler);
    },
    off: (event: string, handler: () => void) => {
      listeners[event] = (listeners[event] ?? []).filter((known) => known !== handler);
    },
    fire: (event: string) => {
      for (const handler of listeners[event] ?? []) handler();
    },
  };
}

describe('useAssetColorsMapLibre', () => {
  const ORIGINAL_CIRCLE_COLOR = ['coalesce', ['get', 'marker-color'], '#3388ff'];
  const CIRCLE_LAYER = 'agent-layer-twin-assets-circle';

  beforeEach(() => {
    cleanup();
    useAssetStateStore.getState().clear();
    useLiveStore.setState({ document: emptyLiveDocument() });
  });

  const mount = (map: ReturnType<typeof fakeMap>) => {
    const ref = { current: map } as unknown as Parameters<typeof useAssetColorsMapLibre>[0];
    return renderHook(() => useAssetColorsMapLibre(ref));
  };

  it('paints the rule colours over the layer and puts them back when it goes', () => {
    const paint = { [CIRCLE_LAYER]: { 'circle-color': ORIGINAL_CIRCLE_COLOR } };
    const map = fakeMap(paint);
    useAssetStateStore.setState({
      assets: { 'TWIN-03': asset({ values: { temperature: { value: 31, at: AT } } }) },
    });
    useLiveStore.setState({ document: { ...emptyLiveDocument(), assets: { rule: RULE } } });

    const view = mount(map);
    expect(paint[CIRCLE_LAYER]['circle-color']).toEqual([
      'match',
      ['get', 'asset_id'],
      'TWIN-03',
      '#e74c3c',
      ORIGINAL_CIRCLE_COLOR,
    ]);

    act(() => {
      useLiveStore.setState({ document: emptyLiveDocument() });
    });
    view.rerender();
    expect(paint[CIRCLE_LAYER]['circle-color']).toEqual(ORIGINAL_CIRCLE_COLOR);
  });

  it('paints again after the agent layer effect re-added the layer', () => {
    const paint = { [CIRCLE_LAYER]: { 'circle-color': ORIGINAL_CIRCLE_COLOR } };
    const map = fakeMap(paint);
    useAssetStateStore.setState({ assets: { 'TWIN-03': asset() } });
    useLiveStore.setState({ document: { ...emptyLiveDocument(), assets: { rule: RULE } } });
    mount(map);

    // a basemap change drops the layer and it comes back with its own colour
    paint[CIRCLE_LAYER]['circle-color'] = ORIGINAL_CIRCLE_COLOR;
    act(() => map.fire('idle'));
    expect(paint[CIRCLE_LAYER]['circle-color']).toEqual([
      'match',
      ['get', 'asset_id'],
      'TWIN-03',
      '#2ecc71',
      ORIGINAL_CIRCLE_COLOR,
    ]);
  });

  it('paints the past moment while the scrubber holds one', () => {
    const paint = { [CIRCLE_LAYER]: { 'circle-color': ORIGINAL_CIRCLE_COLOR } };
    const map = fakeMap(paint);
    useAssetStateStore.setState({
      assets: { 'TWIN-03': asset({ values: { temperature: { value: 31, at: AT } } }) },
    });
    useLiveStore.setState({ document: { ...emptyLiveDocument(), assets: { rule: RULE } } });
    const view = mount(map);

    act(() => {
      useAssetStateStore.getState().showHistory('2026-08-25T09:00:00.000Z', [
        { asset: 'TWIN-03', feed: 'feed-1', online: true, values: [{ kind: 'temperature', value: 21, at: AT }] },
      ]);
    });
    view.rerender();
    expect(paint[CIRCLE_LAYER]['circle-color']).toEqual([
      'match',
      ['get', 'asset_id'],
      'TWIN-03',
      '#2ecc71',
      ORIGINAL_CIRCLE_COLOR,
    ]);

    act(() => useAssetStateStore.getState().showLive());
    view.rerender();
    expect(paint[CIRCLE_LAYER]['circle-color']).toEqual([
      'match',
      ['get', 'asset_id'],
      'TWIN-03',
      '#e74c3c',
      ORIGINAL_CIRCLE_COLOR,
    ]);
  });

  it('leaves a layer the rule does not name alone', () => {
    const paint = { 'agent-layer-parcels-fill': { 'fill-color': '#123456' } };
    const map = fakeMap(paint);
    useAssetStateStore.setState({ assets: { 'TWIN-03': asset() } });
    useLiveStore.setState({ document: { ...emptyLiveDocument(), assets: { rule: RULE } } });
    mount(map);
    expect(paint['agent-layer-parcels-fill']['fill-color']).toBe('#123456');
  });
});

describe('buildTwinFeatures', () => {
  it('lays twelve named assets out from the anchor', () => {
    const features = buildTwinFeatures([7.42, 43.734]);
    expect(features).toHaveLength(12);
    expect(features.map((feature) => feature.properties.asset_id)).toEqual(
      Array.from({ length: 12 }, (_entry, index) => assetId(index)),
    );
    expect(features[0].geometry.coordinates).toEqual([7.42, 43.734]);
    const places = new Set(features.map((feature) => String(feature.geometry.coordinates)));
    expect(places.size).toBe(12);
  });
});
