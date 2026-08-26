import { createFeed, deleteFeed, listFeeds, listLiveDocuments } from '../live/api';
import {
  FALLBACK_ASSET_COLOR,
  FALLBACK_OFFLINE_COLOR,
  saveAssetRule,
} from '../live/assetRule';
import { parseBreakpoints } from '../live/assetState';
import { useLiveStore } from '../live/liveStore';
import { useAgentLayerStore } from '../store/agentLayers';
import { useTiles3dLayerStore } from '../store/tiles3dLayers';
import { ActionError, registerAction } from './registry';
import { resolveOne, type Named } from './resolve';

const MIN_FEED_INTERVAL_SECONDS = 1;

/** The document this session is in, which every write below needs. */
function joinedDocumentId(): string {
  const { documentId } = useLiveStore.getState();
  if (documentId === null) {
    throw new ActionError('this session is not joined to a live document');
  }
  return documentId;
}

/** The layers an asset rule can colour: the ones drawn per feature or per tile. */
function assetLayers(): Named[] {
  return [...useAgentLayerStore.getState().layers, ...useTiles3dLayerStore.getState().layers].map(
    (layer) => ({ id: layer.id, name: layer.name }),
  );
}

registerAction({
  name: 'live.list',
  description: 'List the live documents this account can join.',
  parameters: {},
  reads: true,
  run: async () => {
    const documents = await listLiveDocuments();
    if (documents.length === 0) return { text: 'There are no live documents.' };
    const lines = documents.map((document) => `${document.name} (${document.id})`).join(', ');
    return { text: `${documents.length} live documents: ${lines}.` };
  },
});

registerAction({
  name: 'live.join',
  description: 'Join a live document, so edits and readings are shared with everyone in it.',
  parameters: {
    document: { type: 'string', description: 'Live document id or name.', required: true },
  },
  run: async (args) => {
    const document = resolveOne('document', args.document as string, await listLiveDocuments());
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
  description: 'Leave the live document this session is in.',
  parameters: {},
  destructive: true,
  run: () => {
    const documentId = joinedDocumentId();
    useLiveStore.getState().disconnect();
    return { text: `Left ${documentId}.` };
  },
});

registerAction({
  name: 'live.create_feed',
  description: 'Create a producer that may send readings into the live document.',
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
      throw new ActionError('this session joined the live document with the view role');
    }
    const layer = resolveOne('layer', args.layer as string, assetLayers());
    const breakpoints = parseBreakpoints(args.breakpoints as string);
    if (breakpoints.length === 0) {
      throw new ActionError(`no value and colour pair could be read from "${args.breakpoints}"`);
    }
    saveAssetRule({
      layerId: layer.id,
      kind: (args.kind as string).trim(),
      breakpoints,
      defaultColor: (args.default_color as string) ?? FALLBACK_ASSET_COLOR,
      offlineColor: (args.offline_color as string) ?? FALLBACK_OFFLINE_COLOR,
    });
    return {
      text: `${layer.name} is coloured by ${args.kind as string} over ${breakpoints.length} breakpoints.`,
    };
  },
});
