// Reads a STAC catalog straight from the browser: root, collections, items,
// assets. The platform bearer only goes to a catalog on our own origin, since
// anything else is a third-party server that has no business seeing it.

import { apiHeaders, noticeRefusal } from '../../lib/apiAuth';

/** Catalogs the panel offers before anyone types a URL. */
export const STAC_CATALOGS: { url: string; label: string }[] = [
  { url: 'https://earth-search.aws.element84.com/v1', label: 'Earth Search (Sentinel, Landsat)' },
  { url: 'https://planetarycomputer.microsoft.com/api/stac/v1', label: 'Microsoft Planetary Computer' },
  { url: 'https://api.stac.ceda.ac.uk', label: 'CEDA (CMIP6, ESA CCI, Sentinel ARD)' },
];

/** How many items one page of a collection asks for. */
export const ITEM_PAGE_SIZE = 20;

export interface StacLink {
  rel: string;
  href: string;
  title?: string;
  /** what a catalog says the link has to be fetched with, absent meaning GET */
  method?: string;
  /** the body a POST link is to be sent with */
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
  /** the link's body adds to the body that produced it instead of replacing it */
  merge?: boolean;
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
  /** whether the catalog conforms to free text on item search */
  freeTextSearch: boolean;
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
  /** headers a paging link asks for, on top of the usual JSON ones */
  headers?: Record<string, string>;
}

export interface StacItem {
  id: string;
  datetime: string | null;
  geometry: GeoJSON.Geometry | null;
  assets: StacAsset[];
}

