import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  commonsUrl,
  panoramaxUrl,
  parseCommons,
  parsePanoramax,
  radiusBbox,
  searchPhotos,
} from '../../src/lib/photoSearch';

const PANORAMAX_JSON = {
  features: [
    {
      id: '84d41633-d711-4d42-872a-6c54286af095',
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [1.9248972, 48.8249055] },
      links: [
        { rel: 'license', href: 'https://creativecommons.org/licenses/by-sa/4.0/' },
        { rel: 'self', href: 'https://api.panoramax.xyz/api/collections/610f/items/84d4' },
      ],
      assets: {
        hd: { href: 'https://panoramax.openstreetmap.fr/images/84/hd.jpg' },
        sd: { href: 'https://panoramax.openstreetmap.fr/derivates/84/sd.jpg' },
        thumb: { href: 'https://panoramax.openstreetmap.fr/derivates/84/thumb.jpg' },
      },
      providers: [{ name: 'AurélienQ', roles: ['producer'] }],
      collection: '610fdaf1-7dd5-41be-9499-c5eb180f00fb',
      properties: { datetime: '2023-06-14T09:12:31Z', license: 'CC-BY-SA-4.0' },
    },
    // no assets at all: nothing to show, so it must not become a marker
    {
      id: 'no-assets',
      geometry: { type: 'Point', coordinates: [1.92, 48.82] },
      properties: {},
    },
  ],
};

const COMMONS_JSON = {
  batchcomplete: '',
  query: {
    pages: {
      '49835306': {
        pageid: 49835306,
        ns: 6,
        title: 'File:Eiffel Tower 5 (bird eye view) - panoramio.jpg',
        index: -1,
        imageinfo: [
          {
            thumburl: 'https://upload.wikimedia.org/thumb/330px-Eiffel.jpg',
            url: 'https://upload.wikimedia.org/commons/Eiffel.jpg',
            descriptionurl:
              'https://commons.wikimedia.org/wiki/File:Eiffel_Tower_5_(bird_eye_view)_-_panoramio.jpg',
          },
        ],
        coordinates: [{ lat: 48.858391, lon: 2.294512, primary: '', globe: 'earth' }],
      },
      '56382763': {
        pageid: 56382763,
        ns: 6,
        title: 'File:No coordinates.jpg',
        imageinfo: [{ thumburl: 'https://upload.wikimedia.org/thumb/330px-No.jpg' }],
      },
    },
  },
};

describe('radiusBbox', () => {
  it('spans the radius north and south, and wider in longitude away from the equator', () => {
    const [minLon, minLat, maxLon, maxLat] = radiusBbox(2.2945, 48.8584, 500);
    expect((maxLat - minLat) / 2).toBeCloseTo(500 / 111_320, 9);
    // 500 m of longitude at 48.86° is 1/cos(lat) times the latitude span
    expect((maxLon - minLon) / (maxLat - minLat)).toBeCloseTo(
      1 / Math.cos((48.8584 * Math.PI) / 180),
      6,
    );
    expect(minLon).toBeLessThan(2.2945);
    expect(maxLon).toBeGreaterThan(2.2945);
  });

  it('is square in degrees on the equator', () => {
    const [minLon, minLat, maxLon, maxLat] = radiusBbox(0, 0, 1000);
    expect(maxLon - minLon).toBeCloseTo(maxLat - minLat, 9);
  });

  it('clamps latitude to the poles instead of running past them', () => {
    const [, minLat, , maxLat] = radiusBbox(10, 89.999, 5000);
    expect(maxLat).toBe(90);
    expect(minLat).toBeLessThan(89.999);
  });
});

describe('request urls', () => {
  it('asks panoramax for the bbox of the click', () => {
    const url = new URL(panoramaxUrl(2.2945, 48.8584, 500));
    expect(url.origin + url.pathname).toBe('https://api.panoramax.xyz/api/search');
    expect(url.searchParams.get('limit')).toBe('50');
    expect(url.searchParams.get('bbox')).toBe(radiusBbox(2.2945, 48.8584, 500).join(','));
  });

  it('asks commons for lat|lon with anonymous cors and the coordinates it needs to place markers', () => {
    const url = new URL(commonsUrl(2.2945, 48.8584, 500));
    expect(url.origin + url.pathname).toBe('https://commons.wikimedia.org/w/api.php');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      generator: 'geosearch',
      ggscoord: '48.8584|2.2945',
      ggsradius: '500',
      ggsnamespace: '6',
      prop: 'imageinfo|coordinates',
      iiurlwidth: '320',
      format: 'json',
      origin: '*',
    });
  });

  it('keeps the commons radius inside the 10..10000 m the api accepts', () => {
    expect(new URL(commonsUrl(0, 0, 50_000)).searchParams.get('ggsradius')).toBe('10000');
    expect(new URL(commonsUrl(0, 0, 1)).searchParams.get('ggsradius')).toBe('10');
  });
});

