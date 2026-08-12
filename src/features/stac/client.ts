// Reads a STAC catalog straight from the browser: root, collections, items,
// assets. The platform bearer only goes to a catalog on our own origin, since
// anything else is a third-party server that has no business seeing it.

import { apiHeaders, noticeRefusal } from '../../lib/apiAuth';

/** Catalogs the panel offers before anyone types a URL. */
export const STAC_CATALOGS: { url: string; label: string }[] = [
  { url: 'https://earth-search.aws.element84.com/v1', label: 'Earth Search (Sentinel, Landsat)' },
  { url: 'https://planetarycomputer.microsoft.com/api/stac/v1', label: 'Microsoft Planetary Computer' },
  { url: 'https://stac.openlandmap.org', label: 'OpenLandMap' },
];

/** How many items one page of a collection asks for. */
export const ITEM_PAGE_SIZE = 20;

export interface StacLink {
  rel: string;
  href: string;
  title?: string;
  /** what a catalog says the link has to be fetched with, absent meaning GET */
  method?: string;
}

export interface StacAsset {
  /** the key it sits under in the item's `assets` object */
  key: string;
  href: string;
  title: string;
  mediaType: string;
  roles: string[];
}

export interface StacCollection {
  id: string;
  title: string;
  description: string;
  itemsUrl: string;
}

export interface StacCatalog {
  url: string;
  title: string;
  /** where the catalog takes a filtered item search */
  searchUrl: string;
  collections: StacCollection[];
}

/** What the item listing narrows a collection by. */
export interface ItemFilters {
  text: string;
  bbox: number[] | null;
  maxCloudCover: number | null;
}

/** One page of items, either the plain listing or a filtered search. */
export interface ItemRequest {
  url: string;
  /** the POST body, set only when the filters need the catalog's search */
  searchBody: Record<string, unknown> | null;
}

export interface StacItem {
  id: string;
  datetime: string | null;
  geometry: GeoJSON.Geometry | null;
  assets: StacAsset[];
}

export interface StacItemPage {
  items: StacItem[];
  /** the catalog's own next-page link, absolute; null on the last page */
  nextUrl: string | null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function sameOrigin(url: string): boolean {
  return new URL(url, window.location.href).origin === window.location.origin;
}

/**
 * An href as written in a STAC document, which may be relative to it. The
 * {z}/{x}/{y} of a tile template has to come back out intact, and `new URL`
 * percent-encodes braces.
 */
export function resolveHref(href: string, base: string): string {
  return new URL(href, base).toString().replace(/%7B/g, '{').replace(/%7D/g, '}');
}

export function parseLinks(body: unknown, base: string): StacLink[] {
  const raw = record(body).links;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    const link = record(entry);
    const href = text(link.href);
    const rel = text(link.rel);
    if (!href || !rel) return [];
    return [
      {
        rel,
        href: resolveHref(href, base),
        title: text(link.title) || undefined,
        method: text(link.method) || undefined,
      },
    ];
  });
}

export function linkHref(links: StacLink[], rel: string): string | null {
  return links.find((link) => link.rel === rel)?.href ?? null;
}

function isGetLink(link: StacLink): boolean {
  return !link.method || link.method.toUpperCase() === 'GET';
}

function jsonHeaders(sending: boolean): Record<string, string> {
  if (!sending) return { Accept: 'application/json' };
  return { Accept: 'application/json', 'Content-Type': 'application/json' };
}

export async function fetchStac(
  url: string,
  searchBody?: Record<string, unknown>,
): Promise<unknown> {
  const local = sameOrigin(url);
  const init: RequestInit = { headers: local ? apiHeaders() : jsonHeaders(Boolean(searchBody)) };
  if (searchBody) {
    init.method = 'POST';
    init.body = JSON.stringify(searchBody);
  }
  const response = await fetch(url, init).catch(() => null);
  if (!response) throw new Error('The catalog is unreachable.');
  if (local) noticeRefusal(response.status);
  if (!response.ok) throw new Error(`The catalog answered HTTP ${response.status}.`);
  return response.json();
}

function parseCollection(body: unknown, base: string): StacCollection | null {
  const raw = record(body);
  const id = text(raw.id);
  if (!id) return null;
  const links = parseLinks(raw, base);
  return {
    id,
    title: text(raw.title) || id,
    description: text(raw.description),
    itemsUrl: linkHref(links, 'items') ?? `${trimSlash(base)}/${encodeURIComponent(id)}/items`,
  };
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/**
 * Where a catalog lists its collections. An API advertises it as the `data`
 * link; a catalog that does not is asked at the path the STAC API spec fixes.
 */
export function collectionsUrl(links: StacLink[], catalogUrl: string): string {
  return linkHref(links, 'data') ?? `${trimSlash(catalogUrl)}/collections`;
}

/** Where a filtered item search goes, the `search` link or the spec's path. */
export function itemSearchUrl(links: StacLink[], catalogUrl: string): string {
  return linkHref(links, 'search') ?? `${trimSlash(catalogUrl)}/search`;
}

export function parseCollections(body: unknown, base: string): StacCollection[] {
  const raw = record(body).collections;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    const collection = parseCollection(entry, base);
    return collection ? [collection] : [];
  });
}

