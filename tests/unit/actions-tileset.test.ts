import { afterEach, describe, expect, it, vi } from 'vitest';

// the WebGL bundle stays out, so the scene is a list of these stand-in classes
vi.mock('cesium', () => {
  class Cesium3DTileset {
    style: unknown;
  }
  class Cesium3DTileStyle {
    constructor(readonly definition: { color: { conditions: [string, string][] } }) {}
  }
  return { Cesium3DTileset, Cesium3DTileStyle };
});

import { Cesium3DTileset, type Viewer } from 'cesium';
import '../../src/actions/tileset';
import { runAction } from '../../src/actions/registry';
import { setActiveCesiumViewer } from '../../src/viewer/registry';

const NOTHING_TO_COLOUR = 'no 3D tileset is loaded on the globe';

/** the brown the classification ramp paints ground in */
const CLASSIFICATION_GROUND = '#8B4513';

/** the red the height ramp paints the tallest band in */
const HEIGHT_TALLEST = '#d73027';

/** A scene holding `count` tilesets and one primitive that is not one. */
function globeWithTilesets(count: number): Cesium3DTileset[] {
  const tilesets = Array.from({ length: count }, () => new Cesium3DTileset({}));
  const primitives = [...tilesets, { name: 'the globe imagery' }];
  setActiveCesiumViewer({
    isDestroyed: () => false,
    scene: {
      primitives: {
        length: primitives.length,
        get: (index: number) => primitives[index],
      },
    },
  } as unknown as Viewer);
  return tilesets;
}

/** The colour conditions each tileset's style carries, one string per tileset. */
function stylesOf(tilesets: Cesium3DTileset[]): string[] {
  return tilesets.map((tileset) => JSON.stringify(tileset.style));
}

afterEach(() => {
  setActiveCesiumViewer(null);
});

describe('tileset.shade_by_classification', () => {
  it('colours every tileset in the scene by its classification codes', async () => {
    const tilesets = globeWithTilesets(2);

    const result = await runAction('tileset.shade_by_classification', {});

    expect(stylesOf(tilesets).every((style) => style.includes(CLASSIFICATION_GROUND))).toBe(true);
    expect(result.text).toBe('Coloured 2 tilesets by classification code.');
  });

  it('counts a single tileset in the singular', async () => {
    globeWithTilesets(1);

    const result = await runAction('tileset.shade_by_classification', {});

    expect(result.text).toBe('Coloured 1 tileset by classification code.');
  });

  it('refuses to colour a scene holding no tileset', async () => {
    globeWithTilesets(0);

    await expect(runAction('tileset.shade_by_classification', {})).rejects.toThrow(
      NOTHING_TO_COLOUR,
    );
  });
});

describe('tileset.shade_by_height', () => {
  it('colours every tileset in the scene by height band', async () => {
    const tilesets = globeWithTilesets(2);

    const result = await runAction('tileset.shade_by_height', {});

    expect(stylesOf(tilesets).every((style) => style.includes(HEIGHT_TALLEST))).toBe(true);
    expect(result.text).toBe('Coloured 2 tilesets by height band.');
  });

  it('refuses to colour a scene holding no tileset', async () => {
    globeWithTilesets(0);

    await expect(runAction('tileset.shade_by_height', {})).rejects.toThrow(NOTHING_TO_COLOUR);
  });

  it('says there is nothing to colour when no globe is on screen', async () => {
    await expect(runAction('tileset.shade_by_height', {})).rejects.toThrow(NOTHING_TO_COLOUR);
  });
});

describe('tileset.shade_by_property', () => {
  it('spreads colours over the property it is given', async () => {
    const tilesets = globeWithTilesets(1);

    const result = await runAction('tileset.shade_by_property', { property: 'buildingType' });

    expect(stylesOf(tilesets)[0]).toContain('buildingType');
    expect(stylesOf(tilesets)[0]).toContain('hsl(');
    expect(result.text).toBe('Coloured 1 tileset by buildingType.');
  });

  it('refuses to colour a scene holding no tileset', async () => {
    globeWithTilesets(0);

    await expect(
      runAction('tileset.shade_by_property', { property: 'buildingType' }),
    ).rejects.toThrow(NOTHING_TO_COLOUR);
  });

  it('refuses a call with no property', async () => {
    globeWithTilesets(1);

    await expect(runAction('tileset.shade_by_property', {})).rejects.toThrow(
      'property is required',
    );
  });

  it('refuses a property that is blank', async () => {
    globeWithTilesets(1);

    await expect(runAction('tileset.shade_by_property', { property: '  ' })).rejects.toThrow(
      'property is the name of a feature property, not blank',
    );
  });
});
