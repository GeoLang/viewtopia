import { beforeEach, describe, expect, it } from 'vitest';
import '../../src/actions/find';
import { ActionError, runAction } from '../../src/actions/registry';
import { useAgentLayerStore, type AgentLayer } from '../../src/store/agentLayers';

function gate(name: string, lon: number): GeoJSON.Feature {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lon, 43.73] },
    properties: { name, kind: 'gate' },
  };
}

const GATES: AgentLayer = {
  id: 'agent-gates',
  name: 'Gates',
  geojson: { type: 'FeatureCollection', features: [gate('North Gate', 7.42), gate('South Gate', 7.43)] },
};

const PLOTS: AgentLayer = {
  id: 'agent-plots',
  name: 'Plots',
  geojson: {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [[[0, 0], [0, 2], [2, 2], [2, 0], [0, 0]]],
        },
        properties: { owner: 'north gate holdings' },
      },
    ],
  },
};

describe('find_feature', () => {
  beforeEach(() => {
    useAgentLayerStore.setState({ layers: [GATES, PLOTS], rasterLayers: [], markers: [], generation: 0 });
  });

  it('reports the layer, the property, the value and where the feature is', async () => {
    const result = await runAction('find_feature', { query: 'north gate' });

    expect(result.text).toContain('2 matches');
    expect(result.text).toContain('Gates: name "North Gate" at 7.4200, 43.7300');
    expect(result.text).toContain('Plots: owner "north gate holdings" at 1.0000, 1.0000');
  });

  it('searches only the layer it is given', async () => {
    const result = await runAction('find_feature', { query: 'gate', layer: 'Plots' });
    expect(result.text).toContain('1 matches');
    expect(result.text).not.toContain('Gates:');
  });

  it('says nothing matched rather than failing', async () => {
    const result = await runAction('find_feature', { query: 'lighthouse' });
    expect(result.text).toBe('Nothing in the loaded features matches "lighthouse".');
  });

  it('refuses a layer name matching two layers', async () => {
    useAgentLayerStore.setState({ layers: [GATES, { ...PLOTS, name: 'Gates north' }] });
    await expect(runAction('find_feature', { query: 'gate', layer: 'gates' })).rejects.toThrow(
      ActionError,
    );
  });
});
