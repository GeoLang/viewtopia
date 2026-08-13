import { describe, it, expect } from 'vitest';
import {
  mapboxStyleToSymbology,
  symbologyToMapboxStyle,
} from '../../src/features/symbology/mapboxStyle';
import { symbologyToSld } from '../../src/features/symbology/sldExport';
import type { Symbology } from '../../src/features/symbology/symbology';
import type { AgentLayer } from '../../src/store/agentLayers';

const feature = (
  properties: GeoJSON.GeoJsonProperties,
  geometry: GeoJSON.Geometry,
): GeoJSON.Feature => ({ type: 'Feature', properties, geometry });

const polygon = (properties: GeoJSON.GeoJsonProperties): GeoJSON.Feature =>
  feature(properties, {
    type: 'Polygon',
    coordinates: [[[12, 45], [13, 45], [13, 46], [12, 46], [12, 45]]],
  });

const point = (properties: GeoJSON.GeoJsonProperties): GeoJSON.Feature =>
  feature(properties, { type: 'Point', coordinates: [12, 45] });

const line = (properties: GeoJSON.GeoJsonProperties): GeoJSON.Feature =>
  feature(properties, { type: 'LineString', coordinates: [[12, 45], [13, 46]] });

const layerOf = (features: GeoJSON.Feature[], symbology?: Symbology): AgentLayer => ({
  id: 'risk',
  name: 'Flood risk',
  color: '#3388ff',
  geojson: { type: 'FeatureCollection', features },
  symbology,
});

const CATEGORIZED: Symbology = {
  kind: 'categorized',
  field: 'type',
  categories: [
    { value: 'forest', color: '#1b7837' },
    { value: 'water & marsh', color: '#2166ac' },
  ],
};

const GRADUATED: Symbology = {
  kind: 'graduated',
  field: 'risk',
  method: 'equal',
  ramp: 'viridis',
  breaks: [0, 25, 50],
  colors: ['#440154', '#21918c', '#fde725'],
};

const RULES: Symbology = {
  kind: 'rules',
  rules: [
    { field: 'risk', op: '>=', value: '80', color: '#e15759' },
    { field: 'type', op: '==', value: 'water', color: '#4e79a7' },
  ],
};

const scored = (symbology: Symbology) =>
  layerOf([polygon({ risk: 10, type: 'forest' }), polygon({ risk: 90, type: 'water' })], symbology);

