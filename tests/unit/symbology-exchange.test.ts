import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  mapboxStyleToSymbology,
  symbologyToMapboxStyle,
} from '../../src/features/symbology/mapboxStyle';
import { qmlExportLosses, qmlToSymbology, symbologyToQml } from '../../src/features/symbology/qmlStyle';
import { sldExportLosses, symbologyToSld } from '../../src/features/symbology/sldExport';
import type { ExpressionSymbology, Symbology } from '../../src/features/symbology/symbology';
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
            { id: 'literal', type: 'fill', paint: { 'fill-color': ['rgb', 255, 0, 0] } },
          ],
        }),
      ),
    ).toThrow('nothing to convert');
    // an interpolate over something that is not arithmetic carries no expression
    expect(() =>
      mapboxStyleToSymbology(
        JSON.stringify({
          layers: [
            { id: 'by-zoom', type: 'fill', paint: { 'fill-color': ['interpolate', ['linear'], ['zoom'], 0, '#fff', 1, '#000'] } },
          ],
        }),
      ),
    ).toThrow('nothing to convert');
  });
});

const qmlFixtures = join(dirname(fileURLToPath(import.meta.url)), '../fixtures/qml');
const qml = (name: string) => readFileSync(join(qmlFixtures, `${name}.qml`), 'utf8');

const details = (conversion: { unsupported: { detail: string }[] }) =>
  conversion.unsupported.map((entry) => entry.detail).join(' | ');

describe('importing a QGIS layer style', () => {
  it('reads a categorized renderer QGIS wrote, values and colours alike', () => {
    const conversion = qmlToSymbology(qml('categorized'));

    expect(conversion.symbology).toEqual(CATEGORIZED);
    expect(conversion.source).toBe('QGIS 3.28.0-Firenze');
    expect(conversion.color).toBeNull();
    expect(conversion.zoomRange).toBeNull();
    // the fill outline is real drawing this shape cannot hold, so it is reported
    expect(details(conversion)).toContain('outline_color');
  });

  it('reads a graduated renderer as its breaks, colours and classification method', () => {
    const conversion = qmlToSymbology(qml('graduated'));

    expect(conversion.symbology).toEqual(GRADUATED);
    expect(details(conversion)).toContain('placeholder');
    expect(details(conversion)).toContain('top class ceiling');
  });

  it('reads a rule renderer as the rules it can test, and drops the else rule', () => {
    const conversion = qmlToSymbology(qml('rules'));

    expect(conversion.symbology).toEqual(RULES);
    expect(details(conversion)).toContain('the else rule is dropped');
    expect(details(conversion)).toContain('a scale range on one rule is dropped');
  });

  it('reads a single symbol as the layer colour, with its opacity and scale range', () => {
    const conversion = qmlToSymbology(qml('single-symbol'));

    expect(conversion.symbology).toBeNull();
    expect(conversion.color).toBe('#3388ff');
    expect(conversion.opacity).toBe(0.45);
    expect(conversion.zoomRange).toEqual({ min: 8, max: 12 });
  });

  it('reads the older prop encoding and the older classification mode', () => {
    const conversion = qmlToSymbology(qml('legacy-props'));

    expect(conversion.symbology).toEqual({
      kind: 'graduated',
      field: 'risk',
      method: 'quantile',
      ramp: 'viridis',
      breaks: [0, 50],
      colors: ['#440154', '#fde725'],
    });
  });

  it('types numeric categories, and drops the classes a symbology has no place for', () => {
    const conversion = qmlToSymbology(qml('categorized-quirks'));

    expect(conversion.symbology).toEqual({
      kind: 'categorized',
      field: 'zone',
      // the QGIS 3.40 colour carries a lossless suffix after the four channels
      categories: [{ value: 1, color: '#e15759' }],
    });
    expect(details(conversion)).toContain('the hidden class 2 is dropped');
    expect(details(conversion)).toContain('the all-other-values class is dropped');
    expect(details(conversion)).toContain('a symbol opacity of its own is dropped');
    expect(details(conversion)).toContain('a class colour transparency is dropped');
  });

  it('refuses a renderer it cannot convert, naming the renderer', () => {
    expect(() => qmlToSymbology(qml('heatmap'))).toThrow('heatmapRenderer');
    expect(() => qmlToSymbology('<StyledLayerDescriptor version="1.0.0"/>')).toThrow(
      '<StyledLayerDescriptor>, not <qgis>',
    );
    expect(() => qmlToSymbology('{"version":8}')).toThrow('valid XML');
    expect(() => qmlToSymbology('<qgis version="3.34.0"/>')).toThrow('no vector renderer');
  });
});

