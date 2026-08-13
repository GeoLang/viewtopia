import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { SymbologyEditor } from '../../src/features/symbology/SymbologyEditor';
import { useAgentLayerStore, type AgentLayer } from '../../src/store/agentLayers';

window.matchMedia = vi.fn().mockReturnValue({
  matches: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
});
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const downloads: { name: string; blob: Blob }[] = [];
const blobs = new Map<string, Blob>();
URL.createObjectURL = vi.fn((blob: Blob) => {
  const href = `blob:${blobs.size}`;
  blobs.set(href, blob);
  return href;
});
URL.revokeObjectURL = vi.fn();
vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
  this: HTMLAnchorElement,
) {
  const blob = blobs.get(this.href);
  if (blob) downloads.push({ name: this.download, blob });
});

const landuse = (symbology?: AgentLayer['symbology']): AgentLayer => ({
  id: 'landuse',
  name: 'Land use',
  color: '#ff0000',
  symbology,
  geojson: {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { type: 'forest' },
        geometry: {
          type: 'Polygon',
          coordinates: [[[12, 45], [13, 45], [13, 46], [12, 46], [12, 45]]],
        },
      },
      {
        type: 'Feature',
        properties: { type: 'water' },
        geometry: {
          type: 'Polygon',
          coordinates: [[[14, 45], [15, 45], [15, 46], [14, 46], [14, 45]]],
        },
      },
    ],
  },
});

const CATEGORIZED = {
  kind: 'categorized',
  field: 'type',
  categories: [
    { value: 'forest', color: '#1b7837' },
    { value: 'water', color: '#2166ac' },
  ],
} as const;

const MAPBOX_STYLE = JSON.stringify({
  version: 8,
  layers: [
    {
      id: 'landuse-fill',
      type: 'fill',
      paint: { 'fill-color': ['match', ['get', 'type'], 'forest', '#1b7837', 'water', '#2166ac', '#eee'] },
    },
  ],
});

const qml = (name: string) =>
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../fixtures/qml', `${name}.qml`),
    'utf8',
  );

const QML_CATEGORIZED = qml('landuse');
const QML_SINGLE_SYMBOL = qml('single-symbol');

function showEditor(layer: AgentLayer) {
  act(() => {
    useAgentLayerStore.getState().addLayer(layer);
  });
  render(
    <MantineProvider>
      <LiveSymbologyEditor layerId={layer.id} />
    </MantineProvider>,
  );
}

function LiveSymbologyEditor({ layerId }: { layerId: string }) {
  const layer = useAgentLayerStore((s) => s.layers.find((l) => l.id === layerId));
  return layer ? <SymbologyEditor layer={layer} /> : null;
}

beforeEach(() => {
  cleanup();
  downloads.length = 0;
  useAgentLayerStore.setState({
    layers: [],
    rasterLayers: [],
    editingRasterId: null,
    markers: [],
    generation: 0,
  });
});

describe('exporting a layer\'s symbology from the editor', () => {
  it('saves an SLD document named after the layer', async () => {
    showEditor(landuse(CATEGORIZED));
    fireEvent.click(screen.getByTestId('symbology-export-sld'));

    expect(downloads).toHaveLength(1);
    expect(downloads[0].name).toBe('land-use.sld');
    expect(await downloads[0].blob.text()).toContain(
      '<ogc:PropertyName>type</ogc:PropertyName><ogc:Literal>forest</ogc:Literal>',
    );
  });

  it('saves a Mapbox style document', async () => {
    showEditor(landuse(CATEGORIZED));
    fireEvent.click(screen.getByTestId('symbology-export-mapbox'));

    expect(downloads[0].name).toBe('land-use.json');
    const style = JSON.parse(await downloads[0].blob.text());
    expect(style.layers[0].paint['fill-color'][0]).toBe('match');
  });

  it('saves a QGIS layer style', async () => {
    showEditor(landuse(CATEGORIZED));
    fireEvent.click(screen.getByTestId('symbology-export-qml'));

    expect(downloads[0].name).toBe('land-use.qml');
    expect(await downloads[0].blob.text()).toContain('type="categorizedSymbol" attr="type"');
  });

  it('offers nothing to export while the layer has one colour, bar the QGIS style', () => {
    showEditor(landuse());
    expect(screen.getByTestId('symbology-export-sld')).toBeDisabled();
    expect(screen.getByTestId('symbology-export-mapbox')).toBeDisabled();
    // a single symbol renderer is a QGIS renderer, so that one still has something to write
    expect(screen.getByTestId('symbology-export-qml')).toBeEnabled();
  });
});

describe('importing a Mapbox style onto a layer', () => {
  const chooseFile = (contents: string, name: string) => {
    const inputs = document.querySelectorAll('input[type="file"]');
    const input = inputs[1];
    if (!(input instanceof HTMLInputElement)) throw new Error('no Mapbox file input rendered');
    fireEvent.change(input, { target: { files: [new File([contents], name)] } });
  };

  it('applies the converted symbology and bakes the class colours in', async () => {
    showEditor(landuse());
    chooseFile(MAPBOX_STYLE, 'landuse.json');

    await waitFor(() =>
      expect(useAgentLayerStore.getState().layers[0].symbology).toEqual(CATEGORIZED),
    );
    const [forest, water] = useAgentLayerStore.getState().layers[0].geojson.features;
    expect(forest.properties?.fill).toBe('#1b7837');
    expect(water.properties?.fill).toBe('#2166ac');
    expect(await screen.findByTestId('mapbox-applied')).toHaveTextContent(
      'categorized symbology from landuse-fill',
    );
    expect(screen.getByTestId('mapbox-unsupported')).toHaveTextContent('the fallback colour #eee');
  });

  it('says why a style it cannot read was refused', async () => {
    showEditor(landuse());
    chooseFile('not a style', 'landuse.json');

    expect(await screen.findByTestId('mapbox-error')).toHaveTextContent('valid JSON');
    expect(useAgentLayerStore.getState().layers[0].symbology).toBeUndefined();
  });
});

