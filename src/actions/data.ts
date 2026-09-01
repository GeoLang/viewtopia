/**
 * The data panels without the mouse: import a file from a URL, draw GeoJSON
 * given directly, add a service, add a 3D tileset, export a layer, browse a
 * STAC catalog, and query the in-browser database.
 * Uploading a file stays on the panel, since a file picker needs the mouse.
 */
import {
  attachUrl,
  ATTACH_FORMATS,
  type AttachFormat,
} from '../features/dataSources/sqlWorkspace';
import {
  addOgcService,
  ADDABLE_SERVICE_TYPES,
  type AddableServiceType,
} from '../features/dataSources/ogcService';
import { importUrlIntoViewer } from '../features/dataSources/importIntoViewer';
import { addStacAsset } from '../features/stac/addAsset';
import {
  assetAction,
  fetchCatalog,
  fetchItem,
  fetchItemPage,
  itemRequest,
  ITEM_PAGE_SIZE,
  type StacItem,
} from '../features/stac/client';
import {
  CONVERT_FORMATS,
  convertFileName,
  convertLayer,
  type ConvertFormat,
} from '../features/convert/formats';
import { ACCEPT_FORMATS } from '../lib/importFiles';
import { downloadBytes } from '../lib/downloadBytes';
import { getViewBounds } from '../lib/viewBounds';
import { toFeatureCollection, useAgentLayerStore } from '../store/agentLayers';
import { addTilesetToGlobe, CHAT_TILESET_WAIT_SECONDS } from '../viewer/addTileset';
import { NO_CESIUM_GLOBE } from './globe';
import { ActionError, registerAction } from './registry';
import { resolveOne } from './resolve';

const EXPORT_FORMATS = CONVERT_FORMATS.map((format) => format.id);
const DEFAULT_EXPORT_FORMAT: ConvertFormat = 'geojson';

/** west, south, east and north */
const BBOX_VALUE_COUNT = 4;

/** The date part of an ISO 8601 moment, which is what an item listing shows. */
const ITEM_DATE_LENGTH = 10;

const LAYER_PARAMETER = {
  type: 'string',
  description: 'Layer id or name.',
  required: true,
} as const;

const CATALOG_PARAMETER = {
  type: 'string',
  description: 'STAC catalog URL, as in https://earth-search.aws.element84.com/v1.',
  required: true,
} as const;

/**
 * A URL an action will open, answered back unchanged. Anything that is not an
 * absolute http or https URL is refused here, since a caller reaching the
 * registry directly is not checked anywhere else.
 */
function fetchableUrl(url: string): string {
  let scheme: string;
  try {
    scheme = new URL(url).protocol;
  } catch {
    throw new ActionError(`"${url}" is not a full URL, so give the whole https:// address`);
  }
  if (scheme !== 'http:' && scheme !== 'https:') {
    throw new ActionError(
      `the viewer opens http and https URLs, not ${scheme.replace(':', '')} ones`,
    );
  }
  return url;
}

/**
 * The file name the import routes by: what the caller called it, else the
 * URL's last path segment, carrying the format the caller named.
 */
function importFileName(url: string, name: string | undefined, format: string | undefined): string {
  const path = new URL(url).pathname;
  const base = name ?? decodeURIComponent(path.split('/').pop() ?? '');
  if (base === '') throw new ActionError('the URL names no file, so give it a name');
  if (!format) return base;
  if (base.toLowerCase().endsWith(format)) return base;
  return `${base.replace(/\.[^.]+$/, '')}${format}`;
}

registerAction({
  name: 'data.import_url',
  description: 'Import a data file from a URL and draw it on the map.',
  parameters: {
    url: { type: 'string', description: 'URL of the file to import.', required: true },
    name: { type: 'string', description: 'Name for the layer, the file name by default.' },
    format: {
      type: 'string',
      description: "The file's format, read from the URL by default.",
      enum: ACCEPT_FORMATS,
    },
  },
  run: async (args) => {
    const url = fetchableUrl(args.url as string);
    const fileName = importFileName(
      url,
      args.name as string | undefined,
      args.format as string | undefined,
    );
    const status = await importUrlIntoViewer(url, fileName);
    if (status.failed) throw new ActionError(status.text);
    return { text: status.text };
  },
});

