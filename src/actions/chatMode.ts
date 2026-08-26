/**
 * Chat-only mode: the map fills the window, the chat is the only control, and
 * every capability that does not need the mouse is reachable by typing. The URL
 * carries the mode so a reload stays in it.
 */
import { postSystemNotice } from '../store/chat';

const MODE_PARAMETER = 'mode';
const CHAT_MODE = 'chat';

export function isChatModeRequested(): boolean {
  return new URLSearchParams(location.search).get(MODE_PARAMETER) === CHAT_MODE;
}

export function setChatModeInUrl(on: boolean): void {
  const url = new URL(location.href);
  if (on) url.searchParams.set(MODE_PARAMETER, CHAT_MODE);
  else url.searchParams.delete(MODE_PARAMETER);
  history.replaceState(null, '', url.toString());
}

export const CHAT_MODE_HELP =
  'Chat-only mode: the map fills the window and this chat is the only control. ' +
  'Ask for anything the viewer can do and it runs here. ' +
  'These still need the mouse, so leave the mode to use them: drawing and ' +
  'annotation placement, measuring with the cursor, picking a feature by click, ' +
  'vertex drag, image overlay corner drag, the swipe handle, the context menu.';

/** true once the help text has been posted, until the mode is left again. */
let helpPosted = false;

/** Post the help text once for each entry into the mode. */
export function announceChatMode(chatMode: boolean): void {
  if (!chatMode) {
    helpPosted = false;
    return;
  }
  if (helpPosted) return;
  helpPosted = true;
  postSystemNotice(CHAT_MODE_HELP);
}
