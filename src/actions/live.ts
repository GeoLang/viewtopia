import { currentBbox } from '../lib/terrainAnalysis';
import { createFeed, createWatch, deleteFeed, listFeeds, listLiveDocuments } from '../live/api';
import {
  FALLBACK_ASSET_COLOR,
  FALLBACK_OFFLINE_COLOR,
  saveAssetRule,
} from '../live/assetRule';
import { parseBreakpoints } from '../live/assetState';
import { useLiveStore } from '../live/liveStore';
import {
  ASSET_RULE_ID,
  DEFAULT_WATCH_INTERVAL_SECONDS,
  MINIMUM_WATCH_INTERVAL_SECONDS,
  WATCH_REDUCERS,
  type AssetRule,
  type WatchReducer,
  type WatchRegion,
  type WatchThresholdOp,
} from '../live/types';
import { useAgentLayerStore } from '../store/agentLayers';
import { drawnFeatureGeometry, useDrawStore } from '../store/draw';
import { useTiles3dLayerStore } from '../store/tiles3dLayers';
import { bboxPolygon, readBbox } from './bbox';
import { ActionError, registerAction } from './registry';
import { labelOf, resolveOne, type Named } from './resolve';

const MIN_FEED_INTERVAL_SECONDS = 1;

const WATCH_THRESHOLD_OPS: readonly WatchThresholdOp[] = ['gt', 'lt'];

/** The document this session is in, which every write below needs. */
function joinedDocumentId(): string {
  const { documentId } = useLiveStore.getState();
  if (documentId === null) {
    throw new ActionError('this session is not joined to a live map');
  }
  return documentId;
}

/** Whether the document already holds this exact rule. */
function sameAssetRule(saved: AssetRule | undefined, wanted: AssetRule): boolean {
  if (!saved) return false;
  return (
    saved.layerId === wanted.layerId &&
    saved.kind === wanted.kind &&
    saved.defaultColor === wanted.defaultColor &&
    saved.offlineColor === wanted.offlineColor &&
    saved.breakpoints.length === wanted.breakpoints.length &&
    saved.breakpoints.every(
      (point, index) =>
        point.value === wanted.breakpoints[index].value &&
        point.color === wanted.breakpoints[index].color,
    )
  );
}

/** The last polygon the Draw tool left on the map, which is what the panel watches. */
function drawnPolygonRegion(): WatchRegion | null {
  const polygons = useDrawStore.getState().features.filter((feature) => feature.type === 'Polygon');
  const last = polygons.at(-1);
  if (!last) return null;
  const geometry = drawnFeatureGeometry(last);
  return geometry.type === 'Polygon' ? geometry : null;
}

/** The ground a watch reads: the bbox given, else the drawn polygon, else the view. */
function watchRegion(bbox: unknown): WatchRegion {
  if (bbox !== undefined) return bboxPolygon(readBbox(bbox));
  const drawn = drawnPolygonRegion();
  if (drawn) return drawn;
  const view = currentBbox();
  if (!view) {
    throw new ActionError('a watch needs a bbox, or a polygon drawn on the map');
  }
  return bboxPolygon(view);
}

/** The threshold half of a new watch, which is both fields or neither. */
function watchThreshold(
  op: WatchThresholdOp | undefined,
  value: number | undefined,
): { thresholdOp?: WatchThresholdOp; thresholdValue?: number } {
  if (op === undefined && value === undefined) return {};
  if (op === undefined || value === undefined) {
    throw new ActionError('an alert needs both threshold_op and threshold_value, or neither');
  }
  return { thresholdOp: op, thresholdValue: value };
}

/** The layers an asset rule can colour: the ones drawn per feature or per tile. */
function assetLayers(): Named[] {
  return [...useAgentLayerStore.getState().layers, ...useTiles3dLayerStore.getState().layers].map(
    (layer) => ({ id: layer.id, name: layer.name }),
  );
}

registerAction({
  name: 'live.list',
  description: 'List the live maps this account can join.',
  parameters: {},
  reads: true,
  run: async () => {
    const documents = await listLiveDocuments();
    if (documents.length === 0) return { text: 'There are no live maps.' };
    const lines = documents.map((document) => labelOf(document, documents)).join(', ');
    return { text: `${documents.length} live maps: ${lines}.` };
  },
});

registerAction({
  name: 'live.join',
  description: 'Join a live map, so edits and readings are shared with everyone in it.',
  parameters: {
    map: { type: 'string', description: 'Live map name.', required: true },
  },
  run: async (args) => {
    const document = resolveOne('live map', args.map as string, await listLiveDocuments());
    if (useLiveStore.getState().documentId === document.id) {
      throw new ActionError(`This session is already in ${document.name}.`);
    }
    useLiveStore.getState().connect({ documentId: document.id });
    // connect answers nothing, and without a bearer it opens no socket at all
    if (useLiveStore.getState().documentId !== document.id) {
      throw new ActionError(`could not join ${document.name}: this session has no sign in`);
    }
    return { text: `Joined ${document.name}.` };
  },
});

registerAction({
  name: 'live.leave',
  description: 'Leave the live map this session is in.',
  parameters: {},
  run: () => {
    const documentId = joinedDocumentId();
    // the name comes with the first snapshot, so a session that never got one has only the id
    const name = useLiveStore.getState().document.meta.name || documentId;
    useLiveStore.getState().disconnect();
    return { text: `Left ${name}.` };
  },
});