describe('parsePanoramax', () => {
  it('reads position, thumbnail, full image and the CC-BY-SA credit', () => {
    const [photo, ...rest] = parsePanoramax(PANORAMAX_JSON);
    expect(rest).toHaveLength(0);
    expect(photo).toEqual({
      id: 'panoramax-84d41633-d711-4d42-872a-6c54286af095',
      source: 'panoramax',
      lon: 1.9248972,
      lat: 48.8249055,
      title: 'Street view 2023-06-14',
      thumbUrl: 'https://panoramax.openstreetmap.fr/derivates/84/thumb.jpg',
      fullUrl: 'https://panoramax.openstreetmap.fr/images/84/hd.jpg',
      credit: 'AurélienQ',
      license: 'CC-BY-SA-4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    });
  });

  it('falls back to the deed and an unknown author when the item omits them', () => {
    const [photo] = parsePanoramax({
      features: [
        {
          id: 'bare',
          geometry: { coordinates: [1, 2] },
          assets: { sd: { href: 'https://example.org/sd.jpg' } },
        },
      ],
    });
    expect(photo.thumbUrl).toBe('https://example.org/sd.jpg');
    expect(photo.fullUrl).toBe('https://example.org/sd.jpg');
    expect(photo.credit).toBe('Unknown author');
    expect(photo.license).toBe('CC-BY-SA-4.0');
    expect(photo.licenseUrl).toBe('https://creativecommons.org/licenses/by-sa/4.0/');
    expect(photo.title).toBe('Street view');
  });

  it('reads an empty collection as no photos', () => {
    expect(parsePanoramax({ features: [] })).toEqual([]);
    expect(parsePanoramax(null)).toEqual([]);
  });
});

describe('parseCommons', () => {
  it('turns the keyed pages into photos with the file page as the license link', () => {
    const photos = parseCommons(COMMONS_JSON);
    expect(photos).toHaveLength(1);
    expect(photos[0]).toEqual({
      id: 'commons-49835306',
      source: 'commons',
      lon: 2.294512,
      lat: 48.858391,
      title: 'Eiffel Tower 5 (bird eye view) - panoramio.jpg',
      thumbUrl: 'https://upload.wikimedia.org/thumb/330px-Eiffel.jpg',
      fullUrl: 'https://upload.wikimedia.org/commons/Eiffel.jpg',
      credit: 'Wikimedia Commons',
      license: 'See file page',
      licenseUrl:
        'https://commons.wikimedia.org/wiki/File:Eiffel_Tower_5_(bird_eye_view)_-_panoramio.jpg',
    });
  });

  it('builds the file page url from the title when the api omits it', () => {
    const [photo] = parseCommons({
      query: {
        pages: {
          '1': {
            pageid: 1,
            title: 'File:Big Ben.jpg',
            imageinfo: [{ thumburl: 'https://upload.wikimedia.org/thumb.jpg' }],
            coordinates: [{ lat: 51.5, lon: -0.12 }],
          },
        },
      },
    });
    expect(photo.licenseUrl).toBe('https://commons.wikimedia.org/wiki/File%3ABig_Ben.jpg');
    expect(photo.fullUrl).toBe('https://upload.wikimedia.org/thumb.jpg');
  });

  it('reads a query with no pages as no photos', () => {
    expect(parseCommons({ batchcomplete: '', query: {} })).toEqual([]);
    expect(parseCommons(null)).toEqual([]);
  });
});

describe('searchPhotos', () => {
  const fetchMock = vi.fn();

  const respond = (url: string) => {
    if (url.startsWith('https://api.panoramax.xyz')) {
      return { ok: true, status: 200, json: async () => PANORAMAX_JSON };
    }
    if (url.startsWith('https://commons.wikimedia.org')) {
      return { ok: true, status: 200, json: async () => COMMONS_JSON };
    }
    // the HEAD probe of the panoramax image host
    return { ok: true, status: 200 };
  };

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string) => respond(url));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('merges both catalogues, nearest first', async () => {
    // the commons photo sits at the click, the panoramax one ~29 km away
    const { photos, errors } = await searchPhotos(2.294512, 48.858391, 500);
    expect(errors).toEqual([]);
    expect(photos.map((p) => p.source)).toEqual(['commons', 'panoramax']);
  });

  it('keeps the other source when one fails, and says which failed', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.startsWith('https://commons.wikimedia.org')
        ? { ok: false, status: 503, json: async () => ({}) }
        : respond(url),
    );

    const { photos, errors } = await searchPhotos(1.9248972, 48.8249055, 500);
    expect(photos.map((p) => p.source)).toEqual(['panoramax']);
    expect(errors).toEqual(['Commons: Commons returned 503']);
  });

  it('drops panoramax photos whose image host is down and says so', async () => {
    // its own host, because reachability is cached per host across searches
    const onDownHost = {
      features: [
        {
          id: 'down',
          geometry: { coordinates: [2.2945, 48.8584] },
          assets: { thumb: { href: 'https://down.example.org/thumb.jpg' } },
        },
      ],
    };
    fetchMock.mockImplementation(async (url: string, init?: { method?: string }) => {
      if (init?.method === 'HEAD') throw new Error('connect ECONNREFUSED');
      if (url.startsWith('https://api.panoramax.xyz')) {
        return { ok: true, status: 200, json: async () => onDownHost };
      }
      return respond(url);
    });

    const { photos, errors } = await searchPhotos(2.294512, 48.858391, 500);
    expect(photos.map((p) => p.source)).toEqual(['commons']);
    expect(errors).toEqual([
      'Panoramax: the host instance for these photos is unreachable',
    ]);
  });
});