describe('exporting symbology as SLD', () => {
  it('writes one equality rule per category, with the class colour as a fill', () => {
    const sld = symbologyToSld(scored(CATEGORIZED)) ?? '';

    expect(sld).toContain('<Name>Flood risk</Name>');
    expect(sld.match(/<Rule>/g)).toHaveLength(2);
    expect(sld).toContain(
      '<ogc:PropertyIsEqualTo><ogc:PropertyName>type</ogc:PropertyName><ogc:Literal>forest</ogc:Literal></ogc:PropertyIsEqualTo>',
    );
    expect(sld).toContain('<CssParameter name="fill">#1b7837</CssParameter>');
    expect(sld).toContain('<CssParameter name="fill">#2166ac</CssParameter>');
    expect(sld).toContain('<Title>type = forest</Title>');
  });

  it('escapes a value that would otherwise break the document', () => {
    const sld = symbologyToSld(scored(CATEGORIZED)) ?? '';
    expect(sld).toContain('<ogc:Literal>water &amp; marsh</ogc:Literal>');
    expect(sld).not.toContain('water & marsh');
  });

  it('turns graduated breaks into ranges that meet end to end', () => {
    const sld = symbologyToSld(scored(GRADUATED)) ?? '';
    const bounds = [...sld.matchAll(/<ogc:LowerBoundary><ogc:Literal>([-\d.]+)</g)].map((m) =>
      Number(m[1]),
    );
    const uppers = [...sld.matchAll(/<ogc:UpperBoundary><ogc:Literal>([-\d.]+)</g)].map((m) =>
      Number(m[1]),
    );

    expect(bounds).toEqual([0, 25, 50]);
    // the top class runs to the highest value in the data
    expect(uppers).toEqual([25, 50, 90]);
    expect(sld).toContain('<ogc:PropertyName>risk</ogc:PropertyName>');
    expect(sld).toContain('<CssParameter name="fill">#440154</CssParameter>');
  });

  it('closes the top class above the last break when the data has nothing there', () => {
    const layer = layerOf([polygon({ risk: 10 }), polygon({ risk: 20 })], GRADUATED);
    const sld = symbologyToSld(layer) ?? '';
    expect(sld).toContain('<ogc:UpperBoundary><ogc:Literal>75</ogc:Literal></ogc:UpperBoundary>');
  });

  it('writes each rule with its own operator', () => {
    const sld = symbologyToSld(scored(RULES)) ?? '';
    expect(sld).toContain(
      '<ogc:PropertyIsGreaterThanOrEqualTo><ogc:PropertyName>risk</ogc:PropertyName><ogc:Literal>80</ogc:Literal></ogc:PropertyIsGreaterThanOrEqualTo>',
    );
    expect(sld).toContain('<ogc:PropertyIsEqualTo>');
    expect(sld).toContain('<CssParameter name="fill">#e15759</CssParameter>');
  });

  it('symbolizes points and lines the way their geometry draws', () => {
    const points = layerOf([point({ type: 'forest' })], CATEGORIZED);
    const lines = layerOf([line({ type: 'forest' })], CATEGORIZED);

    expect(symbologyToSld(points)).toContain(
      '<PointSymbolizer><Graphic><Mark><WellKnownName>circle</WellKnownName><Fill><CssParameter name="fill">#1b7837</CssParameter>',
    );
    expect(symbologyToSld(lines)).toContain(
      '<LineSymbolizer><Stroke><CssParameter name="stroke">#1b7837</CssParameter></Stroke></LineSymbolizer>',
    );
    expect(symbologyToSld(scored(CATEGORIZED))).toContain('<PolygonSymbolizer>');
  });

  it('has nothing to write for a layer with no symbology', () => {
    expect(symbologyToSld(layerOf([polygon({ risk: 1 })]))).toBeNull();
  });
});

const styleOf = (layer: AgentLayer) => JSON.parse(symbologyToMapboxStyle(layer) ?? '');
const paintOf = (layer: AgentLayer) => styleOf(layer).layers[0].paint;

describe('exporting symbology as a Mapbox style', () => {
  it('carries a categorized renderer as a match expression', () => {
    expect(paintOf(scored(CATEGORIZED))['fill-color']).toEqual([
      'match',
      ['get', 'type'],
      'forest',
      '#1b7837',
      'water & marsh',
      '#2166ac',
      '#3388ff',
    ]);
  });

  it('carries a graduated renderer as a step expression keeping every break', () => {
    expect(paintOf(scored(GRADUATED))['fill-color']).toEqual([
      'step',
      ['get', 'risk'],
      '#3388ff',
      0,
      '#440154',
      25,
      '#21918c',
      50,
      '#fde725',
    ]);
  });

  it('carries rules as a case expression, numbers as numbers', () => {
    expect(paintOf(scored(RULES))['fill-color']).toEqual([
      'case',
      ['>=', ['get', 'risk'], 80],
      '#e15759',
      ['==', ['get', 'type'], 'water'],
      '#4e79a7',
      '#3388ff',
    ]);
  });

  it('names a placeholder source and a layer per geometry kind', () => {
    const style = styleOf(scored(CATEGORIZED));
    expect(style.version).toBe(8);
    expect(Object.keys(style.sources)).toEqual(['symbology-source']);
    expect(style.layers[0].source).toBe('symbology-source');
    expect(style.layers[0].type).toBe('fill');

    const mixed = layerOf([polygon({ type: 'forest' }), point({ type: 'water' })], CATEGORIZED);
    expect(styleOf(mixed).layers.map((l: { type: string }) => l.type)).toEqual(['fill', 'circle']);
    expect(styleOf(mixed).layers[1].paint['circle-color'][0]).toBe('match');
  });

  it('has nothing to write for a layer with no symbology', () => {
    expect(symbologyToMapboxStyle(layerOf([polygon({ risk: 1 })]))).toBeNull();
  });
});

/** What a layer's own style converts back to, class for class. */
const roundTrip = (sym: Symbology) =>
  mapboxStyleToSymbology(symbologyToMapboxStyle(scored(sym)) ?? '');