registerAction({
  name: 'live.create_feed',
  description: 'Create a producer that may send readings into the live map.',
  parameters: {
    name: { type: 'string', description: 'What the feed is called.', required: true },
    interval_seconds: {
      type: 'number',
      description: 'How often the producer reports, in seconds.',
      required: true,
    },
  },
  run: async (args) => {
    const documentId = joinedDocumentId();
    const name = (args.name as string).trim();
    const intervalSeconds = args.interval_seconds as number;
    if (name === '') throw new ActionError('a feed needs a name');
    if (intervalSeconds < MIN_FEED_INTERVAL_SECONDS) {
      throw new ActionError(`a feed reports no more often than every ${MIN_FEED_INTERVAL_SECONDS} second`);
    }
    const feed = await createFeed(documentId, name, intervalSeconds);
    return {
      text: `Feed ${feed.name} reports every ${feed.intervalSeconds}s. Its token is ${feed.token}, shown this once.`,
    };
  },
});

registerAction({
  name: 'live.remove_feed',
  description: 'Delete a feed, so its producer can no longer send readings.',
  parameters: {
    feed: { type: 'string', description: 'Feed id or name.', required: true },
  },
  destructive: true,
  run: async (args) => {
    const documentId = joinedDocumentId();
    const feed = resolveOne('feed', args.feed as string, await listFeeds(documentId));
    await deleteFeed(documentId, feed.id);
    return { text: `Feed ${feed.name} is gone.` };
  },
});

registerAction({
  name: 'live.watch_region',
  description:
    'Watch a region of a raster layer on the live map, reducing it to one number every so often and alerting when that number crosses a threshold.',
  parameters: {
    layer: { type: 'string', description: 'Geoplumb layer name to read.', required: true },
    reducer: {
      type: 'string',
      description: `How the region becomes one number: ${WATCH_REDUCERS.join(', ')}.`,
      enum: WATCH_REDUCERS,
      required: true,
    },
    interval_seconds: {
      type: 'number',
      description: `How often to read the region, in seconds, ${MINIMUM_WATCH_INTERVAL_SECONDS} at the least. ${DEFAULT_WATCH_INTERVAL_SECONDS} by default.`,
    },
    name: { type: 'string', description: 'What the watch is called. Named after the layer by default.' },
    bbox: {
      type: 'array',
      description:
        'Where to watch, as [west, south, east, north] in degrees. The polygon drawn on the map, or the current view, by default.',
    },
    threshold_op: {
      type: 'string',
      description: 'Alert when the reading is above (gt) or below (lt) threshold_value.',
      enum: WATCH_THRESHOLD_OPS,
    },
    threshold_value: { type: 'number', description: 'The number the reading has to cross to alert.' },
  },
  run: async (args) => {
    const documentId = joinedDocumentId();
    const layer = (args.layer as string).trim();
    const reducer = args.reducer as WatchReducer;
    const intervalSeconds = (args.interval_seconds as number) ?? DEFAULT_WATCH_INTERVAL_SECONDS;
    if (intervalSeconds < MINIMUM_WATCH_INTERVAL_SECONDS) {
      throw new ActionError(
        `a watch reads no more often than every ${MINIMUM_WATCH_INTERVAL_SECONDS} seconds`,
      );
    }
    const watch = await createWatch(documentId, {
      name: ((args.name as string) ?? `${reducer} of ${layer}`).trim(),
      layer,
      region: watchRegion(args.bbox),
      reducer,
      intervalSeconds,
      ...watchThreshold(
        args.threshold_op as WatchThresholdOp | undefined,
        args.threshold_value as number | undefined,
      ),
    });
    const alert =
      watch.thresholdOp === null || watch.thresholdValue === null
        ? 'no alert'
        : `alerting ${watch.thresholdOp === 'gt' ? 'above' : 'below'} ${watch.thresholdValue}`;
    return {
      text: `${watch.name} reads the ${watch.reducer} of ${watch.layer} every ${watch.intervalSeconds}s, ${alert}.`,
    };
  },
});

registerAction({
  name: 'live.set_asset_rule',
  description: 'Colour the assets on a layer by their latest reading of one kind.',
  parameters: {
    layer: { type: 'string', description: 'Asset layer id or name.', required: true },
    kind: { type: 'string', description: 'Reading kind, e.g. temperature.', required: true },
    breakpoints: {
      type: 'string',
      description: 'Value and colour pairs, e.g. "0:#2ecc71, 25:#f1c40f, 30:#e74c3c".',
      required: true,
    },
    default_color: { type: 'string', description: 'Colour for an asset with no reading in range.' },
    offline_color: { type: 'string', description: 'Colour for an asset agora stopped hearing from.' },
  },
  run: (args) => {
    joinedDocumentId();
    if (useLiveStore.getState().role !== 'edit') {
      throw new ActionError('this session joined the live map with the view role');
    }
    const layer = resolveOne('layer', args.layer as string, assetLayers());
    const breakpoints = parseBreakpoints(args.breakpoints as string);
    if (breakpoints.length === 0) {
      throw new ActionError(`no value and colour pair could be read from "${args.breakpoints}"`);
    }
    const rule: AssetRule = {
      layerId: layer.id,
      kind: (args.kind as string).trim(),
      breakpoints,
      defaultColor: (args.default_color as string) ?? FALLBACK_ASSET_COLOR,
      offlineColor: (args.offline_color as string) ?? FALLBACK_OFFLINE_COLOR,
    };
    if (sameAssetRule(useLiveStore.getState().document.assets[ASSET_RULE_ID], rule)) {
      throw new ActionError(`${layer.name} is already coloured by ${rule.kind} over those breakpoints.`);
    }
    saveAssetRule(rule);
    return {
      text: `${layer.name} is coloured by ${rule.kind} over ${breakpoints.length} breakpoints.`,
    };
  },
});
