import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook, cleanup } from '@testing-library/react';
import { markerElement, useAgentLayersMapLibre } from '../../src/hooks/useAgentLayersMapLibre';
import { useAgentLayerStore, type AgentLayer } from '../../src/store/agentLayers';
import { buildGraduated } from '../../src/features/symbology/symbology';
import { useAppStore } from '../../src/store/app';
import { cornersOfBbox } from '../../src/overlay/georeference';

/** Enough of a maplibre style surface for the paint the hook writes. */
function fakeMap() {
  const layers: { id: string; paint: Record<string, unknown> }[] = [];
  const sources: Record<string, { data?: unknown }> = {};
  return {
    isStyleLoaded: () => true,
    on: () => undefined,
    off: () => undefined,
    getStyle: () => ({ layers: [...layers], sources: { ...sources } }),
    addSource: (id: string, spec: { data?: unknown }) => {
      sources[id] = spec;
    },
    removeSource: (id: string) => {
      delete sources[id];
    },
    addLayer: (layer: { id: string; paint: Record<string, unknown> }) => {
      layers.push(layer);
    },
    removeLayer: (id: string) => {
      layers.splice(
        layers.findIndex((l) => l.id === id),
        1,
      );
    },
    fitBounds: () => undefined,
    layer: (id: string) => layers.find((l) => l.id === id),
    source: (id: string) => sources[id],
  };
}

const square: GeoJSON.Feature = {
  type: 'Feature',
  properties: { risk: 5 },
  geometry: {
    type: 'Polygon',
    coordinates: [[[12, 45], [13, 45], [13, 46], [12, 46], [12, 45]]],
  },
};

const layer = (): AgentLayer => ({
  id: 'risk',
  name: 'Flood risk',
  color: '#ff0000',
  geojson: {
    type: 'FeatureCollection',
    features: [square, { ...square, properties: { risk: 50 } }],
  },
});

