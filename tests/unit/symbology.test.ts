import { describe, it, expect } from 'vitest';
import {
  applySymbology,
  buildCategorized,
  buildGraduated,
  categoricalFields,
  classOf,
  clearSymbology,
  legendEntries,
  migrateLegacyChoropleth,
  numericFields,
  CATEGORY_CAP,
  type RuleSymbology,
} from '../../src/features/symbology/symbology';
import { sampleRamp } from '../../src/raster/renderer';
import type { AgentLayer } from '../../src/store/agentLayers';

/**
 * The class colour is baked onto each feature as simplestyle properties, which
 * is what lets Cesium shade a layer with no renderer code at all.
 */

const polygon = (risk: number, name: string): GeoJSON.Feature => ({
  type: 'Feature',
  properties: { risk, name, label: 'same' },
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [12, 45],
        [13, 45],
        [13, 46],
        [12, 46],
        [12, 45],
      ],
    ],
  },
});

const layerOf = (features: GeoJSON.Feature[]): AgentLayer => ({
  id: 'risk',
  name: 'Flood risk',
  color: '#3388ff',
  geojson: { type: 'FeatureCollection', features },
});

const VALUES = [0, 25, 50, 75, 100];
const scored = () => layerOf(VALUES.map((v, i) => polygon(v, `z${i}`)));
const rgb = (t: number) => {
  const [r, g, b] = sampleRamp('viridis', t);
  return `rgb(${r},${g},${b})`;
};

const graduate = (layer: AgentLayer, field = 'risk') => {
  const sym = buildGraduated(layer, field);
  return sym ? applySymbology(layer, sym) : layer;
};

describe('graduated symbology', () => {
  it('splits the range into equal-width classes across the whole ramp', () => {
    const sym = buildGraduated(scored(), 'risk');

    // five bins over 0..100, so the lower bounds are every 20
    expect(sym?.breaks).toEqual([0, 20, 40, 60, 80]);
    expect(sym?.colors).toHaveLength(5);
    expect(sym?.colors[0]).toBe(rgb(0));
    expect(sym?.colors[4]).toBe(rgb(1));
    expect(new Set(sym?.colors).size).toBe(5);
    expect(sym?.field).toBe('risk');
  });

  it('puts a value in the class whose lower bound it clears', () => {
    const breaks = [0, 20, 40, 60, 80];
    expect(classOf(0, breaks)).toBe(0);
    expect(classOf(19.9, breaks)).toBe(0);
    expect(classOf(20, breaks)).toBe(1);
    expect(classOf(79, breaks)).toBe(3);
    // the top value belongs to the top class, not off the end
    expect(classOf(100, breaks)).toBe(4);
  });

  it('honours a class count other than the default', () => {
    const sym = buildGraduated(scored(), 'risk', 'equal', 2, 'reds');
    expect(sym?.breaks).toEqual([0, 50]);
    expect(sym?.colors).toHaveLength(2);
  });

  it('quantile breaks put the same share of features in each class', () => {
    // skewed values: equal-width would leave upper classes near-empty
    const layer = layerOf([1, 2, 3, 4, 100].map((v, i) => polygon(v, `z${i}`)));
    const sym = buildGraduated(layer, 'risk', 'quantile', 5);
    // each class starts at one sorted value
    expect(sym?.breaks).toEqual([1, 2, 3, 4, 100]);
  });

  it('quantile breaks collapse duplicates rather than repeating a bound', () => {
    const layer = layerOf([1, 1, 1, 1, 9].map((v, i) => polygon(v, `z${i}`)));
    const sym = buildGraduated(layer, 'risk', 'quantile', 5);
    expect(sym?.breaks).toEqual([1, 9]);
    expect(sym?.colors).toHaveLength(2);
  });

  it('bakes the class colour onto each feature by geometry type', () => {
    const line: GeoJSON.Feature = {
      type: 'Feature',
      properties: { risk: 100 },
      geometry: { type: 'LineString', coordinates: [[12, 45], [13, 46]] },
    };
    const point: GeoJSON.Feature = {
      type: 'Feature',
      properties: { risk: 0 },
      geometry: { type: 'Point', coordinates: [12, 45] },
    };
    const classified = graduate(layerOf([polygon(0, 'a'), polygon(100, 'b'), line, point]));
    const props = classified.geojson.features.map((f) => f.properties ?? {});

    // a polygon's outline stays the layer colour, so only the fill is shaded
    expect(props[0]).toMatchObject({ fill: rgb(0) });
    expect(props[0].stroke).toBeUndefined();
    expect(props[1].fill).toBe(rgb(1));
    // a line has no fill, so its colour has to come from stroke
    expect(props[2]).toMatchObject({ stroke: rgb(1) });
    expect(props[2].fill).toBeUndefined();
    expect(props[3]).toMatchObject({ 'marker-color': rgb(0) });
  });

  it('leaves a feature alone when the field is not a number there', () => {
    const missing: GeoJSON.Feature = {
      type: 'Feature',
      properties: { risk: 'high' },
      geometry: { type: 'Point', coordinates: [12, 45] },
    };
    const classified = graduate(layerOf([polygon(0, 'a'), polygon(100, 'b'), missing]));

    expect(classified.geojson.features[2].properties).toEqual({ risk: 'high' });
  });

  it('keeps the unstyled features so clearing restores the single colour', () => {
    const plain = scored();
    const classified = graduate(plain);

    // the source data must survive untouched, or clearing could not undo this
    expect(plain.geojson.features[0].properties?.fill).toBeUndefined();
    expect(classified.sourceGeojson).toBe(plain.geojson);

    const cleared = clearSymbology(classified);
    expect(cleared.geojson).toBe(plain.geojson);
    expect(cleared.symbology).toBeUndefined();
    expect(cleared.sourceGeojson).toBeUndefined();
  });

  it('re-styling starts from the unstyled features, not the shaded ones', () => {
    const plain = scored();
    const once = graduate(plain);
    const sym = buildGraduated(once, 'risk', 'equal', 2, 'reds');
    const again = applySymbology(once, sym as NonNullable<typeof sym>);

    expect(again.sourceGeojson).toBe(plain.geojson);
    expect(sym?.breaks).toEqual([0, 50]);
  });

  it('offers only fields that can say something', () => {
    expect(numericFields(scored())).toEqual(['risk']);
    // one feature carrying every score has nothing to shade
    expect(numericFields(layerOf([polygon(42, 'only')]))).toEqual([]);
    expect(numericFields(layerOf([polygon(7, 'a'), polygon(7, 'b')]))).toEqual([]);
  });

  it('builds nothing when the field does not vary', () => {
    expect(buildGraduated(layerOf([polygon(42, 'only')]), 'risk')).toBeNull();
  });
});

