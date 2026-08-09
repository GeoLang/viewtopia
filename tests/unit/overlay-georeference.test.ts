/**
 * Runs the real vendored projicio wasm module (initSync over the file bytes)
 * for the .prj path, so these tests exercise the same engine the app ships.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  bboxFromTwoClicks,
  bboxOfCorners,
  cameraForBbox,
  cornersAtCenter,
  cornersAxisAligned,
  cornersOfBbox,
} from '../../src/overlay/georeference';
import { cornersToLonLat } from '../../src/overlay/projicio';
import { imageCorners, overlayFileKind, parseWorldFile } from '../../src/overlay/worldFile';
import { initSync } from '../../src/overlay/wasm/projicio_wasm';

beforeAll(() => {
  const wasmPath = join(process.cwd(), 'src/overlay/wasm/projicio_wasm_bg.wasm');
  initSync({ module: readFileSync(wasmPath) });
});

const UTM_18N_PRJ =
  'PROJCS["NAD_1983_UTM_Zone_18N",GEOGCS["GCS_North_American_1983",DATUM["D_North_American_1983",SPHEROID["GRS_1980",6378137.0,298.257222101]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",-75.0],PARAMETER["Scale_Factor",0.9996],PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]';

describe('overlayFileKind', () => {
  it('classifies images, pdfs, world files and prj sidecars', () => {
    expect(overlayFileKind('plan.PNG')).toBe('image');
    expect(overlayFileKind('scan.pdf')).toBe('pdf');
    expect(overlayFileKind('plan.pgw')).toBe('worldFile');
    expect(overlayFileKind('plan.jgw')).toBe('worldFile');
    expect(overlayFileKind('plan.wld')).toBe('worldFile');
    expect(overlayFileKind('plan.prj')).toBe('projection');
    expect(overlayFileKind('plan.gpkg')).toBeNull();
  });
});

describe('parseWorldFile', () => {
  it('reads the six lines in world file order', () => {
    const transform = parseWorldFile('2\r\n0\r\n0\r\n-2\r\n500000.5\r\n4510000.5\r\n');
    expect(transform).toEqual({
      scaleX: 2,
      skewY: 0,
      skewX: 0,
      scaleY: -2,
      originX: 500000.5,
      originY: 4510000.5,
    });
  });

  it('rejects files without six numbers', () => {
    expect(() => parseWorldFile('1\n2\n3\n')).toThrow('six numbers');
    expect(() => parseWorldFile('1\n2\nx\n4\n5\n6\n')).toThrow('six numbers');
  });
});

describe('imageCorners', () => {
  it('positions corners half a pixel out from the pixel centers', () => {
    const corners = imageCorners(
      { scaleX: 2, skewY: 0, skewX: 0, scaleY: -2, originX: 100, originY: 200 },
      10,
      5,
    );
    expect(corners[0]).toEqual([99, 201]);
    expect(corners[1]).toEqual([119, 201]);
    expect(corners[2]).toEqual([119, 191]);
    expect(corners[3]).toEqual([99, 191]);
  });

  it('applies rotation terms', () => {
    const corners = imageCorners(
      { scaleX: 0, skewY: -1, skewX: 1, scaleY: 0, originX: 0, originY: 0 },
      4,
      4,
    );
    expect(cornersAxisAligned(corners)).toBe(false);
  });
});

describe('cornersAxisAligned', () => {
  it('accepts an unrotated rectangle', () => {
    const corners = imageCorners(
      { scaleX: 1, skewY: 0, skewX: 0, scaleY: -1, originX: 0, originY: 0 },
      4,
      4,
    );
    expect(cornersAxisAligned(corners)).toBe(true);
  });
});

describe('cornersToLonLat', () => {
  it('passes lon/lat corners through without a .prj', async () => {
    const corners = await cornersToLonLat(
      [
        [-74, 41],
        [-73, 41],
        [-73, 40],
        [-74, 40],
      ],
      null,
    );
    expect(corners[0]).toEqual([-74, 41]);
  });

  it('rejects projected coordinates without a .prj', async () => {
    await expect(
      cornersToLonLat(
        [
          [585000, 4510000],
          [586000, 4510000],
          [586000, 4509000],
          [585000, 4509000],
        ],
        null,
      ),
    ).rejects.toThrow('.prj');
  });

  it('projects UTM corners through a real ESRI .prj', async () => {
    const corners = await cornersToLonLat(
      [
        [585000, 4510000],
        [586000, 4510000],
        [586000, 4509000],
        [585000, 4509000],
      ],
      UTM_18N_PRJ,
    );
    expect(corners[0][0]).toBeCloseTo(-73.9933, 3);
    expect(corners[0][1]).toBeCloseTo(40.7366, 3);
    const bbox = bboxOfCorners(corners);
    expect(bbox[0]).toBeLessThan(bbox[2]);
    expect(bbox[1]).toBeLessThan(bbox[3]);
  });

  it('reports an unreadable .prj', async () => {
    await expect(
      cornersToLonLat(
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ],
        'PROJCS["broken"',
      ),
    ).rejects.toThrow('.prj');
  });
});

describe('bboxFromTwoClicks', () => {
  it('derives the south edge from the image aspect at that latitude', () => {
    const bbox = bboxFromTwoClicks({ lng: -74, lat: 41 }, { lng: -73, lat: 40.9 }, 200, 100);
    expect(bbox).not.toBeNull();
    const [west, south, east, north] = bbox as [number, number, number, number];
    expect(west).toBe(-74);
    expect(north).toBe(41);
    expect(east).toBe(-73);
    expect(north - south).toBeCloseTo(Math.cos((41 * Math.PI) / 180) * 0.5, 6);
  });

  it('refuses a second click west of the first', () => {
    expect(bboxFromTwoClicks({ lng: -74, lat: 41 }, { lng: -75, lat: 40 }, 100, 100)).toBeNull();
  });
});

describe('cornersAtCenter', () => {
  it('centres a wide image and fits it to the view width', () => {
    const corners = cornersAtCenter([-1, -1, 1, 1], 200, 100);
    expect(corners).toEqual([
      [-0.6, 0.3],
      [0.6, 0.3],
      [0.6, -0.3],
      [-0.6, -0.3],
    ]);
  });

  it('fits a tall image to the view height instead', () => {
    const [topLeft, , bottomRight] = cornersAtCenter([-1, -1, 1, 1], 100, 200);
    expect(topLeft[1] - bottomRight[1]).toBeCloseTo(1.2, 6);
    expect(bottomRight[0] - topLeft[0]).toBeCloseTo(0.6, 6);
  });

  it('keeps ground proportions where meridians converge', () => {
    const corners = cornersAtCenter([-1, 59, 1, 61], 200, 100);
    const [west, south, east, north] = bboxOfCorners(corners);
    const groundWidth = (east - west) * Math.cos((60 * Math.PI) / 180);
    expect(groundWidth / (north - south)).toBeCloseTo(2, 6);
  });

  it('lands in the middle of the view', () => {
    const [west, south, east, north] = bboxOfCorners(cornersAtCenter([4, 50, 6, 52], 200, 100));
    expect((west + east) / 2).toBeCloseTo(5, 6);
    expect((south + north) / 2).toBeCloseTo(51, 6);
  });
});

describe('cornersOfBbox', () => {
  it('runs clockwise from the top left, matching an image source', () => {
    expect(cornersOfBbox([12, 45, 13, 46])).toEqual([
      [12, 46],
      [13, 46],
      [13, 45],
      [12, 45],
    ]);
  });
});

describe('cameraForBbox', () => {
  it('frames a small bbox with a close zoom, clamped for huge ones', () => {
    const close = cameraForBbox([-74.01, 40.7, -74.0, 40.71]);
    expect(close.lng).toBeCloseTo(-74.005, 6);
    expect(close.zoom).toBeGreaterThan(12);
    const world = cameraForBbox([-180, -85, 180, 85]);
    expect(world.zoom).toBe(2);
  });
});
