import { showAssetsAt, showLiveAssets } from '../live/assetHistory';
import { useAssetStateStore } from '../live/assetState';
import { useLiveStore } from '../live/liveStore';
import { ActionError, registerAction } from './registry';
import { isoMoment } from './resolve';

const ALREADY_LIVE = 'The map is already following the live readings.';

registerAction({
  name: 'history.show_at',
  description: 'Show every asset as it stood at a past moment, instead of live.',
  parameters: {
    at: { type: 'string', description: 'ISO 8601 moment to show.', required: true },
  },
  run: async (args) => {
    const { documentId } = useLiveStore.getState();
    if (documentId === null) {
      throw new ActionError('this session is not joined to a live map');
    }
    const at = isoMoment('at', args.at as string);
    if (useAssetStateStore.getState().historyAt === at) {
      throw new ActionError(`The map is already showing every asset as it stood at ${at}.`);
    }
    const shown = await showAssetsAt(documentId, at);
    return { text: `Showing ${shown} assets as they stood at ${at}.` };
  },
});

registerAction({
  name: 'history.show_live',
  description: 'Follow the live readings again, after showing a past moment.',
  parameters: {},
  run: () => {
    if (useAssetStateStore.getState().historyAt === null) {
      throw new ActionError(ALREADY_LIVE);
    }
    showLiveAssets();
    return { text: 'The map follows the live readings again.' };
  },
});
