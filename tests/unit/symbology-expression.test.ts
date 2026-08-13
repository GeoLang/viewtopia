import { describe, it, expect } from 'vitest';
import {
  evaluateExpression,
  formatExpression,
  parseExpression,
} from '../../src/features/symbology/expression';
import {
  EXPRESSION_SIZES,
  applySymbology,
  buildExpression,
  expressionClasses,
  featureStyler,
  legendEntries,
  symbologyField,
  type ExpressionSymbology,
} from '../../src/features/symbology/symbology';
import { sampleRamp } from '../../src/raster/renderer';
import { useAgentLayerStore, type AgentLayer } from '../../src/store/agentLayers';

/**
 * The expression renderer end to end: parse, evaluate over a feature's own
 * properties, and the colour and radius that come out baked on the feature,
 * which is what all three map renderers read.
 */

const polygon = (properties: GeoJSON.GeoJsonProperties): GeoJSON.Feature => ({
  type: 'Feature',
  properties,
  geometry: {
    type: 'Polygon',
    coordinates: [[[12, 45], [13, 45], [13, 46], [12, 46], [12, 45]]],
  },
});

const point = (properties: GeoJSON.GeoJsonProperties): GeoJSON.Feature => ({
  type: 'Feature',
  properties,
  geometry: { type: 'Point', coordinates: [12, 45] },
});

const layerOf = (features: GeoJSON.Feature[]): AgentLayer => ({
  id: 'towns',
  name: 'Towns',
  color: '#3388ff',
  geojson: { type: 'FeatureCollection', features },
});

/** Densities 100, 200 and 400, so the domain runs 100 to 400. */
const densities = () =>
  layerOf([
    polygon({ population: 1000, area: 10 }),
    polygon({ population: 1000, area: 5 }),
    polygon({ population: 2000, area: 5 }),
  ]);

const rgb = (t: number) => {
  const [r, g, b] = sampleRamp('viridis', t);
  return `rgb(${r},${g},${b})`;
};

const evaluate = (text: string, properties: GeoJSON.GeoJsonProperties) => {
  const { node } = parseExpression(text);
  if (!node) throw new Error(`expected ${text} to parse`);
  return evaluateExpression(node, properties);
};

describe('the expression language', () => {
  it('multiplies before it adds, and brackets override that', () => {
    expect(evaluate('a + b * c', { a: 2, b: 3, c: 4 })).toBe(14);
    expect(evaluate('(a + b) * c', { a: 2, b: 3, c: 4 })).toBe(20);
    expect(evaluate('a - b - c', { a: 10, b: 3, c: 2 })).toBe(5);
    expect(evaluate('a / b / c', { a: 100, b: 5, c: 2 })).toBe(10);
  });

  it('reads number literals, unary minus and quoted column names', () => {
    expect(evaluate('2.5 * count', { count: 4 })).toBe(10);
    expect(evaluate('-count', { count: 4 })).toBe(-4);
    expect(evaluate('0 - -count', { count: 4 })).toBe(4);
    expect(evaluate('"total population" / 2', { 'total population': 50 })).toBe(25);
  });

  it('has no value where the feature has no number, rather than a wrong one', () => {
    expect(evaluate('population / area', { population: 100 })).toBeNull();
    expect(evaluate('population / area', { population: 100, area: 'two' })).toBeNull();
    expect(evaluate('population / area', { population: 100, area: 0 })).toBeNull();
    expect(evaluate('population / area', null)).toBeNull();
  });

  it('says what is wrong with a malformed expression instead of throwing', () => {
    const reasons = ['', 'a +', 'a + * b', '(a + b', 'a b', 'a % b', 'a + "b'].map(
      (text) => parseExpression(text),
    );
    for (const { node, error } of reasons) {
      expect(node).toBeNull();
      expect(error).toMatch(/\S/);
    }
    expect(parseExpression('a %  b').error).toContain('character 3');
    expect(parseExpression('(a + b').error).toContain('bracket');
    expect(parseExpression('a +').error).toContain('ends where a value was expected');
    expect(parseExpression('').error).toContain('empty');
  });

  it('writes an expression back with the brackets its meaning needs', () => {
    const roundTrip = (text: string) => {
      const { node } = parseExpression(text);
      return node && formatExpression(node);
    };
    expect(roundTrip('(a + b) * c')).toBe('(a + b) * c');
    expect(roundTrip('a + b * c')).toBe('a + b * c');
    expect(roundTrip('a - (b - c)')).toBe('a - (b - c)');
    expect(roundTrip('a / (b * c)')).toBe('a / (b * c)');
    expect(roundTrip('"total population" / area')).toBe('"total population" / area');
  });
});

describe('building an expression renderer', () => {
  it('takes its domain from the values the layer really holds', () => {
    const sym = buildExpression(densities(), 'population / area');
    expect(sym?.domain).toEqual([100, 400]);
    expect(sym?.ramp).toBe('viridis');
    expect(sym?.sizes).toBeUndefined();
  });

  it('refuses an expression that is malformed or shades nothing', () => {
    expect(buildExpression(densities(), 'population /')).toBeNull();
    expect(buildExpression(densities(), 'missing * 2')).toBeNull();
    // every feature the same value, so a ramp over it would be one colour
    expect(buildExpression(densities(), 'population / population')).toBeNull();
  });

  it('labels itself by its expression, since it classifies by no one column', () => {
    const sym = buildExpression(densities(), 'population / area');
    expect(sym && symbologyField(sym)).toBe('population / area');
  });
});

