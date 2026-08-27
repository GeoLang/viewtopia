import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../../src/actions/marker';
import { ActionError, runAction } from '../../src/actions/registry';
import { useAgentLayerStore } from '../../src/store/agentLayers';

// markers draw from the store, so no renderer is needed
vi.mock('../../src/viewer/registry', () => ({
  getActiveCesiumViewer: () => null,
  getActiveMapLibre: () => null,
}));

describe('marker.add', () => {
  beforeEach(() => {
    useAgentLayerStore.getState().clearMarkers();
  });

  it('puts a labelled marker in the store', async () => {
    const result = await runAction('marker.add', { lon: 2.2945, lat: 48.8584, label: 'Eiffel Tower' });

    const { markers } = useAgentLayerStore.getState();
    expect(markers).toHaveLength(1);
    expect(markers[0].lon).toBe(2.2945);
    expect(markers[0].lat).toBe(48.8584);
    expect(markers[0].label).toBe('Eiffel Tower');
    expect(result.text).toContain('Eiffel Tower');
    expect(result.text).toContain('2.2945, 48.8584');
  });

  it('reads a longitude and latitude the model sent as text', async () => {
    await runAction('marker.add', { lon: '-73.98', lat: '40.75' });
    expect(useAgentLayerStore.getState().markers[0].lon).toBe(-73.98);
  });

  it('refuses coordinates off the globe', async () => {
    await expect(runAction('marker.add', { lon: 743, lat: 43 })).rejects.toThrow(ActionError);
    expect(useAgentLayerStore.getState().markers).toHaveLength(0);
  });

  it('refuses a call with no latitude', async () => {
    await expect(runAction('marker.add', { lon: 2.2945 })).rejects.toThrow('lat is required');
  });
});
