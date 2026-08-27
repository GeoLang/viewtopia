import { afterEach, describe, expect, it, vi } from 'vitest';

// the WebGL bundle stays out, so the scene is a list of these stand-in classes
vi.mock('cesium', () => {
  class Cesium3DTileset {
    style: unknown;
  }
  class Cesium3DTileStyle {
    constructor(readonly definition: unknown) {}
  }
  return { Cesium3DTileset, Cesium3DTileStyle };
});

import { Cesium3DTileset, type Viewer } from 'cesium';
import '../../src/actions/tileset';
import { runAction, type ActionArguments } from '../../src/actions/registry';
import { setActiveCesiumViewer } from '../../src/viewer/registry';

const NO_GLOBE = 'there is no Cesium globe on screen';
const NOTHING_TO_STYLE = 'no 3D tileset is loaded on the globe, so there is nothing to style';

/** the brown the classification ramp paints ground in */
const CLASSIFICATION_GROUND = '#8B4513';

/** the red the height ramp paints the tallest band in */
const HEIGHT_TALLEST = '#d73027';

/** Every action here, with arguments it accepts, for the two refusals they share. */
const EVERY_TILESET_ACTION: [string, ActionArguments][] = [
  ['tileset.shade_by_classification', {}],
  ['tileset.shade_by_height', {}],
  ['tileset.shade_by_property', { property: 'buildingType' }],
  ['tileset.reset_style', {}],
  ['tileset.set_opacity', { opacity: 0.4 }],
  ['tileset.set_point_size', { size: 4 }],
];

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

/** The style each tileset carries, one string per tileset. */
function stylesOf(tilesets: Cesium3DTileset[]): string[] {
  return tilesets.map((tileset) => JSON.stringify(tileset.style));
}

/** What each style was built from, which the stand-in class above keeps. */
function definitionsOf(tilesets: Cesium3DTileset[]): unknown[] {
  return tilesets.map((tileset) => (tileset.style as unknown as { definition: unknown }).definition);
}

afterEach(() => {
  setActiveCesiumViewer(null);
});

describe('every tileset action', () => {
  it('says the globe is not on screen when no viewer is registered', async () => {
    for (const [name, args] of EVERY_TILESET_ACTION) {
      await expect(runAction(name, args)).rejects.toThrow(NO_GLOBE);
    }
  });

  it('says there is nothing to style when the globe holds no tileset', async () => {
    globeWithTilesets(0);

    for (const [name, args] of EVERY_TILESET_ACTION) {
      await expect(runAction(name, args)).rejects.toThrow(NOTHING_TO_STYLE);
    }
  });
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
});

describe('tileset.shade_by_height', () => {
  it('colours every tileset in the scene by height band', async () => {
    const tilesets = globeWithTilesets(2);

    const result = await runAction('tileset.shade_by_height', {});

    expect(stylesOf(tilesets).every((style) => style.includes(HEIGHT_TALLEST))).toBe(true);
    expect(result.text).toBe('Coloured 2 tilesets by height band.');
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

describe('tileset.reset_style', () => {
  it('takes the colouring back off every tileset in the scene', async () => {
    const tilesets = globeWithTilesets(2);
    await runAction('tileset.shade_by_height', {});

    const result = await runAction('tileset.reset_style', {});

    expect(tilesets.map((tileset) => tileset.style)).toEqual([undefined, undefined]);
    expect(result.text).toBe('Took the styling off 2 tilesets.');
  });
});

describe('tileset.set_opacity', () => {
  it('fades every tileset to a white at the opacity it is given', async () => {
    const tilesets = globeWithTilesets(2);

    const result = await runAction('tileset.set_opacity', { opacity: 0.4 });

    expect(definitionsOf(tilesets)).toEqual([
      { color: 'color("white", 0.4)' },
      { color: 'color("white", 0.4)' },
    ]);
    expect(result.text).toBe('Faded 2 tilesets to a white at 0.4 opacity.');
  });

  it('refuses an opacity off either end of the range', async () => {
    globeWithTilesets(1);

    await expect(runAction('tileset.set_opacity', { opacity: 4 })).rejects.toThrow(
      'an opacity is between 0 and 1, not 4',
    );
    await expect(runAction('tileset.set_opacity', { opacity: -1 })).rejects.toThrow(
      'an opacity is between 0 and 1, not -1',
    );
  });

  it('refuses a call with no opacity', async () => {
    globeWithTilesets(1);

    await expect(runAction('tileset.set_opacity', {})).rejects.toThrow('opacity is required');
  });
});

describe('tileset.set_point_size', () => {
  it('draws the points at the size it is given', async () => {
    const tilesets = globeWithTilesets(1);

    const result = await runAction('tileset.set_point_size', { size: 6 });

    expect(definitionsOf(tilesets)).toEqual([{ pointSize: '6' }]);
    expect(result.text).toBe('Drew the points of 1 tileset at 6 pixels.');
  });

  it('refuses a size that is not above zero', async () => {
    globeWithTilesets(1);

    await expect(runAction('tileset.set_point_size', { size: 0 })).rejects.toThrow(
      'a point size is a width in pixels above 0, not 0',
    );
    await expect(runAction('tileset.set_point_size', { size: -3 })).rejects.toThrow(
      'a point size is a width in pixels above 0, not -3',
    );
  });

  it('refuses a call with no size', async () => {
    globeWithTilesets(1);

    await expect(runAction('tileset.set_point_size', {})).rejects.toThrow('size is required');
  });
});
