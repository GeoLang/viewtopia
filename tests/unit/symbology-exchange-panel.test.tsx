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

  it('offers nothing to export while the layer has one colour', () => {
    showEditor(landuse());
    expect(screen.getByTestId('symbology-export-sld')).toBeDisabled();
    expect(screen.getByTestId('symbology-export-mapbox')).toBeDisabled();
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
