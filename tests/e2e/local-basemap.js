import { readFileSync } from 'node:fs';

/**
 * The basemap assets the app fetches, answered from disk.
 *
 * Chromium intermittently fails to resolve the basemap hosts while the shell
 * resolves them fine, and a style that never arrives leaves MapLibre with no
 * layers for a test to assert on.
 *
 * The style and its TileJSON are the files OpenFreeMap really serves, saved
 * under fixtures/. Tiles answer empty, so the basemap draws no features: no
 * test reads them, they only need the style to load.
 */

const fixture = (name) => readFileSync(new URL(`fixtures/${name}`, import.meta.url), 'utf8');

const DARK_STYLE = fixture('openfreemap-dark-style.json');
const PLANET_TILEJSON = fixture('openfreemap-planet-tilejson.json');

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const EMPTY_SPRITE = '{}';

const png = (route) =>
  route.fulfill({ status: 200, contentType: 'image/png', body: ONE_PIXEL_PNG });

const json = (route, body) =>
  route.fulfill({ status: 200, contentType: 'application/json', body });

export async function serveBasemapsLocally(page) {
  await page.route('https://tiles.openfreemap.org/**', (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/styles/dark') return json(route, DARK_STYLE);
    if (pathname === '/planet') return json(route, PLANET_TILEJSON);
    // vector tiles and glyph ranges: an empty protobuf is an empty tile
    if (pathname.endsWith('.pbf'))
      return route.fulfill({
        status: 200,
        contentType: 'application/x-protobuf',
        body: Buffer.alloc(0),
      });
    // the natural-earth raster backdrop, and the sprite sheet
    if (pathname.endsWith('.png')) return png(route);
    if (pathname.startsWith('/sprites/')) return json(route, EMPTY_SPRITE);
    // a style nobody saved a copy of, say so rather than serve a different one
    return route.fulfill({
      status: 404,
      contentType: 'text/plain',
      body: `no local basemap fixture for ${pathname}`,
    });
  });

  // the raster basemaps Cesium and deck.gl substitute for a vector selection
  await page.route('https://basemaps.cartocdn.com/**', png);

  // Esri World Imagery, behind the Satellite raster basemap. Every path under
  // this host is an XYZ tile, and no test reads what the imagery shows.
  await page.route('https://server.arcgisonline.com/**', png);
}
