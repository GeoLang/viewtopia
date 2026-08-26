import { showAssetsAt, showLiveAssets } from '../live/assetHistory';
import { useAssetStateStore } from '../live/assetState';
import { useLiveStore } from '../live/liveStore';
import { ActionError, registerAction } from './registry';
import { isoMoment } from './resolve';

registerAction({
  name: 'history.show_at',
  description: 'Show every asset as it stood at a past moment, instead of live.',
  parameters: {
    at: { type: 'string', description: 'ISO 8601 moment to show.', required: true },
  },
  run: async (args) => {
    const { documentId } = useLiveStore.getState();
    if (documentId === null) {
      throw new ActionError('this session is not joined to a live document');
    }
    const at = isoMoment('at', args.at as string);
    const shown = await showAssetsAt(documentId, at);
    return { text: `Showing ${shown} assets as they stood at ${at}.` };
  },
});

registerAction({
  name: 'history.show_live',
  description: 'Follow the live readings again, after showing a past moment.',
  parameters: {},
  run: () => {
    const was = useAssetStateStore.getState().historyAt;
    showLiveAssets();
    if (was === null) return { text: 'The map was already following the live readings.' };
    return { text: 'The map follows the live readings again.' };
  },
});