registerAction({
  name: 'data.add_geojson',
  description:
    'Draw GeoJSON given here directly on the map. For a result you already hold, ' +
    'a handful of features at most. Use data.import_url for anything at a URL or ' +
    'larger than that.',
  parameters: {
    geojson: {
      type: 'object',
      description:
        'The GeoJSON itself: a FeatureCollection, a Feature, or a bare geometry.',
      required: true,
    },
    name: { type: 'string', description: 'Name for the layer.' },
    color: { type: 'string', description: 'CSS colour for the features, blue by default.' },
  },
  run: (args) => {
    const geojson = toFeatureCollection(args.geojson);
    if (!geojson) throw new ActionError('that is not GeoJSON I can draw');
    const name = typeof args.name === 'string' ? args.name : 'GeoJSON';
    useAgentLayerStore.getState().addLayer({
      id: crypto.randomUUID(),
      name,
      color: typeof args.color === 'string' ? args.color : '#3388ff',
      geojson,
    });
    return { text: `Drew ${geojson.features.length} features as "${name}".` };
  },
});

registerAction({
  name: 'data.add_service',
  description: 'Add a map service as a layer, from its URL.',
  parameters: {
    type: {
      type: 'string',
      description: 'Which kind of service the URL serves.',
      enum: ADDABLE_SERVICE_TYPES,
      required: true,
    },
    url: {
      type: 'string',
      description: 'Service URL. WMTS and XYZ take a {z}/{x}/{y} tile template.',
      required: true,
    },
    name: { type: 'string', description: 'Name for the layer.', required: true },
  },
  run: async (args) => ({
    text: await addOgcService(
      args.name as string,
      fetchableUrl(args.url as string),
      args.type as AddableServiceType,
    ),
  }),
});

registerAction({
  name: 'data.add_tileset',
  description: 'Load a 3D tileset from its URL onto the globe and fly the camera to it.',
  parameters: {
    url: { type: 'string', description: 'URL of the tileset.json to load.', required: true },
    name: { type: 'string', description: 'Name for the layer in the layer list.' },
  },
  run: async (args) => {
    const { name, failure } = await addTilesetToGlobe(
      fetchableUrl(args.url as string),
      args.name as string | undefined,
    );
    if (failure === 'no-globe') throw new ActionError(NO_CESIUM_GLOBE);
    if (failure === 'not-drawn') {
      throw new ActionError(
        `${name} has not drawn within ${CHAT_TILESET_WAIT_SECONDS} seconds and is still loading in the layer list, where its row says if it failed`,
      );
    }
    return { text: `${name} is on the globe and the camera is looking at it.` };
  },
});

registerAction({
  name: 'data.export',
  description: 'Download one vector layer as a file.',
  parameters: {
    layer: LAYER_PARAMETER,
    format: {
      type: 'string',
      description: `Which format to write, ${DEFAULT_EXPORT_FORMAT} by default.`,
      enum: EXPORT_FORMATS,
    },
  },
  run: async (args) => {
    const layer = resolveOne('layer', args.layer as string, useAgentLayerStore.getState().layers);
    const chosen = (args.format as ConvertFormat) ?? DEFAULT_EXPORT_FORMAT;
    const spec = CONVERT_FORMATS.find((format) => format.id === chosen);
    if (!spec) throw new ActionError(`${chosen} is not a format the viewer writes`);

    const bytes = await convertLayer(layer.geojson, layer.name, spec.id);
    const fileName = convertFileName(layer.name, spec.id);
    downloadBytes(bytes, fileName, spec.mimeType);
    return { text: `Downloaded ${layer.name} as ${fileName}, ${bytes.length} bytes.` };
  },
});

