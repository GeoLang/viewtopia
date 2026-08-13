import type { StoryStep } from './storyExport';

/**
 * The contract between the viewer window playing a story and the presenter
 * window showing its speaker notes: where the steps are stored, the URL marker
 * that boots the presenter, and the messages the two windows exchange.
 *
 * Type-only imports keep this loadable without the viewer bundle.
 */

export const STORY_STEPS_STORAGE_KEY = 'viewtopia-stories';

export const STORY_PRESENTER_CHANNEL_NAME = 'viewtopia-story-presenter';

const PRESENTER_URL_PARAM = 'presenter';

/** One named window, so pressing Present again focuses the one already open. */
const PRESENTER_WINDOW_NAME = 'viewtopia-story-presenter';

const PRESENTER_WINDOW_FEATURES = 'popup=yes,width=720,height=600';

export type StoryPresenterMessage =
  /** presenter → viewer: asks for the current position */
  | { type: 'hello' }
  /** presenter → viewer: fly to this step and make it current */
  | { type: 'goto'; index: number }
  /** viewer → presenter: the position and whether playback is running */
  | { type: 'state'; index: number; playing: boolean }
  /** viewer → presenter: reload the steps from storage */
  | { type: 'steps-changed' }
  /** viewer → presenter: the viewer window is going away */
  | { type: 'viewer-closed' };

export interface StoryPresenterChannel {
  send(message: StoryPresenterMessage): void;
  close(): void;
}

export function loadStorySteps(): StoryStep[] {
  try {
    const raw = localStorage.getItem(STORY_STEPS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoryStep[]) : [];
  } catch {
    return [];
  }
}

export function openStoryPresenterChannel(
  onMessage: (message: StoryPresenterMessage) => void,
): StoryPresenterChannel {
  const channel = new BroadcastChannel(STORY_PRESENTER_CHANNEL_NAME);
  channel.onmessage = (event: MessageEvent) => onMessage(event.data as StoryPresenterMessage);
  let open = true;
  return {
    send(message) {
      // a send racing the other window's close would throw on a closed channel
      if (open) channel.postMessage(message);
    },
    close() {
      open = false;
      channel.close();
    },
  };
}

export function isStoryPresenterRequested(): boolean {
  return new URLSearchParams(location.search).has(PRESENTER_URL_PARAM);
}

export function openStoryPresenterWindow(): void {
  window.open(
    `${location.pathname}?${PRESENTER_URL_PARAM}=1`,
    PRESENTER_WINDOW_NAME,
    PRESENTER_WINDOW_FEATURES,
  );
}