function parseAssets(body: unknown, base: string): StacAsset[] {
  const assets = record(record(body).assets);
  return Object.entries(assets).flatMap(([key, entry]) => {
    const asset = record(entry);
    const href = text(asset.href);
    if (!href) return [];
    const roles = Array.isArray(asset.roles) ? asset.roles.filter((r) => typeof r === 'string') : [];
    return [
      {
        key,
        href: resolveHref(href, base),
        title: text(asset.title) || key,
        mediaType: text(asset.type),
        roles: roles as string[],
      },
    ];
  });
}

export function parseItems(body: unknown, base: string): StacItemPage {
  const raw = record(body).features;
  const features = Array.isArray(raw) ? raw : [];
  const items = features.flatMap((entry) => {
    const feature = record(entry);
    const id = text(feature.id);
    if (!id) return [];
    const properties = record(feature.properties);
    return [
      {
        id,
        datetime: text(properties.datetime) || null,
        geometry: (feature.geometry as GeoJSON.Geometry | null) ?? null,
        assets: parseAssets(feature, base),
      },
    ];
  });
  // a search pages through a POST link carrying its own body, which this
  // client cannot replay, so only a plain next link becomes a Load more
  const next = parseLinks(body, base).find((link) => link.rel === 'next' && isGetLink(link));
  return { items, nextUrl: next?.href ?? null };
}

export function catalogTitle(body: unknown, url: string): string {
  const raw = record(body);
  return text(raw.title) || text(raw.id) || url;
}

/** The item page URL for one collection, optionally cut to a lon/lat box. */
export function itemsPageUrl(collection: StacCollection, bbox: number[] | null): string {
  const url = new URL(collection.itemsUrl);
  url.searchParams.set('limit', String(ITEM_PAGE_SIZE));
  if (bbox) url.searchParams.set('bbox', bbox.join(','));
  return url.toString();
}

/** The property the query extension holds cloud cover under, in percent. */
const CLOUD_COVER_FIELD = 'eo:cloud_cover';

export function itemSearchBody(
  collectionId: string,
  filters: ItemFilters,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    collections: [collectionId],
    limit: ITEM_PAGE_SIZE,
  };
  if (filters.bbox) body.bbox = filters.bbox;
  // free text is its own STAC extension, a catalog without it ignores q
  if (filters.text) body.q = filters.text;
  if (filters.maxCloudCover !== null) {
    body.query = { [CLOUD_COVER_FIELD]: { lte: filters.maxCloudCover } };
  }
  return body;
}

/**
 * The plain item listing pages and needs no search endpoint, so it stays in
 * use until a filter the listing cannot express is set.
 */
export function itemRequest(
  searchUrl: string,
  collection: StacCollection,
  filters: ItemFilters,
): ItemRequest {
  if (!filters.text && filters.maxCloudCover === null) {
    return { url: itemsPageUrl(collection, filters.bbox), searchBody: null };
  }
  return { url: searchUrl, searchBody: itemSearchBody(collection.id, filters) };
}

/**
 * What the viewer can do with an asset. Everything else is listed without an
 * action rather than offered a button that would fail.
 */
export type AssetAction = 'geojson' | 'pmtiles' | 'tiles' | 'raster' | null;

const RASTER_MEDIA = 'image/tiff';

export function assetAction(asset: StacAsset): AssetAction {
  const href = asset.href.toLowerCase();
  const media = asset.mediaType.toLowerCase();
  if (href.includes('{z}')) return 'tiles';
  if (media.includes('geo+json') || href.endsWith('.geojson')) return 'geojson';
  if (media.includes('pmtiles') || href.split('?')[0].endsWith('.pmtiles')) return 'pmtiles';
  if (media.includes(RASTER_MEDIA) || /\.tiff?($|\?)/.test(href)) return 'raster';
  return null;
}

/** The item outlines as one layer, which is what a coverage check needs. */
export function itemFootprints(items: StacItem[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: items.flatMap((item) =>
      item.geometry
        ? [
            {
              type: 'Feature' as const,
              geometry: item.geometry,
              properties: { id: item.id, datetime: item.datetime },
            },
          ]
        : [],
    ),
  };
}
