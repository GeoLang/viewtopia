import { describe, expect, it, vi } from 'vitest';
import { MAX_ATLAS_PAGES, atlasFields, atlasPages, expandBounds } from '../../src/features/printLayout/atlas';
import { buildPdfPages } from '../../src/features/printLayout/build';
import type { MapCapture } from '../../src/features/printLayout/capture';
import {
  composePage,
  fitRect,
  type PageContent,
  type PageElement,
  type PageSetup,
  pageSizeMm,
} from '../../src/features/printLayout/page';
import type { SharedCamera } from '../../src/hooks/sharedCamera';

const A4_LANDSCAPE: PageSetup = { size: 'a4', orientation: 'landscape', marginMm: 10 };

const CAMERA: SharedCamera = { longitude: 0, latitude: 0, zoom: 10, pitch: 0, bearing: 0 };

function content(overrides: Partial<PageContent> = {}): PageContent {
  return {
    title: '',
    legend: [],
    camera: CAMERA,
    scaleBar: false,
    northArrow: false,
    mapSize: { width: 1000, height: 500 },
    ...overrides,
  };
}

function pick<K extends PageElement['kind']>(
  elements: PageElement[],
  kind: K,
): Extract<PageElement, { kind: K }> | undefined {
  return elements.find((e) => e.kind === kind) as Extract<PageElement, { kind: K }> | undefined;
}

describe('page size', () => {
  it('swaps the millimetre sides for landscape', () => {
    expect(pageSizeMm({ size: 'a4', orientation: 'portrait', marginMm: 0 })).toEqual([210, 297]);
    expect(pageSizeMm(A4_LANDSCAPE)).toEqual([297, 210]);
  });
});

describe('fitRect', () => {
  const frame = { x: 10, y: 20, width: 100, height: 100 };

  it('centres a wide image inside a square frame', () => {
    expect(fitRect(frame, 2)).toEqual({ x: 10, y: 45, width: 100, height: 50 });
  });

  it('centres a tall image inside a square frame', () => {
    expect(fitRect(frame, 0.5)).toEqual({ x: 35, y: 20, width: 50, height: 100 });
  });

  it('hands back the frame when the aspect is unknown', () => {
    expect(fitRect(frame, 0)).toEqual(frame);
  });
});

