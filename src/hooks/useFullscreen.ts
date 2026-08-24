import { useCallback, useEffect, useState } from 'react';
import { notifications } from '@mantine/notifications';

const BRAVE_KEYBOARD_NOTICE_KEY = 'viewtopia-brave-keyboard-notice';
const BRAVE_KEYBOARD_NOTICE_DURATION_MS = 15000;

interface NavigatorKeyboard {
  lock(keys?: string[]): Promise<void>;
  unlock(): void;
}

// firefox 151+ only, chromium ignores the unknown dictionary member
interface FullscreenOptionsWithKeyboardLock extends FullscreenOptions {
  keyboardLock?: 'browser';
}

// keyboard lock is chromium-only, other browsers keep native escape behavior
function navigatorKeyboard(): NavigatorKeyboard | undefined {
  return (navigator as Navigator & { keyboard?: NavigatorKeyboard }).keyboard;
}

function isBrave(): boolean {
  return Boolean((navigator as Navigator & { brave?: unknown }).brave);
}

// brave shields sets navigator.keyboard to null, and then brave itself swallows
// escape in fullscreen so no page code can see it
function showBraveKeyboardNotice() {
  if (localStorage.getItem(BRAVE_KEYBOARD_NOTICE_KEY)) return;
  localStorage.setItem(BRAVE_KEYBOARD_NOTICE_KEY, 'shown');
  notifications.show({
    title: 'Escape leaves full screen in Brave',
    message:
      'Brave blocks the keyboard API, so Escape exits full screen instead of closing panels. Allowing fingerprinting for this site in Brave Shields restores it.',
    color: 'yellow',
    // top-right would sit on the header buttons, full screen included
    position: 'bottom-right',
    autoClose: BRAVE_KEYBOARD_NOTICE_DURATION_MS,
  });
}

// while locked, escape reaches the page and closes popups, and the browser
// requires holding escape to exit fullscreen
export function useFullscreen() {
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const readFullscreenElement = () => setFullscreen(document.fullscreenElement !== null);
    readFullscreenElement();
    document.addEventListener('fullscreenchange', readFullscreenElement);
    return () => document.removeEventListener('fullscreenchange', readFullscreenElement);
  }, []);

  const toggle = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    const options: FullscreenOptionsWithKeyboardLock = { keyboardLock: 'browser' };
    void document.documentElement.requestFullscreen(options).catch((error: unknown) => {
      console.warn('fullscreen request rejected', error);
    });
  }, []);

  useEffect(() => {
    if (!fullscreen) return;
    const keyboard = navigatorKeyboard();
    if (!keyboard) {
      if (isBrave()) showBraveKeyboardNotice();
      return;
    }
    keyboard.lock(['Escape']).catch((error: unknown) => {
      console.warn('keyboard lock unavailable, escape exits fullscreen', error);
    });
    return () => keyboard.unlock();
  }, [fullscreen]);

  return { fullscreen, toggle };
}