function currentViewBbox(): number[] {
  const bounds = getViewBounds();
  return [bounds.west, bounds.south, bounds.east, bounds.north];
}

function readBbox(text: string): number[] {
  const values = text.split(',').map((value) => Number(value.trim()));
  if (values.length !== BBOX_VALUE_COUNT || !values.every(Number.isFinite)) {
    throw new ActionError(`a bbox is west,south,east,north in degrees, not "${text}"`);
  }
  return values;
}

/** An item as one line: when it was taken, and the assets the viewer can draw. */
function describeItem(item: StacItem): string {
  const drawable = item.assets.flatMap((asset) => {
    const action = assetAction(asset);
    return action ? [`${asset.key} (${action})`] : [];
  });
  const when = item.datetime?.slice(0, ITEM_DATE_LENGTH) ?? 'no date';
  return `${item.id}, ${when}, ${drawable.length > 0 ? drawable.join(', ') : 'nothing drawable'}`;
}

registerAction({
  name: 'stac.search',
  description:
    'Search one collection of a STAC catalog for items, listing the assets each one carries.',
  parameters: {
    catalog: CATALOG_PARAMETER,
    collection: { type: 'string', description: 'Collection id or title.', required: true },
    bbox: {
      type: 'string',
      description: 'west,south,east,north in degrees. The current view by default.',
    },
    limit: { type: 'number', description: `How many items, ${ITEM_PAGE_SIZE} by default.` },
  },
  reads: true,
  run: async (args) => {
    const catalog = await fetchCatalog(fetchableUrl(args.catalog as string));
    const collection = resolveOne(
      'collection',
      args.collection as string,
      catalog.collections.map((entry) => ({ ...entry, name: entry.title })),
    );
    const bbox = args.bbox === undefined ? currentViewBbox() : readBbox(args.bbox as string);
    const limit = (args.limit as number) ?? ITEM_PAGE_SIZE;

    const page = await fetchItemPage(
      itemRequest(catalog, collection, { text: '', bbox, maxCloudCover: null }, limit),
    );
    const items = page.items.slice(0, limit);
    if (items.length === 0) {
      return { text: `${collection.title} has no items in ${bbox.join(', ')}.` };
    }
    const lines = items.map(describeItem).join('\n');
    return { text: `${items.length} items in ${collection.title}.\n${lines}` };
  },
});

registerAction({
  name: 'stac.add_asset',
  description: 'Put one asset of a STAC item on the map, the way its kind allows.',
  parameters: {
    catalog: CATALOG_PARAMETER,
    item: { type: 'string', description: 'Item id, as stac.search lists it.', required: true },
    asset: { type: 'string', description: 'Asset key, as stac.search lists it.', required: true },
  },
  run: async (args) => {
    const catalog = await fetchCatalog(fetchableUrl(args.catalog as string));
    const wanted = args.item as string;
    const item = await fetchItem(catalog, wanted);
    if (!item) throw new ActionError(`${catalog.title} holds no item ${wanted}`);
    const key = args.asset as string;
    const asset = item.assets.find((carried) => carried.key === key);
    if (!asset) {
      const keys = item.assets.map((carried) => carried.key).join(', ');
      throw new ActionError(`${item.id} has no asset ${key}. It carries: ${keys}`);
    }
    return { text: await addStacAsset(item.id, asset) };
  },
});

registerAction({
  name: 'sql.attach_url',
  description: 'Attach a remote CSV or Parquet file as a table SQL can query.',
  parameters: {
    url: { type: 'string', description: 'URL of the .csv or .parquet file.', required: true },
    name: { type: 'string', description: 'Name to query it as, the file name by default.' },
    format: {
      type: 'string',
      description: "The file's format, read from the URL by default.",
      enum: ATTACH_FORMATS,
    },
  },
  run: async (args) => {
    const view = await attachUrl(
      fetchableUrl(args.url as string),
      args.name as string | undefined,
      args.format as AttachFormat | undefined,
    );
    return { text: `Attached, query it as ${view}.` };
  },
});
