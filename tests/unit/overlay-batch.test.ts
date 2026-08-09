import { describe, expect, it } from 'vitest';
import { sortOverlayBatch } from '../../src/overlay/importOverlay';

/**
 * The panel and the plain drop path both read a dropped batch through here, so
 * a file that changes role would otherwise have to be fixed in two switches.
 * The image and PDF cases need a real decoder, so they are covered by the
 * browser suite rather than here.
 */

const file = (name: string, body: string) => new File([body], name);

describe('sortOverlayBatch', () => {
  it('picks the world file and the .prj out of a batch', async () => {
    const batch = await sortOverlayBatch([
      file('plan.pgw', '0.001\n0\n0\n-0.001\n7.0\n46.0\n'),
      file('plan.prj', 'GEOGCS["WGS 84"]'),
    ]);

    expect(batch.worldFile).toBe('0.001\n0\n0\n-0.001\n7.0\n46.0\n');
    expect(batch.projection).toBe('GEOGCS["WGS 84"]');
    expect(batch.unsupported).toEqual([]);
    expect(batch.source).toBeUndefined();
  });

  it('names the files that play no part, rather than dropping them quietly', async () => {
    const batch = await sortOverlayBatch([file('notes.txt', 'hello'), file('data.gpkg', 'x')]);

    expect(batch.unsupported).toEqual(['notes.txt', 'data.gpkg']);
    expect(batch.worldFile).toBeUndefined();
  });

  it('leaves every field absent for an empty batch', async () => {
    expect(await sortOverlayBatch([])).toEqual({ grids: [], unsupported: [] });
  });
});
