import { beforeEach, describe, expect, it } from 'vitest';
import { useAgentLayerStore, type AgentRasterLayer } from '../../src/store/agentLayers';
import { cornersOfBbox } from '../../src/overlay/georeference';

function overlay(id: string, name = id): AgentRasterLayer {
  return {
    id,
    name,
    url: `data:image/png;base64,${id}`,
    corners: cornersOfBbox([12, 45, 13, 46]),
    opacity: 0.8,
    visible: true,
  };
}

beforeEach(() => {
  useAgentLayerStore.setState({ rasterLayers: [], editingRasterId: null });
});

describe('image overlay layers', () => {
  it('hides and shows one without dropping it', () => {
    const store = useAgentLayerStore.getState();
    store.addRasterLayer(overlay('plan'));
    store.toggleRasterVisibility('plan');
    expect(useAgentLayerStore.getState().rasterLayers[0].visible).toBe(false);

    useAgentLayerStore.getState().toggleRasterVisibility('plan');
    expect(useAgentLayerStore.getState().rasterLayers[0].visible).toBe(true);
  });

  it('moves one corner and leaves the other three alone', () => {
    const store = useAgentLayerStore.getState();
    store.addRasterLayer(overlay('plan'));
    const moved = cornersOfBbox([12, 45, 13, 46]);
    moved[1] = [13.5, 46.2];
    store.setRasterCorners('plan', moved);

    expect(useAgentLayerStore.getState().rasterLayers[0].corners).toEqual([
      [12, 46],
      [13.5, 46.2],
      [13, 45],
      [12, 45],
    ]);
  });

  it('reorders the stack, and ignores an index off the end', () => {
    const store = useAgentLayerStore.getState();
    store.addRasterLayer(overlay('a'));
    store.addRasterLayer(overlay('b'));
    store.addRasterLayer(overlay('c'));

    useAgentLayerStore.getState().reorderRasterLayers(0, 2);
    expect(useAgentLayerStore.getState().rasterLayers.map((l) => l.id)).toEqual(['b', 'c', 'a']);

    useAgentLayerStore.getState().reorderRasterLayers(0, 7);
    expect(useAgentLayerStore.getState().rasterLayers.map((l) => l.id)).toEqual(['b', 'c', 'a']);
  });

  it('stops editing an overlay that is removed', () => {
    const store = useAgentLayerStore.getState();
    store.addRasterLayer(overlay('plan'));
    store.setEditingRaster('plan');
    useAgentLayerStore.getState().removeRasterLayer('plan');

    expect(useAgentLayerStore.getState().editingRasterId).toBeNull();
  });
});