describe('composePage', () => {
  it('fills the page inside the margins when nothing else is on it', () => {
    const map = pick(composePage(A4_LANDSCAPE, content({ mapSize: null })), 'map');
    expect(map?.rect).toEqual({ x: 10, y: 10, width: 277, height: 190 });
  });

  it('keeps the captured aspect, letterboxing inside the frame', () => {
    const map = pick(composePage(A4_LANDSCAPE, content()), 'map');
    // 2:1 image in a 277x190 frame is width-limited
    expect(map?.rect.width).toBeCloseTo(277);
    expect(map?.rect.height).toBeCloseTo(138.5);
    expect(map?.rect.y).toBeCloseTo(10 + (190 - 138.5) / 2);
  });

  it('drops the map below a title band', () => {
    const elements = composePage(A4_LANDSCAPE, content({ title: '  Site plan  ', mapSize: null }));
    const title = pick(elements, 'title');
    const map = pick(elements, 'map');
    expect(title?.text).toBe('Site plan');
    expect(title?.rect).toEqual({ x: 10, y: 10, width: 277, height: 12 });
    expect(map?.rect.y).toBe(22);
    expect(map?.rect.height).toBe(178);
  });

  it('leaves out a blank title', () => {
    expect(pick(composePage(A4_LANDSCAPE, content({ title: '   ' })), 'title')).toBeUndefined();
  });

  it('narrows the map by the legend column and lists a line per swatch', () => {
    const elements = composePage(
      A4_LANDSCAPE,
      content({
        mapSize: null,
        legend: [
          { name: 'Parcels', entries: [{ color: '#ff0000', label: 'low' }, { color: '#00ff00', label: 'high' }] },
        ],
      }),
    );
    const map = pick(elements, 'map');
    const legend = pick(elements, 'legend');
    expect(map?.rect.width).toBe(277 - 45 - 4);
    expect(legend?.rect.x).toBe(10 + 277 - 45);
    expect(legend?.lines.map((l) => l.kind)).toEqual(['group', 'swatch', 'swatch']);
    expect(legend?.lines.map((l) => l.text)).toEqual(['Parcels', 'low', 'high']);
    // every line sits below the one before it, inside the box
    const ys = legend?.lines.map((l) => l.y) ?? [];
    expect(ys).toEqual([...ys].sort((a, b) => a - b));
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(legend?.rect.y ?? 0);
  });

  it('leaves the legend off when no layer has entries', () => {
    const elements = composePage(
      A4_LANDSCAPE,
      content({ mapSize: null, legend: [{ name: 'Empty', entries: [] }] }),
    );
    expect(pick(elements, 'legend')).toBeUndefined();
    expect(pick(elements, 'map')?.rect.width).toBe(277);
  });

  it('truncates legend lines that would run off the page', () => {
    const entries = Array.from({ length: 200 }, (_, i) => ({ color: '#ff0000', label: `class ${i}` }));
    const legend = pick(
      composePage(A4_LANDSCAPE, content({ mapSize: null, legend: [{ name: 'Many', entries }] })),
      'legend',
    );
    expect(legend?.lines.length).toBeLessThan(entries.length);
    const last = legend?.lines.at(-1);
    expect(last && last.y + 5).toBeLessThanOrEqual((legend?.rect.y ?? 0) + 190);
  });

  it('clamps a margin that would leave no page to print on', () => {
    const map = pick(
      composePage({ size: 'a4', orientation: 'portrait', marginMm: 500 }, content({ mapSize: null })),
      'map',
    );
    expect(map?.rect.width).toBe(20);
    expect(map?.rect.height).toBe(107);
  });

  it('sizes the scale bar from the zoom and the width the map prints at', () => {
    const bar = pick(composePage(A4_LANDSCAPE, content({ scaleBar: true })), 'scaleBar');
    // 1000 css px at zoom 10 on the equator is ~153 km across 277 mm of paper
    expect(bar?.label).toBe('50 km');
    expect(bar?.rect.width).toBeCloseTo(90.6, 1);
    expect(bar?.rect.x).toBe(15);
  });

  it('leaves the scale bar and north arrow off without a camera', () => {
    const elements = composePage(
      A4_LANDSCAPE,
      content({ camera: null, scaleBar: true, northArrow: true }),
    );
    expect(pick(elements, 'scaleBar')).toBeUndefined();
    expect(pick(elements, 'northArrow')).toBeUndefined();
  });

  it('puts the north arrow inside the top right of the map, carrying the bearing', () => {
    const elements = composePage(
      A4_LANDSCAPE,
      content({ mapSize: null, northArrow: true, camera: { ...CAMERA, bearing: 45 } }),
    );
    const arrow = pick(elements, 'northArrow');
    const map = pick(elements, 'map');
    expect(arrow?.bearing).toBe(45);
    expect(arrow?.rect.x).toBe((map?.rect.x ?? 0) + (map?.rect.width ?? 0) - 5 - 14);
    expect(arrow?.rect.y).toBe((map?.rect.y ?? 0) + 5);
  });
});