describe('importing a Mapbox style', () => {
  it('reads a match expression back as the categories it came from', () => {
    const conversion = roundTrip(CATEGORIZED);
    expect(conversion.symbology).toEqual(CATEGORIZED);
    expect(conversion.layer).toBe('risk-fill');
    expect(conversion.unsupported.map((entry) => entry.detail)).toEqual([
      'the fallback colour #3388ff is dropped: a feature no category matches keeps the layer colour',
    ]);
  });

  it('reads a step expression back as the breaks and colours it came from', () => {
    const conversion = roundTrip(GRADUATED);
    expect(conversion.symbology).toEqual(GRADUATED);
    expect(conversion.unsupported.map((entry) => entry.construct)).toEqual(['step', 'step']);
  });

  it('reads a case expression back as the rules it came from', () => {
    const conversion = roundTrip(RULES);
    expect(conversion.symbology).toEqual(RULES);
    expect(conversion.unsupported[0].detail).toContain('a feature no rule matches');
  });

  it('assumes a break method and a ramp, since a style states neither', () => {
    const quantile: Symbology = { ...GRADUATED, method: 'quantile', ramp: 'magma' };
    const conversion = roundTrip(quantile);
    expect(conversion.symbology).toMatchObject({
      kind: 'graduated',
      breaks: quantile.breaks,
      colors: quantile.colors,
      method: 'equal',
      ramp: 'viridis',
    });
    expect(conversion.unsupported[0].detail).toContain('placeholders');
  });

  it('spreads a match label list over one category each', () => {
    const style = JSON.stringify({
      layers: [
        {
          id: 'landuse',
          type: 'fill',
          paint: { 'fill-color': ['match', ['get', 'type'], ['wood', 'scrub'], '#1b7837', '#eee'] },
        },
      ],
    });
    expect(mapboxStyleToSymbology(style).symbology).toEqual({
      kind: 'categorized',
      field: 'type',
      categories: [
        { value: 'wood', color: '#1b7837' },
        { value: 'scrub', color: '#1b7837' },
      ],
    });
  });

  it('drops a condition it cannot test and says which rule went', () => {
    const style = JSON.stringify({
      layers: [
        {
          id: 'risk',
          type: 'line',
          paint: {
            'line-color': [
              'case',
              ['all', ['>', ['get', 'risk'], 1], ['<', ['get', 'risk'], 2]],
              '#000000',
              ['==', ['get', 'type'], 'water'],
              '#4e79a7',
              '#eeeeee',
            ],
          },
        },
      ],
    });
    const conversion = mapboxStyleToSymbology(style);
    expect(conversion.symbology).toEqual({
      kind: 'rules',
      rules: [{ field: 'type', op: '==', value: 'water', color: '#4e79a7' }],
    });
    expect(conversion.unsupported[0]).toMatchObject({ construct: 'all', rule_index: 0 });
  });

  it('takes the first layer that classifies and says the others went untouched', () => {
    const style = JSON.stringify({
      layers: [
        { id: 'background', type: 'background', paint: { 'background-color': '#000' } },
        { id: 'plain', type: 'fill', paint: { 'fill-color': '#123456' } },
        {
          id: 'classified',
          type: 'circle',
          paint: { 'circle-color': ['match', ['get', 'type'], 'water', '#4e79a7', '#eee'] },
        },
      ],
    });
    const conversion = mapboxStyleToSymbology(style);
    expect(conversion.layer).toBe('classified');
    expect(conversion.unsupported[0].detail).toBe(
      'the style holds 3 layers and only classified converted',
    );
  });

  it('refuses a file that is not a style, and one that classifies nothing', () => {
    expect(() => mapboxStyleToSymbology('<StyledLayerDescriptor/>')).toThrow('valid JSON');
    expect(() => mapboxStyleToSymbology('{"version":8}')).toThrow('no layers');
    expect(() =>
      mapboxStyleToSymbology(
        JSON.stringify({
          layers: [
            { id: 'ramp', type: 'fill', paint: { 'fill-color': ['interpolate', ['linear'], ['get', 'risk'], 0, '#fff', 1, '#000'] } },
          ],
        }),
      ),
    ).toThrow('nothing to convert');
  });
});
