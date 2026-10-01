import { describe, it, expect, beforeEach, vi } from 'vitest';

const { queryAsGeoJsonMock } = vi.hoisted(() => ({ queryAsGeoJsonMock: vi.fn() }));
vi.mock('../../src/duckdb', () => ({ queryAsGeoJson: queryAsGeoJsonMock }));

import { useNotebookStore } from '../../src/notebooks/notebookStore';
import { useAppStore } from '../../src/store/app';
import { useAgentLayerStore } from '../../src/store/agentLayers';

const LAYER_ID = 'sql:cell-1';
const PARKS: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [2, 48] }, properties: { name: 'a' } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [3, 49] }, properties: { name: 'b' } },
  ],
};

describe('notebook show sql on map', () => {
  beforeEach(() => {
    queryAsGeoJsonMock.mockReset();
    useAppStore.setState({ layers: [] });
    useAgentLayerStore.setState({ layers: [], generation: 0, frame: null });
  });

  it('draws the query result as a layer and frames the map on it', async () => {
    queryAsGeoJsonMock.mockResolvedValue(PARKS);

    const result = await useNotebookStore.getState().showSqlAsLayer('select * from parks', LAYER_ID);

    expect(queryAsGeoJsonMock).toHaveBeenCalledWith('select * from parks');
    expect(result).toEqual({ featureCount: 2 });
    expect(useAppStore.getState().layers.map((layer) => layer.id)).toContain(LAYER_ID);
    const drawn = useAgentLayerStore.getState().layers.find((layer) => layer.id === LAYER_ID);
    expect(drawn?.geojson.features).toHaveLength(2);
    expect(useAgentLayerStore.getState().generation).toBe(1);
    expect(useAgentLayerStore.getState().frame).toEqual([2, 48, 3, 49]);
  });

  it('leaves the view where it is when the query returns no features', async () => {
    queryAsGeoJsonMock.mockResolvedValue({ type: 'FeatureCollection', features: [] });

    const result = await useNotebookStore.getState().showSqlAsLayer('select * from parks where false', LAYER_ID);

    expect(result).toEqual({ featureCount: 0 });
    expect(useAgentLayerStore.getState().generation).toBe(0);
    expect(useAgentLayerStore.getState().frame).toBeNull();
  });
});