describe('exporting symbology as a QGIS layer style', () => {
  it('writes one category per class, with the class colour as a QGIS colour', () => {
    const written = symbologyToQml(scored(CATEGORIZED));

    expect(written).toContain('type="categorizedSymbol" attr="type"');
    expect(written).toContain('<category value="forest" symbol="0" label="forest" render="true"/>');
    expect(written).toContain('value="water &amp; marsh"');
    expect(written).toContain('<Option name="color" value="27,120,55,255" type="QString"/>');
    expect(written).toContain('class="SimpleFill"');
  });

  it('writes graduated ranges that meet end to end, and the classification method', () => {
    const written = symbologyToQml(scored(GRADUATED));

    expect(written).toContain('<range lower="0" upper="25" symbol="0"');
    expect(written).toContain('<range lower="25" upper="50" symbol="1"');
    // the top class runs to the highest value in the data, as the SLD export closes it
    expect(written).toContain('<range lower="50" upper="90" symbol="2"');
    expect(written).toContain('<classificationMethod id="EqualInterval"/>');
  });

  it('writes each rule as the QGIS expression that tests it', () => {
    const written = symbologyToQml(scored(RULES));

    expect(written).toContain('filter="&quot;risk&quot; &gt;= 80"');
    expect(written).toContain('filter="&quot;type&quot; = &apos;water&apos;"');
    expect(written).toContain('type="RuleRenderer"');
  });

  it('writes a single symbol renderer for a layer that has one colour', () => {
    const written = symbologyToQml(layerOf([polygon({ risk: 1 })]));

    expect(written).toContain('type="singleSymbol"');
    expect(written).toContain('<Option name="color" value="51,136,255,255" type="QString"/>');
    expect(written).toContain('<layerOpacity>0.3</layerOpacity>');
  });

  it('symbolizes points and lines the way their geometry draws', () => {
    expect(symbologyToQml(layerOf([point({ type: 'forest' })], CATEGORIZED))).toContain(
      'class="SimpleMarker"',
    );
    expect(symbologyToQml(layerOf([line({ type: 'forest' })], CATEGORIZED))).toContain(
      '<Option name="line_color" value="27,120,55,255" type="QString"/>',
    );
  });

  it('writes the zoom range as the scale denominators QGIS limits by', () => {
    const limited = { ...scored(CATEGORIZED), zoomRange: { min: 8, max: 12 } };
    const written = symbologyToQml(limited);

    expect(written).toContain('hasScaleBasedVisibilityFlag="1"');
    // minScale is the zoomed-out limit, so it is the larger denominator
    expect(written).toMatch(/minScale="2183915\.09/);
    expect(written).toMatch(/maxScale="136494\.69/);
    expect(symbologyToQml(scored(CATEGORIZED))).toContain('hasScaleBasedVisibilityFlag="0"');
  });
});

/** What a layer's own QGIS style converts back to, class for class. */
const qmlRoundTrip = (layer: AgentLayer) => qmlToSymbology(symbologyToQml(layer));

describe('round-tripping symbology through a QGIS layer style', () => {
  it('brings a categorized renderer back unchanged, text and numeric values alike', () => {
    expect(qmlRoundTrip(scored(CATEGORIZED)).symbology).toEqual(CATEGORIZED);

    const numeric: Symbology = {
      kind: 'categorized',
      field: 'risk',
      categories: [
        { value: 10, color: '#1b7837' },
        { value: 90, color: '#2166ac' },
      ],
    };
    expect(qmlRoundTrip(scored(numeric)).symbology).toEqual(numeric);
  });

  it('brings a graduated renderer back with its breaks, colours and method', () => {
    expect(qmlRoundTrip(scored(GRADUATED)).symbology).toEqual(GRADUATED);

    const quantile: Symbology = { ...GRADUATED, method: 'quantile' };
    expect(qmlRoundTrip(scored(quantile)).symbology).toEqual(quantile);
  });

  it('brings rules back with their operators and literals', () => {
    expect(qmlRoundTrip(scored(RULES)).symbology).toEqual(RULES);

    const everyOp: Symbology = {
      kind: 'rules',
      rules: [
        { field: 'risk', op: '<', value: '1', color: '#111111' },
        { field: 'risk', op: '<=', value: '2', color: '#222222' },
        { field: 'risk', op: '>', value: '3', color: '#333333' },
        { field: 'risk', op: '!=', value: 'x', color: '#444444' },
        { field: 'type', op: '==', value: "o'brien", color: '#555555' },
      ],
    };
    expect(qmlRoundTrip(scored(everyOp)).symbology).toEqual(everyOp);
  });

  it('brings the single colour, the opacity and the zoom range back', () => {
    const styled: AgentLayer = {
      ...layerOf([polygon({ risk: 1 })]),
      style: { opacity: 0.7 },
      zoomRange: { min: 6, max: 14 },
    };
    const conversion = qmlRoundTrip(styled);

    expect(conversion.symbology).toBeNull();
    expect(conversion.color).toBe('#3388ff');
    expect(conversion.opacity).toBe(0.7);
    expect(conversion.zoomRange).toEqual({ min: 6, max: 14 });
  });
});

const EXPRESSION: ExpressionSymbology = {
  kind: 'expression',
  expression: 'population / area',
  ramp: 'magma',
  domain: [100, 400],
};

const SIZED_EXPRESSION: ExpressionSymbology = { ...EXPRESSION, sizes: [3, 12] };

const populated = (symbology: Symbology, geometry = polygon) =>
  layerOf(
    [
      geometry({ population: 1000, area: 10 }),
      geometry({ population: 2000, area: 5 }),
    ],
    symbology,
  );

describe('exchanging an expression renderer', () => {
  it('writes the arithmetic as ogc filter maths in an SLD, class by class', () => {
    const sld = symbologyToSld(populated(EXPRESSION)) ?? '';

    expect(sld).toContain(
      '<ogc:Div><ogc:PropertyName>population</ogc:PropertyName><ogc:PropertyName>area</ogc:PropertyName></ogc:Div>',
    );
    expect(sld.match(/<Rule>/g)).toHaveLength(5);
    const lowers = [...sld.matchAll(/<ogc:LowerBoundary><ogc:Literal>([-\d.]+)</g)].map((m) =>
      Number(m[1]),
    );
    expect(lowers).toEqual([100, 160, 220, 280, 340]);
    expect(sldExportLosses(EXPRESSION)[0].detail).toContain('5 classes');
  });

  it('sizes an SLD point graphic per class, and says nothing was lost that was not', () => {
    const sld = symbologyToSld(populated(SIZED_EXPRESSION, point)) ?? '';
    expect(sld).toContain('<Size>6</Size>');
    expect(sld).toContain('<Size>24</Size>');
    expect(sldExportLosses(SIZED_EXPRESSION)).toHaveLength(1);
  });

  it('carries the arithmetic, the ramp and the sizes whole through a Mapbox style', () => {
    const paint = paintOf(populated(SIZED_EXPRESSION, point));
    expect(paint['circle-color'].slice(0, 3)).toEqual([
      'interpolate',
      ['linear'],
      ['/', ['get', 'population'], ['get', 'area']],
    ]);
    expect(paint['circle-radius'].slice(3)).toEqual([100, 3, 175, 5.25, 250, 7.5, 325, 9.75, 400, 12]);

    const conversion = mapboxStyleToSymbology(symbologyToMapboxStyle(populated(SIZED_EXPRESSION, point)) ?? '');
    expect(conversion.symbology).toEqual(SIZED_EXPRESSION);
    expect(conversion.unsupported).toEqual([]);
  });

  it('keeps the sizes when the style splits its polygons and points across layers', () => {
    const mixed = layerOf(
      [polygon({ population: 1000, area: 10 }), point({ population: 2000, area: 5 })],
      SIZED_EXPRESSION,
    );
    const conversion = mapboxStyleToSymbology(symbologyToMapboxStyle(mixed) ?? '');
    expect(conversion.symbology).toMatchObject({ sizes: [3, 12] });
  });

  it('reads a hand-written interpolate back, reporting a ramp it does not hold', () => {
    const conversion = mapboxStyleToSymbology(
      JSON.stringify({
        layers: [
          {
            id: 'density',
            type: 'fill',
            paint: {
              'fill-color': [
                'interpolate',
                ['linear'],
                ['*', ['get', 'pop'], 2],
                0, '#ffffff',
                50, '#000000',
              ],
            },
          },
        ],
      }),
    );

    expect(conversion.symbology).toEqual({
      kind: 'expression',
      expression: 'pop * 2',
      ramp: 'viridis',
      domain: [0, 50],
    });
    expect(conversion.unsupported[0].detail).toContain('no ramp this viewer holds');
  });

  it('round-trips the colour through a QGIS style, saying the ramp became classes', () => {
    const qml = symbologyToQml(populated(EXPRESSION));
    expect(qml).toContain('attr="population / area"');

    const conversion = qmlToSymbology(qml);
    expect(conversion.symbology).toEqual(EXPRESSION);
    expect(conversion.unsupported.map((entry) => entry.detail).join(' ')).toContain(
      'read back as one ramp',
    );
  });

  it('tells the user a QGIS style drops the point sizes', () => {
    const details = qmlExportLosses(SIZED_EXPRESSION).map((entry) => entry.detail);
    expect(details.some((detail) => detail.includes('point sizes are dropped'))).toBe(true);
    expect(qmlExportLosses(GRADUATED)).toEqual([]);
  });

  it('still reads a graduated renderer whose attr is a plain column', () => {
    expect(qmlRoundTrip(scored(GRADUATED)).symbology).toMatchObject({ kind: 'graduated' });
  });
});