describe('atlas', () => {
  const feature = (id: number, name: string, lng: number): GeoJSON.Feature => ({
    type: 'Feature',
    properties: { id, name },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [lng, 0],
          [lng + 1, 0],
          [lng + 1, 1],
          [lng, 1],
          [lng, 0],
        ],
      ],
    },
  });

  it('lists every property name the features carry, sorted', () => {
    expect(atlasFields([feature(1, 'a', 0), { ...feature(2, 'b', 1), properties: { zone: 'x' } }])).toEqual([
      'id',
      'name',
      'zone',
    ]);
  });

  it('grows bounds by a fraction of each span, clamped to the world', () => {
    expect(expandBounds([0, 0, 10, 20], 0.1)).toEqual([-1, -2, 11, 22]);
    expect(expandBounds([-179, -89, 179, 89], 0.5)).toEqual([-180, -90, 180, 90]);
  });

  it('makes one page per feature, titled from the chosen attribute', () => {
    const { pages, total } = atlasPages([feature(1, 'North', 0), feature(2, 'South', 5)], 'name', 0.1);
    expect(total).toBe(2);
    expect(pages.map((p) => p.title)).toEqual(['North', 'South']);
    expect(pages[0].bounds).toEqual([-0.1, -0.1, 1.1, 1.1]);
    expect(pages[1].bounds[0]).toBeCloseTo(4.9);
  });

  it('numbers the page when the attribute is missing or empty', () => {
    const blank: GeoJSON.Feature = { ...feature(1, '', 0), properties: { name: '' } };
    expect(atlasPages([blank, feature(2, 'x', 5)], 'name', 0).pages.map((p) => p.title)).toEqual([
      'Page 1',
      'x',
    ]);
    expect(atlasPages([feature(1, 'x', 0)], null, 0).pages[0].title).toBe('Page 1');
  });

  it('pads a point feature so its page is not framed on a single coordinate', () => {
    const point: GeoJSON.Feature = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: [10, 20] },
    };
    const [west, south, east, north] = atlasPages([point], null, 0).pages[0].bounds;
    expect(east - west).toBeGreaterThan(0);
    expect(north - south).toBeGreaterThan(0);
  });

  it('skips features with no geometry without spending a page on them', () => {
    const empty: GeoJSON.Feature = { type: 'Feature', properties: { name: 'ghost' }, geometry: null };
    const { pages, total } = atlasPages([empty, feature(1, 'real', 0)], 'name', 0);
    expect(total).toBe(1);
    expect(pages.map((p) => p.title)).toEqual(['real']);
  });

  it('caps the pages but still reports how many the layer would make', () => {
    const many = Array.from({ length: MAX_ATLAS_PAGES + 25 }, (_, i) => feature(i, `f${i}`, i * 0.01));
    const { pages, total } = atlasPages(many, 'name', 0);
    expect(pages).toHaveLength(MAX_ATLAS_PAGES);
    expect(total).toBe(MAX_ATLAS_PAGES + 25);
  });
});

describe('buildPdfPages', () => {
  function fakeCapture() {
    const restore = vi.fn(async () => {});
    const canvas = {
      clientWidth: 1000,
      clientHeight: 500,
      width: 2000,
      height: 1000,
      toDataURL: () => 'data:image/png;base64,map',
    } as unknown as HTMLCanvasElement;
    const capture: MapCapture = {
      renderFrame: vi.fn(),
      canvas: () => canvas,
      camera: () => CAMERA,
      saveView: vi.fn(() => restore),
      showBounds: vi.fn(async () => {}),
    };
    return { capture, restore };
  }

  const options = {
    setup: A4_LANDSCAPE,
    title: 'Overview',
    legend: [],
    scaleBar: true,
    northArrow: true,
    atlas: null,
  };

  it('composes one page from the live view, leaving the camera alone', async () => {
    const { capture } = fakeCapture();
    const pages = await buildPdfPages(capture, options);

    expect(pages).toHaveLength(1);
    expect(capture.saveView).not.toHaveBeenCalled();
    expect(capture.renderFrame).toHaveBeenCalledTimes(1);
    expect(pages[0].mapImage).toBe('data:image/png;base64,map');
    expect(pick(pages[0].elements, 'title')?.text).toBe('Overview');
  });

  it('fits, captures and titles each atlas page, then puts the view back', async () => {
    const { capture, restore } = fakeCapture();
    const atlas = [
      { title: 'North', bounds: [0, 0, 1, 1] as [number, number, number, number] },
      { title: 'South', bounds: [5, 5, 6, 6] as [number, number, number, number] },
    ];

    const pages = await buildPdfPages(capture, { ...options, atlas });

    expect(pages).toHaveLength(2);
    expect(capture.showBounds).toHaveBeenCalledTimes(2);
    expect(vi.mocked(capture.showBounds).mock.calls.map(([b]) => b)).toEqual([
      atlas[0].bounds,
      atlas[1].bounds,
    ]);
    expect(pages.map((p) => pick(p.elements, 'title')?.text)).toEqual(['North', 'South']);
    expect(restore).toHaveBeenCalledTimes(1);
  });

  it('puts the view back even when a page fails mid-series', async () => {
    const { capture, restore } = fakeCapture();
    vi.mocked(capture.showBounds).mockRejectedValueOnce(new Error('tiles gone'));

    await expect(
      buildPdfPages(capture, {
        ...options,
        atlas: [{ title: 'a', bounds: [0, 0, 1, 1] }],
      }),
    ).rejects.toThrow('tiles gone');
    expect(restore).toHaveBeenCalledTimes(1);
  });
});