export interface StacItemPage {
  items: StacItem[];
  /** the request the catalog's own next link asks for; null on the last page */
  next: ItemRequest | null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringRecord(value: unknown): Record<string, string> | undefined {
  const entries = Object.entries(object(value) ?? {}).filter(
    ([, entry]) => typeof entry === 'string',
  );
  return entries.length > 0 ? (Object.fromEntries(entries) as Record<string, string>) : undefined;
}

function sameOrigin(url: string): boolean {
  return new URL(url, window.location.href).origin === window.location.origin;
}

/**
 * An href as written in a STAC document, which may be relative to it, or null
 * when the viewer will not open it. The {z}/{x}/{y} of a tile template has to
 * come back out intact, and `new URL` percent-encodes braces.
 *
 * A catalog is a third party writing strings that end up at `fetch`, at a tile
 * source and at the raster panel, so only http and https get through, and a
 * catalog somewhere else may not name our own origin: that URL would be
 * fetched with the session bearer on it.
 */
export function resolveHref(href: string, base: string): string | null {
  let url: URL;
  try {
    url = new URL(href, base);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (sameOrigin(url.href) && !sameOrigin(base)) return null;
  return url.toString().replace(/%7B/g, '{').replace(/%7D/g, '}');
}

export function parseLinks(body: unknown, base: string): StacLink[] {
  const raw = record(body).links;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    const link = record(entry);
    const href = text(link.href);
    const rel = text(link.rel);
    if (!href || !rel) return [];
    const resolved = resolveHref(href, base);
    if (!resolved) return [];
    return [
      {
        rel,
        href: resolved,
        title: text(link.title) || undefined,
        method: text(link.method) || undefined,
        body: object(link.body),
        headers: stringRecord(link.headers),
        merge: link.merge === true,
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
  extraHeaders?: Record<string, string>,
): Promise<unknown> {
  const local = sameOrigin(url);
  // on our own origin the session bearer goes on last, so a link's own headers
  // cannot displace it
  const headers = local
    ? apiHeaders(extraHeaders)
    : { ...jsonHeaders(Boolean(searchBody)), ...extraHeaders };
  const init: RequestInit = { headers };
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

/** The part of a conformance URI that names free text on item search, any version. */
const FREE_TEXT_CONFORMANCE = 'item-search#free-text';

/** Whether the catalog's landing page claims free text on item search. */
export function parseFreeTextSearch(body: unknown): boolean {
  const raw = record(body).conformsTo;
  if (!Array.isArray(raw)) return false;
  return raw.some((uri) => typeof uri === 'string' && uri.includes(FREE_TEXT_CONFORMANCE));
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
    const resolved = resolveHref(href, base);
    if (!resolved) return [];
    const roles = Array.isArray(asset.roles) ? asset.roles.filter((r) => typeof r === 'string') : [];
    return [
      {
        key,
        href: resolved,
        title: text(asset.title) || key,
        mediaType: text(asset.type),
        roles: roles as string[],
      },
    ];
  });
}

/**
 * How to fetch a paging link. A search pages through a POST link carrying its
 * own body, and `merge` means that body only adds to the one that produced this
 * page, so the filters survive to the next page.
 */
function nextRequest(link: StacLink, sentBody: Record<string, unknown> | null): ItemRequest {
  if (isGetLink(link)) return { url: link.href, searchBody: null, headers: link.headers };
  const body = link.merge ? { ...(sentBody ?? {}), ...(link.body ?? {}) } : (link.body ?? {});
  return { url: link.href, searchBody: body, headers: link.headers };
}

function parseItems(
  body: unknown,
  base: string,
  sentBody: Record<string, unknown> | null,
): StacItemPage {
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
  const next = parseLinks(body, base).find((link) => link.rel === 'next');
  return { items, next: next ? nextRequest(next, sentBody) : null };
}

/** One page of items, plus the request that fetches the page after it. */
export async function fetchItemPage(request: ItemRequest): Promise<StacItemPage> {
  const body = await fetchStac(request.url, request.searchBody ?? undefined, request.headers);
  return parseItems(body, request.url, request.searchBody);
}

export function catalogTitle(body: unknown, url: string): string {
  const raw = record(body);
  return text(raw.title) || text(raw.id) || url;
}

/** How many items the catalog is asked for when only one of them is wanted. */
const SINGLE_ITEM = 1;

/**
 * One item by its id, through the catalog's item search, since the id alone
 * does not say which collection holds it.
 */
export async function fetchItem(catalog: StacCatalog, id: string): Promise<StacItem | null> {
  const page = await fetchItemPage({
    url: catalog.searchUrl,
    searchBody: { ids: [id], limit: SINGLE_ITEM },
  });
  return page.items.find((item) => item.id === id) ?? null;
}

/** A catalog's landing page and the collections it lists, which is what browsing it needs. */
export async function fetchCatalog(catalogUrl: string): Promise<StacCatalog> {
  const root = await fetchStac(catalogUrl);
  const links = parseLinks(root, catalogUrl);
  const listUrl = collectionsUrl(links, catalogUrl);
  const body = await fetchStac(listUrl);
  return {
    url: catalogUrl,
    title: catalogTitle(root, catalogUrl),
    searchUrl: itemSearchUrl(links, catalogUrl),
    freeTextSearch: parseFreeTextSearch(root),
    collections: parseCollections(body, listUrl),
  };
}

/** The item page URL for one collection, optionally cut to a lon/lat box. */
export function itemsPageUrl(
  collection: StacCollection,
  bbox: number[] | null,
  limit: number = ITEM_PAGE_SIZE,
): string {
  const url = new URL(collection.itemsUrl);
  url.searchParams.set('limit', String(limit));
  if (bbox) url.searchParams.set('bbox', bbox.join(','));
  return url.toString();
}

/** The property the query extension holds cloud cover under, in percent. */
const CLOUD_COVER_FIELD = 'eo:cloud_cover';

export function itemSearchBody(
  collectionId: string,
  filters: ItemFilters,
  freeTextSearch: boolean,
  limit: number = ITEM_PAGE_SIZE,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    collections: [collectionId],
    limit,
  };
  if (filters.bbox) body.bbox = filters.bbox;
  // a catalog outside the free-text conformance class either ignores q or, like
  // NASA CMR, answers HTTP 500 and loses the whole search
  // the class takes q as an array of terms on POST, a bare string is HTTP 400
  if (freeTextSearch && filters.text) body.q = [filters.text];
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
  catalog: StacCatalog,
  collection: StacCollection,
  filters: ItemFilters,
  limit: number = ITEM_PAGE_SIZE,
): ItemRequest {
  const searchesText = catalog.freeTextSearch && filters.text !== '';
  if (!searchesText && filters.maxCloudCover === null) {
    return { url: itemsPageUrl(collection, filters.bbox, limit), searchBody: null };
  }
  return {
    url: catalog.searchUrl,
    searchBody: itemSearchBody(collection.id, filters, catalog.freeTextSearch, limit),
  };
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
