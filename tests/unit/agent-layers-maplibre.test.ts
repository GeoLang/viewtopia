import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook, cleanup } from '@testing-library/react';
import { markerElement, useAgentLayersMapLibre } from '../../src/hooks/useAgentLayersMapLibre';
import { useAgentLayerStore, type AgentLayer } from '../../src/store/agentLayers';
import {
  POINT_RADIUS,
  buildExpression,
  buildGraduated,
} from '../../src/features/symbology/symbology';
import { useAppStore } from '../../src/store/app';
import { cornersOfBbox } from '../../src/overlay/georeference';

/** Enough of a maplibre style surface for the paint the hook writes. */
function fakeMap() {
  const layers: {
    id: string;
    paint: Record<string, unknown>;
    minzoom?: number;
    maxzoom?: number;
  }[] = [];
  const sources: Record<string, { data?: unknown }> = {};
  const handlers: Record<string, (() => void)[]> = {};
  let styleLoaded = true;
  return {
    setStyleLoaded: (loaded: boolean) => {
      styleLoaded = loaded;
    },
    fire: (event: string) => {
      for (const handler of handlers[event] ?? []) handler();
    },
    isStyleLoaded: () => styleLoaded,
    on: (event: string, handler: () => void) => {
      handlers[event] = [...(handlers[event] ?? []), handler];
    },
    off: (event: string, handler: () => void) => {
      handlers[event] = (handlers[event] ?? []).filter((known) => known !== handler);
    },
    getStyle: () => ({ layers: [...layers], sources: { ...sources } }),
    addSource: (id: string, spec: { data?: unknown }) => {
      sources[id] = spec;
    },
    removeSource: (id: string) => {
      delete sources[id];
    },
    addLayer: (layer: {
      id: string;
      paint: Record<string, unknown>;
      minzoom?: number;
      maxzoom?: number;
    }) => {
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

  it('takes a removed layer off a style that was loading when it went', () => {
    const map = fakeMap();
    act(() => {
      useAgentLayerStore.getState().addLayer(layer());
    });
    mount(map);
    expect(map.source('agent-layer-risk')).toBeDefined();

    // mid-load the effect can only wait for a `load` that has already fired, so
    // the settled style is what has to notice
    map.setStyleLoaded(false);
    act(() => {
      useAgentLayerStore.getState().removeLayer('risk');
    });
    expect(map.source('agent-layer-risk')).toBeDefined();

    map.setStyleLoaded(true);
    act(() => map.fire('idle'));

    expect(map.source('agent-layer-risk')).toBeUndefined();
    expect(map.getStyle().layers).toEqual([]);
  });

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
    expect(map.layer('agent-layer-risk-circle')?.paint['circle-radius']).toEqual([
      'coalesce',
      ['get', 'marker-radius'],
      POINT_RADIUS,
    ]);
  });

  it('bakes the radius an expression renderer sized each point at', () => {
    const map = fakeMap();
    const towns: AgentLayer = {
      id: 'towns',
      name: 'Towns',
      color: '#ff0000',
      geojson: {
        type: 'FeatureCollection',
        features: [1, 4].map((population) => ({
          type: 'Feature',
          properties: { population, area: 1 },
          geometry: { type: 'Point', coordinates: [12, 45] },
        })),
      },
    };
    act(() => {
      useAgentLayerStore.getState().addLayer(towns);
    });
    mount(map);

    act(() => {
      const l = useAgentLayerStore.getState().layers.find((x) => x.id === 'towns');
      const sym = l && buildExpression(l, 'population / area', 'viridis', [3, 12]);
      useAgentLayerStore.getState().setSymbology('towns', sym ?? null);
    });

    const data = map.source('agent-layer-towns')?.data as GeoJSON.FeatureCollection;
    expect(data.features.map((f) => f.properties?.['marker-radius'])).toEqual([3, 12]);
    expect(data.features.map((f) => f.properties?.['marker-size'])).toEqual(['small', 'large']);
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

  it('hands the zoom range to maplibre, which hides the layer outside it', () => {
    const map = fakeMap();
    act(() => {
      useAgentLayerStore.getState().addLayer({ ...layer(), zoomRange: { min: 8, max: 12 } });
    });
    mount(map);

    for (const kind of ['fill', 'line', 'circle']) {
      expect(map.layer(`agent-layer-risk-${kind}`)).toMatchObject({ minzoom: 8, maxzoom: 12 });
    }

    // no range means maplibre's own full span, so nothing is hidden
    act(() => {
      useAgentLayerStore.getState().setZoomRange('risk', null);
    });
    expect(map.layer('agent-layer-risk-fill')).toMatchObject({ minzoom: 0, maxzoom: 24 });
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
