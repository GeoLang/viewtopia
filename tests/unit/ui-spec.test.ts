import { describe, it, expect } from 'vitest';
import { renderUISpec } from '../../src/viewer/uiSpec';

// No live Cesium viewer is registered in jsdom, so renderUISpec should no-op
// gracefully (it bails when getActiveCesiumViewer() is null) without throwing.
describe('renderUISpec', () => {
  it('ignores non-map specs', async () => {
    await expect(renderUISpec({ type: 'table' })).resolves.toBeUndefined();
  });

  it('handles a map spec with no active viewer without throwing', async () => {
    await expect(
      renderUISpec({
        type: 'map',
        layers: [{ name: 'London 5 km buffer', file: 'outputs/london_5km_buffer.gpkg' }],
        center: [-0.1187, 51.5019],
        zoom: 11,
      }),
    ).resolves.toBeUndefined();
  });
});