describe('importing a QGIS layer style onto a layer', () => {
  const chooseFile = (contents: string, name: string) => {
    const inputs = document.querySelectorAll('input[type="file"]');
    const input = inputs[2];
    if (!(input instanceof HTMLInputElement)) throw new Error('no QGIS style file input rendered');
    fireEvent.change(input, { target: { files: [new File([contents], name)] } });
  };

  it('applies the converted symbology and bakes the class colours in', async () => {
    showEditor(landuse());
    chooseFile(QML_CATEGORIZED, 'landuse.qml');

    await waitFor(() =>
      expect(useAgentLayerStore.getState().layers[0].symbology).toEqual(CATEGORIZED),
    );
    const [forest, water] = useAgentLayerStore.getState().layers[0].geojson.features;
    expect(forest.properties?.fill).toBe('#1b7837');
    expect(water.properties?.fill).toBe('#2166ac');
    expect(await screen.findByTestId('qml-applied')).toHaveTextContent(
      'categorized symbology from QGIS 3.28.0-Firenze',
    );
    expect(screen.getByTestId('qml-unsupported')).toHaveTextContent('outline_color');
  });

  it('takes the single colour, opacity and zoom range off a single symbol style', async () => {
    showEditor(landuse());
    chooseFile(QML_SINGLE_SYMBOL, 'landuse.qml');

    await waitFor(() => expect(useAgentLayerStore.getState().layers[0].color).toBe('#3388ff'));
    const layer = useAgentLayerStore.getState().layers[0];
    expect(layer.symbology).toBeUndefined();
    expect(layer.style?.opacity).toBe(0.45);
    expect(layer.zoomRange).toEqual({ min: 8, max: 12 });
    expect(await screen.findByTestId('qml-single-symbol')).toHaveTextContent(
      'paints every feature the same',
    );
  });

  it('says why a style it cannot read was refused', async () => {
    showEditor(landuse());
    chooseFile('<qgis version="3.34.0"><renderer-v2 type="heatmapRenderer"/></qgis>', 'landuse.qml');

    expect(await screen.findByTestId('qml-error')).toHaveTextContent('heatmapRenderer');
    expect(useAgentLayerStore.getState().layers[0].symbology).toBeUndefined();
  });
});

const towns = (): AgentLayer => ({
  id: 'towns',
  name: 'Towns',
  color: '#ff0000',
  geojson: {
    type: 'FeatureCollection',
    features: [
      { population: 1000, area: 10 },
      { population: 2000, area: 5 },
    ].map((properties) => ({
      type: 'Feature',
      properties,
      geometry: { type: 'Point', coordinates: [12, 45] },
    })),
  },
});

const symbologyOf = () => useAgentLayerStore.getState().layers[0].symbology;

const chooseKind = (kind: string) => {
  fireEvent.click(screen.getByTestId('agent-layer-symbology-kind'));
  fireEvent.click(screen.getByRole('option', { name: kind }));
};

describe('styling a layer by an expression from the editor', () => {
  it('seeds from a column, then restyles as the expression is typed', () => {
    showEditor(towns());
    chooseKind('Expression');

    expect(symbologyOf()).toMatchObject({ kind: 'expression', expression: 'population' });

    fireEvent.change(screen.getByTestId('agent-layer-expression'), {
      target: { value: 'population / area' },
    });
    expect(symbologyOf()).toMatchObject({
      kind: 'expression',
      expression: 'population / area',
      domain: [100, 400],
    });
    // the class colour lands on the feature, which is what every renderer reads
    const [small] = useAgentLayerStore.getState().layers[0].geojson.features;
    expect(small.properties?.['marker-color']).toMatch(/^rgb\(/);
  });

  it('says what is wrong with a half-written expression and keeps the last good one', () => {
    showEditor(towns());
    chooseKind('Expression');

    fireEvent.change(screen.getByTestId('agent-layer-expression'), {
      target: { value: 'population /' },
    });
    expect(screen.getByTestId('agent-layer-expression-error')).toHaveTextContent(
      'ends where a value was expected',
    );
    expect(symbologyOf()).toMatchObject({ expression: 'population' });
  });

  it('sizes the points on request, and reports what an export cannot carry', async () => {
    showEditor(towns());
    chooseKind('Expression');
    fireEvent.click(screen.getByTestId('agent-layer-expression-sized'));

    expect(symbologyOf()).toMatchObject({ sizes: [3, 12] });
    const [small, large] = useAgentLayerStore.getState().layers[0].geojson.features;
    expect(small.properties?.['marker-radius']).toBe(3);
    expect(large.properties?.['marker-radius']).toBe(12);

    fireEvent.click(screen.getByTestId('symbology-export-qml'));
    expect(await downloads[0].blob.text()).toContain('attr="population"');
    expect(screen.getByTestId('symbology-export-unsupported')).toHaveTextContent(
      'point sizes are dropped',
    );
  });

  it('reports nothing lost when the Mapbox export carries the whole renderer', () => {
    showEditor(towns());
    chooseKind('Expression');
    fireEvent.click(screen.getByTestId('symbology-export-mapbox'));

    expect(screen.queryByTestId('symbology-export-unsupported')).not.toBeInTheDocument();
  });
});