describe('drawing features by an expression', () => {
  it('bakes the colour its own value samples on the ramp', () => {
    const layer = densities();
    const sym = buildExpression(layer, 'population / area');
    if (!sym) throw new Error('expected a renderer');
    const styled = applySymbology(layer, sym);

    // 100, 200 and 400 across a 100..400 domain
    expect(styled.geojson.features.map((f) => f.properties?.fill)).toEqual([
      rgb(0),
      rgb(1 / 3),
      rgb(1),
    ]);
    expect(styled.sourceGeojson?.features[0].properties?.fill).toBeUndefined();
  });

  it('leaves a feature the expression cannot value in the layer colour', () => {
    const layer = layerOf([
      polygon({ population: 1000, area: 10 }),
      polygon({ population: 2000, area: 5 }),
      polygon({ population: 500 }),
    ]);
    const sym = buildExpression(layer, 'population / area');
    if (!sym) throw new Error('expected a renderer');
    const styled = applySymbology(layer, sym);

    expect(styled.geojson.features[2].properties?.fill).toBeUndefined();
    expect(styled.geojson.features[0].properties?.fill).toBe(rgb(0));
  });

  it('sizes points across the size span and names the size Cesium reads', () => {
    const layer = layerOf([
      point({ population: 1000, area: 10 }),
      point({ population: 1000, area: 5 }),
      point({ population: 2000, area: 5 }),
    ]);
    const sym = buildExpression(layer, 'population / area', 'viridis', EXPRESSION_SIZES);
    if (!sym) throw new Error('expected a renderer');
    const styled = applySymbology(layer, sym);
    const [low, high] = EXPRESSION_SIZES;

    expect(styled.geojson.features.map((f) => f.properties?.['marker-radius'])).toEqual([
      low,
      low + (high - low) / 3,
      high,
    ]);
    expect(styled.geojson.features.map((f) => f.properties?.['marker-size'])).toEqual([
      'small',
      'medium',
      'large',
    ]);
    expect(styled.geojson.features[0].properties?.['marker-color']).toBe(rgb(0));
  });

  it('sizes nothing when the renderer carries no size span', () => {
    const layer = layerOf([point({ population: 1000, area: 10 }), point({ population: 2000, area: 5 })]);
    const sym = buildExpression(layer, 'population / area');
    if (!sym) throw new Error('expected a renderer');
    const styled = applySymbology(layer, sym);
    expect(styled.geojson.features[0].properties?.['marker-radius']).toBeUndefined();
  });

  it('draws nothing rather than throwing when the stored expression is malformed', () => {
    const broken: ExpressionSymbology = {
      kind: 'expression',
      expression: 'population /',
      ramp: 'viridis',
      domain: [0, 1],
    };
    const styler = featureStyler(broken);
    expect(styler(polygon({ population: 5 }))).toEqual({ color: null, radius: null });
    expect(applySymbology(densities(), broken).geojson.features[0].properties?.fill).toBeUndefined();
  });

  it('restyles through the store, and clearing puts the features back', () => {
    const layer = densities();
    const sym = buildExpression(layer, 'population / area');
    useAgentLayerStore.setState({ layers: [], rasterLayers: [], markers: [], generation: 0 });
    useAgentLayerStore.getState().addLayer(layer);
    useAgentLayerStore.getState().setSymbology('towns', sym);

    const styled = useAgentLayerStore.getState().layers[0];
    expect(styled.geojson.features[2].properties?.fill).toBe(rgb(1));

    useAgentLayerStore.getState().setSymbology('towns', null);
    const plain = useAgentLayerStore.getState().layers[0];
    expect(plain.symbology).toBeUndefined();
    expect(plain.geojson.features[2].properties?.fill).toBeUndefined();
  });
});

describe('the expression legend', () => {
  it('samples the ramp across the domain, labelled by value', () => {
    const sym = buildExpression(densities(), 'population / area');
    if (!sym) throw new Error('expected a renderer');
    const entries = legendEntries(sym);

    expect(entries.map((entry) => entry.label)).toEqual(['100', '175', '250', '325', '400']);
    expect(entries[0].color).toBe(rgb(0));
    expect(entries[4].color).toBe(rgb(1));
    expect(entries.every((entry) => entry.radius === undefined)).toBe(true);
  });

  it('carries the swatch radius where the renderer sizes points', () => {
    const sym = buildExpression(densities(), 'population / area', 'magma', [4, 12]);
    if (!sym) throw new Error('expected a renderer');
    expect(legendEntries(sym).map((entry) => entry.radius)).toEqual([4, 6, 8, 10, 12]);
  });

  it('cuts the ramp into classes that cover the whole domain, for a class-only format', () => {
    const sym = buildExpression(densities(), 'population / area');
    if (!sym) throw new Error('expected a renderer');
    const classes = expressionClasses(sym);

    expect(classes[0].bounds).toEqual([100, 160]);
    expect(classes[4].bounds).toEqual([340, 400]);
    expect(classes[0].color).toBe(rgb(0));
    expect(classes[4].color).toBe(rgb(1));
  });
});
