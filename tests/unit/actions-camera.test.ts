import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../../src/actions/camera';
import { ActionError, runAction } from '../../src/actions/registry';
import { getSharedCamera } from '../../src/hooks/sharedCamera';

// no cesium viewer and a stub maplibre map, the way viewer-commands.test.ts
// drives the camera without a renderer
const registry = vi.hoisted(() => ({ map: null as { flyTo: (options: unknown) => void } | null }));
vi.mock('../../src/viewer/registry', () => ({
  getActiveCesiumViewer: () => null,
  getActiveMapLibre: () => registry.map,
}));

describe('camera.fly_to', () => {
  let flown: Record<string, unknown>[];

  beforeEach(() => {
    flown = [];
    registry.map = { flyTo: (options) => flown.push(options as Record<string, unknown>) };
  });

  it('moves the live renderer and the shared camera', async () => {
    const result = await runAction('camera.fly_to', { lon: 7.42, lat: 43.73, height: 2000 });

    expect(flown).toHaveLength(1);
    expect(flown[0].center).toEqual([7.42, 43.73]);
    expect(getSharedCamera().longitude).toBe(7.42);
    expect(result.text).toContain('7.4200, 43.7300');
  });

  it('reads a longitude and latitude the model sent as text', async () => {
    await runAction('camera.fly_to', { lon: '-73.98', lat: '40.75' });
    expect(flown[0].center).toEqual([-73.98, 40.75]);
  });

  it('refuses coordinates off the globe', async () => {
    await expect(runAction('camera.fly_to', { lon: 743, lat: 43 })).rejects.toThrow(ActionError);
    expect(flown).toHaveLength(0);
  });

  it('refuses a call with no latitude', async () => {
    await expect(runAction('camera.fly_to', { lon: 7.42 })).rejects.toThrow('lat is required');
  });
});
