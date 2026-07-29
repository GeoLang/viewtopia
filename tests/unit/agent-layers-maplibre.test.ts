import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook, cleanup } from '@testing-library/react';
import { useAgentLayersMapLibre } from '../../src/hooks/useAgentLayersMapLibre';
import { useAgentLayerStore, type AgentLayer } from '../../src/store/agentLayers';
import { useAppStore } from '../../src/store/app';

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
    useAgentLayerStore.setState({ layers: [], markers: [], generation: 0 });
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
      useAgentLayerStore.getState().classify('risk', 'risk');
    });

    const data = map.source('agent-layer-risk')?.data as GeoJSON.FeatureCollection;
    const fills = data.features.map((f) => f.properties?.fill);
    expect(fills.every(Boolean)).toBe(true);
    expect(new Set(fills).size).toBe(2);

    act(() => {
      useAgentLayerStore.getState().classify('risk', null);
    });
    const plain = map.source('agent-layer-risk')?.data as GeoJSON.FeatureCollection;
    expect(plain.features.map((f) => f.properties?.fill)).toEqual([undefined, undefined]);
  });
});