describe('useAgentLayersMapLibre', () => {
  beforeEach(() => {
    cleanup();
    useAgentLayerStore.setState({ layers: [], rasterLayers: [], markers: [], generation: 0 });
    useAppStore.setState({ renderer: 'maplibre', activeTab: 'globe' });
  });

  const mount = (map: ReturnType<typeof fakeMap>) => {
    const ref = { current: map } as unknown as Parameters<typeof useAgentLayersMapLibre>[0];
    return renderHook(() => useAgentLayersMapLibre(ref));
  };

  it('reads a per-feature colour, falling back to the layer colour', () => {
    const map = fakeMap();
    act(() => {
      useAgentLayerStore.getState().addLayer(layer());
    });
    mount(map);

    // an unclassified layer has no simplestyle property, so every feature draws
    // in the layer's own colour
    expect(map.layer('agent-layer-risk-fill')?.paint['fill-color']).toEqual([
      'coalesce',
      ['get', 'fill'],
      '#ff0000',
    ]);
    expect(map.layer('agent-layer-risk-line')?.paint['line-color']).toEqual([
      'coalesce',
      ['get', 'stroke'],
      '#ff0000',
    ]);
    expect(map.layer('agent-layer-risk-circle')?.paint['circle-color']).toEqual([
      'coalesce',
      ['get', 'marker-color'],
      '#ff0000',
    ]);
  });

  it('serves the source the classified features, so the paint has a colour to read', () => {
    const map = fakeMap();
    act(() => {
      useAgentLayerStore.getState().addLayer(layer());
    });
    mount(map);

    act(() => {
      const l = useAgentLayerStore.getState().layers.find((x) => x.id === 'risk');
      const sym = l && buildGraduated(l, 'risk');
      useAgentLayerStore.getState().setSymbology('risk', sym ?? null);
    });

    const data = map.source('agent-layer-risk')?.data as GeoJSON.FeatureCollection;
    const fills = data.features.map((f) => f.properties?.fill);
    expect(fills.every(Boolean)).toBe(true);
    expect(new Set(fills).size).toBe(2);

    act(() => {
      useAgentLayerStore.getState().setSymbology('risk', null);
    });
    const plain = map.source('agent-layer-risk')?.data as GeoJSON.FeatureCollection;
    expect(plain.features.map((f) => f.properties?.fill)).toEqual([undefined, undefined]);
  });

  it('drapes a raster layer as an image source on its corners', () => {
    const map = fakeMap();
    act(() => {
      useAgentLayerStore.getState().addRasterLayer({
        id: 'hs',
        name: 'hillshade',
        url: 'data:image/png;base64,AAA',
        corners: cornersOfBbox([12, 45, 13, 46]),
        visible: true,
        opacity: 0.8,
      });
    });
    mount(map);

    const src = map.source('agent-raster-hs') as unknown as {
      type: string;
      url: string;
      coordinates: [number, number][];
    };
    expect(src.type).toBe('image');
    expect(src.url).toBe('data:image/png;base64,AAA');
    // clockwise from the top left
    expect(src.coordinates).toEqual([
      [12, 46],
      [13, 46],
      [13, 45],
      [12, 45],
    ]);
    expect(map.layer('agent-raster-hs-raster')?.paint['raster-opacity']).toBe(0.8);
  });

  it('drapes a dragged overlay on its quad, without squaring it off', () => {
    const map = fakeMap();
    const quad = cornersOfBbox([12, 45, 13, 46]);
    quad[1] = [13.4, 46.3];
    act(() => {
      useAgentLayerStore.getState().addRasterLayer({
        id: 'plan',
        name: 'site plan',
        url: 'data:image/png;base64,AAA',
        corners: quad,
        visible: true,
        opacity: 0.8,
      });
    });
    mount(map);

    const src = map.source('agent-raster-plan') as unknown as {
      coordinates: [number, number][];
    };
    expect(src.coordinates[1]).toEqual([13.4, 46.3]);
  });

  it('leaves a hidden overlay off the map', () => {
    const map = fakeMap();
    act(() => {
      useAgentLayerStore.getState().addRasterLayer({
        id: 'plan',
        name: 'site plan',
        url: 'data:image/png;base64,AAA',
        corners: cornersOfBbox([12, 45, 13, 46]),
        visible: true,
        opacity: 0.8,
      });
    });
    mount(map);
    expect(map.source('agent-raster-plan')).toBeDefined();

    act(() => {
      useAgentLayerStore.getState().setLayerVisible('plan', false);
    });

    expect(map.source('agent-raster-plan')).toBeUndefined();
    expect(map.layer('agent-raster-plan-raster')).toBeUndefined();
  });

  it('leaves a hidden vector layer off the map and puts it back', () => {
    const map = fakeMap();
    act(() => {
      useAgentLayerStore.getState().addLayer(layer());
    });
    mount(map);
    expect(map.source('agent-layer-risk')).toBeDefined();

    act(() => {
      useAgentLayerStore.getState().setLayerVisible('risk', false);
    });
    expect(map.source('agent-layer-risk')).toBeUndefined();
    expect(map.layer('agent-layer-risk-fill')).toBeUndefined();

    act(() => {
      useAgentLayerStore.getState().setLayerVisible('risk', true);
    });
    expect(map.source('agent-layer-risk')).toBeDefined();
  });

  it('removing a raster layer takes its source and layer off the map', () => {
    const map = fakeMap();
    act(() => {
      useAgentLayerStore.getState().addRasterLayer({
        id: 'hs',
        name: 'hillshade',
        url: 'data:image/png;base64,AAA',
        corners: cornersOfBbox([12, 45, 13, 46]),
        visible: true,
        opacity: 0.8,
      });
    });
    mount(map);
    expect(map.source('agent-raster-hs')).toBeDefined();

    act(() => {
      useAgentLayerStore.getState().removeRasterLayer('hs');
    });

    expect(map.source('agent-raster-hs')).toBeUndefined();
    expect(map.layer('agent-raster-hs-raster')).toBeUndefined();
  });

  it('raster layers stack rather than replacing one another', () => {
    const map = fakeMap();
    act(() => {
      const store = useAgentLayerStore.getState();
      store.addRasterLayer({
        id: 'a',
        name: 'slope',
        url: 'data:image/png;base64,AAA',
        corners: cornersOfBbox([12, 45, 13, 46]),
        visible: true,
        opacity: 0.8,
      });
      store.addRasterLayer({
        id: 'b',
        name: 'aspect',
        url: 'data:image/png;base64,BBB',
        corners: cornersOfBbox([12, 45, 13, 46]),
        visible: true,
        opacity: 0.5,
      });
    });
    mount(map);

    expect(useAgentLayerStore.getState().rasterLayers).toHaveLength(2);
    expect(map.source('agent-raster-a')).toBeDefined();
    expect(map.source('agent-raster-b')).toBeDefined();
  });
});

describe('markerElement', () => {
  it('renders a label carrying markup as inert text', () => {
    const label = '<img src=x onerror="window.__owned = true">pin';

    const el = markerElement({ lon: 5, lat: 45, color: '#00ff00', label });

    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toBe(label);
  });

  it('drops a colour that carries more than a colour', () => {
    const el = markerElement({
      lon: 5,
      lat: 45,
      color: 'red;background-image:url(https://attacker.example/leak)',
    });
    const dot = el.lastElementChild as HTMLElement;

    expect(dot.style.backgroundImage).toBe('');
  });

  it('still paints a plain colour', () => {
    const el = markerElement({ lon: 5, lat: 45, color: '#00ff00' });
    const dot = el.lastElementChild as HTMLElement;

    expect(dot.style.background).toContain('rgb(0, 255, 0)');
  });
});