describe('categorized symbology', () => {
  it('gives each distinct value its own colour, most frequent first', () => {
    const layer = layerOf([polygon(1, 'b'), polygon(2, 'a'), polygon(3, 'a')]);
    const sym = buildCategorized(layer, 'name');

    expect(sym?.categories.map((c) => c.value)).toEqual(['a', 'b']);
    expect(new Set(sym?.categories.map((c) => c.color)).size).toBe(2);
  });

  it('bakes the category colour and leaves unlisted values alone', () => {
    const layer = layerOf([polygon(1, 'a'), polygon(2, 'b'), polygon(3, 'a')]);
    const sym = buildCategorized(layer, 'name');
    const styled = applySymbology(layer, sym as NonNullable<typeof sym>);
    const props = styled.geojson.features.map((f) => f.properties ?? {});

    expect(props[0].fill).toBe(props[2].fill);
    expect(props[0].fill).not.toBe(props[1].fill);
  });

  it('offers only fields whose values are few enough to each get a colour', () => {
    const layer = layerOf([polygon(1, 'a'), polygon(2, 'b')]);
    // label is constant, risk and name both vary with two values each
    expect(categoricalFields(layer)).toEqual(['risk', 'name']);

    const many = layerOf(
      Array.from({ length: CATEGORY_CAP + 1 }, (_, i) => polygon(i, `n${i}`)),
    );
    expect(categoricalFields(many)).toEqual([]);
  });
});

describe('rule symbology', () => {
  const rules = (rs: RuleSymbology['rules']): RuleSymbology => ({ kind: 'rules', rules: rs });

  it('first match wins and unmatched features keep their own style', () => {
    const layer = layerOf([polygon(10, 'a'), polygon(90, 'b'), polygon(50, 'c')]);
    const styled = applySymbology(
      layer,
      rules([
        { field: 'risk', op: '>=', value: '80', color: '#ff0000' },
        { field: 'risk', op: '>=', value: '40', color: '#ffaa00' },
      ]),
    );
    const props = styled.geojson.features.map((f) => f.properties ?? {});

    expect(props[0].fill).toBeUndefined();
    expect(props[1].fill).toBe('#ff0000');
    expect(props[2].fill).toBe('#ffaa00');
  });

  it('compares as text when the value is not numeric', () => {
    const layer = layerOf([polygon(1, 'venice'), polygon(2, 'rome')]);
    const styled = applySymbology(
      layer,
      rules([{ field: 'name', op: '==', value: 'venice', color: '#00ff00' }]),
    );
    const props = styled.geojson.features.map((f) => f.properties ?? {});

    expect(props[0].fill).toBe('#00ff00');
    expect(props[1].fill).toBeUndefined();
  });

  it('an ordering op on a non-numeric value matches nothing', () => {
    const layer = layerOf([polygon(1, 'a')]);
    const styled = applySymbology(
      layer,
      rules([{ field: 'name', op: '<', value: 'z', color: '#00ff00' }]),
    );
    expect(styled.geojson.features[0].properties?.fill).toBeUndefined();
  });
});

describe('legend entries', () => {
  it('labels graduated classes as ranges with an open top class', () => {
    const sym = buildGraduated(scored(), 'risk');
    const entries = legendEntries(sym as NonNullable<typeof sym>);
    expect(entries[0].label).toBe('0 to 20');
    expect(entries[4].label).toBe('80+');
  });

  it('labels categories by value and rules by their condition', () => {
    expect(
      legendEntries({ kind: 'categorized', field: 'name', categories: [{ value: 'a', color: '#111111' }] }),
    ).toEqual([{ color: '#111111', label: 'a' }]);
    expect(
      legendEntries({
        kind: 'rules',
        rules: [{ field: 'risk', op: '>=', value: '80', color: '#ff0000' }],
      }),
    ).toEqual([{ color: '#ff0000', label: 'risk >= 80' }]);
  });
});

describe('legacy choropleth migration', () => {
  it('converts a saved choropleth into graduated symbology', () => {
    const saved = {
      ...scored(),
      choropleth: { field: 'risk', breaks: [0, 20, 40, 60, 80], colors: ['a', 'b', 'c', 'd', 'e'] },
    } as AgentLayer;

    const migrated = migrateLegacyChoropleth(saved);
    expect(migrated.symbology).toMatchObject({
      kind: 'graduated',
      field: 'risk',
      method: 'equal',
      breaks: [0, 20, 40, 60, 80],
    });
    expect((migrated as { choropleth?: unknown }).choropleth).toBeUndefined();
  });

  it('leaves a layer without the legacy shape alone', () => {
    const plain = scored();
    expect(migrateLegacyChoropleth(plain)).toBe(plain);
  });
});
