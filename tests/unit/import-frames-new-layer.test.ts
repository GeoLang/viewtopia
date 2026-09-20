import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addImportedLayer } from '../../src/features/dataSources/importIntoViewer';
import { useAgentLayerStore } from '../../src/store/agentLayers';
import { featuresBounds } from '../../src/hooks/agentLayerBounds';

const viewBounds = vi.hoisted(() => ({
  west: -80,
  south: 43,
  east: -79,
  north: 44,
  centerLng: -79.5,
  centerLat: 43.5,
}));

vi.mock('../../src/lib/viewBounds', () => ({ getViewBounds: () => viewBounds }));

function points(coordinates: [number, number][]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: coordinates.map((c) => ({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: c },
    })),
  };
}

const TORONTO = points([
  [-79.3985, 43.7068],
  [-79.3963, 43.6487],
]);
const MONACO = points([[7.42, 43.734]]);

beforeEach(() => {
  useAgentLayerStore.getState().clear();
  useAgentLayerStore.setState({ generation: 0 });
});

describe('addImportedLayer', () => {
  it('frames a layer that falls outside the current view', () => {
    addImportedLayer('sites', MONACO);
    const state = useAgentLayerStore.getState();
    expect(state.generation).toBe(1);
    expect(state.frame).toEqual(featuresBounds(MONACO.features));
  });

  it('leaves the camera alone for a layer already in view', () => {
    addImportedLayer('sites', TORONTO);
    const state = useAgentLayerStore.getState();
    expect(state.generation).toBe(0);
    expect(state.frame).toBeNull();
    expect(state.layers.map((l) => l.name)).toEqual(['sites']);
  });

  it('frames only the new layer, not every layer on the map', () => {
    useAgentLayerStore.getState().addLayer({ id: 'old', name: 'old', geojson: MONACO });
    const quebec = points([[-70, 45]]);
    addImportedLayer('sites', quebec);
    expect(useAgentLayerStore.getState().frame).toEqual(featuresBounds(quebec.features));
  });
});

describe('agent layer store framing', () => {
  it('setLayers frames every layer again', () => {
    useAgentLayerStore.getState().addLayer({ id: 'a', name: 'a', geojson: MONACO });
    expect(useAgentLayerStore.getState().frame).not.toBeNull();
    useAgentLayerStore.getState().setLayers([{ id: 'b', name: 'b', geojson: TORONTO }]);
    expect(useAgentLayerStore.getState().frame).toBeNull();
  });
});
