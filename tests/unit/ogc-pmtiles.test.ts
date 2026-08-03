import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';
import { useOgcLayersMapLibre } from '../../src/hooks/useOgcLayersMapLibre';
import { useOgcLayerStore, pmtilesStyleUrl, type OGCLayer } from '../../src/store/ogcLayers';
import { useAppStore } from '../../src/store/app';

/** Enough of a maplibre style surface for the sources and layers the hook adds. */
function fakeMap() {
  const layers: { id: string; source?: string; 'source-layer'?: string; type?: string }[] = [];
  const sources: Record<string, { type?: string; url?: string; tiles?: string[] }> = {};
  return {
    isStyleLoaded: () => true,
    on: () => undefined,
    off: () => undefined,
    getStyle: () => ({ layers: [...layers], sources: { ...sources } }),
    addSource: (id: string, spec: { type?: string; url?: string }) => {
      sources[id] = spec;
    },
    removeSource: (id: string) => {
      delete sources[id];
    },
    addLayer: (layer: { id: string }) => {
      layers.push(layer);
    },
    removeLayer: (id: string) => {
      layers.splice(
        layers.findIndex((l) => l.id === id),
        1,
      );
    },
    layer: (id: string) => layers.find((l) => l.id === id),
    source: (id: string) => sources[id],
  };
}

const pmtilesLayer = (over: Partial<OGCLayer> = {}): OGCLayer => ({
  id: 'p1',
  name: 'parcels',
  type: 'pmtiles',
  url: 'https://example.org/parcels.pmtiles',
  pmtiles: { kind: 'vector', vectorLayers: ['parcels', 'roads'], minZoom: 0, maxZoom: 12 },
  ...over,
});

describe('PMTiles OGC layers on MapLibre', () => {
  beforeEach(() => {
    cleanup();
    useOgcLayerStore.setState({ layers: [] });
    useAppStore.setState({ renderer: 'maplibre', activeTab: 'globe' });
  });

  const mount = (map: ReturnType<typeof fakeMap>) => {
    const ref = { current: map } as unknown as Parameters<typeof useOgcLayersMapLibre>[0];
    return renderHook(() => useOgcLayersMapLibre(ref));
  };

  it('draws a vector archive as one styled set per source layer', () => {
    useOgcLayerStore.setState({ layers: [pmtilesLayer()] });
    const map = fakeMap();
    mount(map);

    expect(map.source('ogc-layer-p1')).toEqual({
      type: 'vector',
      url: 'pmtiles://https://example.org/parcels.pmtiles',
    });
    for (const sourceLayer of ['parcels', 'roads']) {
      for (const kind of ['fill', 'line', 'circle']) {
        const added = map.layer(`ogc-layer-p1-${sourceLayer}-${kind}`);
        expect(added?.['source-layer']).toBe(sourceLayer);
      }
    }
  });

  it('draws a raster archive as a raster source', () => {
    useOgcLayerStore.setState({
      layers: [pmtilesLayer({ pmtiles: { kind: 'raster', vectorLayers: [], minZoom: 0, maxZoom: 8 } })],
    });
    const map = fakeMap();
    mount(map);

    expect(map.source('ogc-layer-p1')?.type).toBe('raster');
    expect(map.layer('ogc-layer-p1-raster')?.type).toBe('raster');
  });

  it('adds nothing for an archive whose header has not been read yet', () => {
    useOgcLayerStore.setState({ layers: [pmtilesLayer({ pmtiles: undefined })] });
    const map = fakeMap();
    mount(map);

    expect(map.source('ogc-layer-p1')).toBeUndefined();
    expect(map.getStyle().layers).toHaveLength(0);
  });

  it('a dropped file keeps its protocol url, a remote url gains the prefix', () => {
    expect(pmtilesStyleUrl(pmtilesLayer({ url: 'pmtiles://parcels.pmtiles' }))).toBe(
      'pmtiles://parcels.pmtiles',
    );
    expect(pmtilesStyleUrl(pmtilesLayer())).toBe('pmtiles://https://example.org/parcels.pmtiles');
  });
});
