import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { LayerSpecification } from 'maplibre-gl';
import type maplibregl from 'maplibre-gl';
import {
  useBuildingStore,
  styleDrawsBuildings,
  BUILDINGS_LAYER_ID,
} from '../../src/store/buildings';
import { useBuildingsMapLibre } from '../../src/hooks/useBuildingsMapLibre';

/** the 3D buildings layer the OpenFreeMap Liberty style ships with */
const libertyLayers: LayerSpecification[] = [
  { id: 'background', type: 'background' },
  { id: 'water', type: 'fill', source: 'openmaptiles', 'source-layer': 'water' },
  {
    id: 'building-3d',
    type: 'fill-extrusion',
    source: 'openmaptiles',
    'source-layer': 'building',
  },
];

const rasterLayers: LayerSpecification[] = [
  { id: 'basemap', type: 'raster', source: 'basemap' },
];

describe('styleDrawsBuildings', () => {
  it('detects a vector style that extrudes its own buildings', () => {
    expect(styleDrawsBuildings(libertyLayers)).toBe(true);
  });

  it('is false for a raster style', () => {
    expect(styleDrawsBuildings(rasterLayers)).toBe(false);
  });

  it('ignores our own extrusion layer', () => {
    expect(
      styleDrawsBuildings([
        ...rasterLayers,
        {
          id: BUILDINGS_LAYER_ID,
          type: 'fill-extrusion',
          source: 'osm-buildings',
        },
      ]),
    ).toBe(false);
  });

  it('is false for a style with no layers', () => {
    expect(styleDrawsBuildings([])).toBe(false);
    expect(styleDrawsBuildings(undefined)).toBe(false);
  });
});

const fakeMap = () => {
  const layers = new Set<string>();
  const sources = new Map<string, { id: string; setData: () => void }>();
  return {
    isStyleLoaded: () => true,
    getLayer: (id: string) => (layers.has(id) ? { id } : undefined),
    getSource: (id: string) => sources.get(id),
    addLayer: vi.fn((l: { id: string }) => layers.add(l.id)),
    addSource: vi.fn((id: string) =>
      sources.set(id, { id, setData: vi.fn() }),
    ),
    removeLayer: vi.fn((id: string) => layers.delete(id)),
    removeSource: vi.fn((id: string) => sources.delete(id)),
    on: vi.fn(),
    off: vi.fn(),
  };
};

describe('useBuildingsMapLibre', () => {
  beforeEach(() => {
    useBuildingStore.setState({
      buildings: [
        { coords: [0, 0, 0, 1, 1, 1], height: 10, color: '#fff', tags: {} },
      ],
      enabled: true,
      styleHasBuildings: false,
    });
  });

  it('adds the extrusion layer on a style without its own buildings', () => {
    const map = fakeMap();
    renderHook(() =>
      useBuildingsMapLibre({ current: map as unknown as maplibregl.Map }),
    );
    expect(map.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: BUILDINGS_LAYER_ID, type: 'fill-extrusion' }),
    );
  });

  it('adds nothing when the basemap style already draws buildings', () => {
    useBuildingStore.setState({ styleHasBuildings: true });
    const map = fakeMap();
    renderHook(() =>
      useBuildingsMapLibre({ current: map as unknown as maplibregl.Map }),
    );
    expect(map.addLayer).not.toHaveBeenCalled();
    expect(map.addSource).not.toHaveBeenCalled();
  });

  it('removes an already added layer when the style starts drawing buildings', () => {
    const map = fakeMap();
    const { rerender } = renderHook(() =>
      useBuildingsMapLibre({ current: map as unknown as maplibregl.Map }),
    );
    expect(map.addLayer).toHaveBeenCalled();
    useBuildingStore.setState({ styleHasBuildings: true });
    rerender();
    expect(map.removeLayer).toHaveBeenCalledWith(BUILDINGS_LAYER_ID);
    expect(map.removeSource).toHaveBeenCalledWith('osm-buildings');
  });
});
