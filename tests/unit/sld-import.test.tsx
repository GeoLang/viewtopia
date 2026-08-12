import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { SymbologyEditor } from '../../src/features/symbology/SymbologyEditor';
import { convertSld } from '../../src/features/symbology/sldConversion';
import { useAgentLayerStore, type AgentLayer } from '../../src/store/agentLayers';
import { useAuthStore } from '../../src/features/auth/store';

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

const SLD = '<StyledLayerDescriptor version="1.0.0"/>';

/** A live session token: the refusal path only ends a session that has an exp. */
const TOKEN = `header.${btoa(
  JSON.stringify({ sub: 'mapper', exp: Math.floor(Date.now() / 1000) + 3600 }),
)}.signature`;

const landuse = (): AgentLayer => ({
  id: 'landuse',
  name: 'Landuse',
  color: '#ff0000',
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

/** What fenestra answers for a two-class categorized style. */
const CATEGORIZED = {
  layer: 'landuse',
  style: 'by-type',
  symbology: {
    kind: 'categorized',
    field: 'type',
    categories: [
      { value: 'forest', color: '#1B7837' },
      { value: 'water', color: '#2166AC' },
    ],
  },
  unsupported: [
    {
      construct: 'TextSymbolizer',
      rule_index: null,
      rule_name: null,
      detail: 'labels are dropped: symbology sets colour only',
    },
    {
      construct: 'And',
      rule_index: 0,
      rule_name: 'big-towns',
      detail: 'rule dropped: a symbology rule tests one property against one literal',
    },
  ],
};

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

const textResponse = (body: string, status: number) =>
  new Response(body, { status, headers: { 'Content-Type': 'text/plain' } });

function stubFetch(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  cleanup();
  useAgentLayerStore.setState({
    layers: [],
    rasterLayers: [],
    editingRasterId: null,
    markers: [],
    generation: 0,
  });
  useAuthStore.setState({ loggedIn: true, token: TOKEN, user: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('convertSld', () => {
  it('posts the document to fenestra with the session bearer', async () => {
    const fetchMock = stubFetch(jsonResponse(CATEGORIZED));
    const conversion = await convertSld(SLD);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/ogc/sld/symbology');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(SLD);
    expect(new Headers(init.headers).get('Authorization')).toBe(`Bearer ${TOKEN}`);
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/xml');

    expect(conversion.layer).toBe('landuse');
    expect(conversion.style).toBe('by-type');
    expect(conversion.symbology).toEqual(CATEGORIZED.symbology);
    expect(conversion.unsupported).toHaveLength(2);
  });

  it('reads a style that classifies nothing as an answer, not a failure', async () => {
    stubFetch(jsonResponse({ ...CATEGORIZED, symbology: null, unsupported: [] }));
    const conversion = await convertSld(SLD);
    expect(conversion.symbology).toBeNull();
    expect(conversion.layer).toBe('landuse');
  });

  it('reports the reason a rejected document was rejected', async () => {
    stubFetch(textResponse('no NamedLayer in SLD document', 400));
    await expect(convertSld(SLD)).rejects.toThrow('no NamedLayer in SLD document');
  });

  it('ends the session when the bearer is refused', async () => {
    stubFetch(textResponse('unauthorized', 401));
    await expect(convertSld(SLD)).rejects.toThrow();
    expect(useAuthStore.getState().token).toBeNull();
  });

  it('refuses a symbology it could not render', async () => {
    stubFetch(
      jsonResponse({
        ...CATEGORIZED,
        symbology: { kind: 'graduated', field: 'pop', method: 'jenks', ramp: 'viridis', breaks: [1], colors: ['#fff'] },
      }),
    );
    await expect(convertSld(SLD)).rejects.toThrow('cannot read');
  });
});

/** The editor as the layer panel mounts it: fed the layer straight from the store. */
function LiveSymbologyEditor({ layerId }: { layerId: string }) {
  const layer = useAgentLayerStore((s) => s.layers.find((l) => l.id === layerId));
  return layer ? <SymbologyEditor layer={layer} /> : null;
}

describe('importing an SLD onto a layer', () => {
  const showEditor = () => {
    act(() => {
      useAgentLayerStore.getState().addLayer(landuse());
    });
    render(
      <MantineProvider>
        <LiveSymbologyEditor layerId="landuse" />
      </MantineProvider>,
    );
  };

  const chooseFile = () => {
    const input = document.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement)) throw new Error('no file input rendered');
    fireEvent.change(input, { target: { files: [new File([SLD], 'landuse.sld')] } });
  };

  it('applies the returned symbology and bakes the class colours in', async () => {
    stubFetch(jsonResponse(CATEGORIZED));
    showEditor();
    chooseFile();

    await waitFor(() =>
      expect(useAgentLayerStore.getState().layers[0].symbology).toEqual(CATEGORIZED.symbology),
    );
    const [forest, water] = useAgentLayerStore.getState().layers[0].geojson.features;
    expect(forest.properties?.fill).toBe('#1B7837');
    expect(water.properties?.fill).toBe('#2166AC');
    expect(await screen.findByTestId('sld-applied')).toHaveTextContent('landuse / by-type');
  });

  it('lists everything the conversion could not carry', async () => {
    stubFetch(jsonResponse(CATEGORIZED));
    showEditor();
    chooseFile();

    const listed = await screen.findByTestId('sld-unsupported');
    expect(listed).toHaveTextContent('Not carried across (2)');
    expect(listed).toHaveTextContent('TextSymbolizer: labels are dropped');
    expect(listed).toHaveTextContent('And (big-towns): rule dropped');
  });

  it('says the file classified nothing and leaves the layer alone', async () => {
    stubFetch(
      jsonResponse({
        ...CATEGORIZED,
        symbology: null,
        unsupported: [
          {
            construct: 'Rule',
            rule_index: 0,
            rule_name: null,
            detail: 'rule dropped: it has no filter, so it paints every feature #FF0000',
          },
        ],
      }),
    );
    showEditor();
    chooseFile();

    expect(await screen.findByTestId('sld-nothing-classified')).toHaveTextContent(
      'classifies nothing by a property',
    );
    expect(useAgentLayerStore.getState().layers[0].symbology).toBeUndefined();
    expect(screen.getByTestId('sld-unsupported')).toHaveTextContent('rule 1');
  });

  it('shows a rejected document as the server explained it', async () => {
    stubFetch(textResponse('no UserStyle named winter', 400));
    showEditor();
    chooseFile();

    expect(await screen.findByTestId('sld-error')).toHaveTextContent('no UserStyle named winter');
    expect(useAgentLayerStore.getState().layers[0].symbology).toBeUndefined();
  });
});
