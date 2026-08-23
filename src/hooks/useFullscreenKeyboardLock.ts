import { useEffect } from 'react';

interface NavigatorKeyboard {
  lock(keys?: string[]): Promise<void>;
  unlock(): void;
}

// keyboard lock is chromium-only, other browsers keep native escape behavior
function navigatorKeyboard(): NavigatorKeyboard | undefined {
  return (navigator as Navigator & { keyboard?: NavigatorKeyboard }).keyboard;
}

// while locked, escape reaches the page and closes popups, and the browser
// requires holding escape to exit fullscreen
export function useFullscreenKeyboardLock(fullscreen: boolean) {
  useEffect(() => {
    if (!fullscreen) return;
    const keyboard = navigatorKeyboard();
    if (!keyboard) return;
    keyboard.lock(['Escape']).catch((error: unknown) => {
      console.warn('keyboard lock unavailable, escape exits fullscreen', error);
    });
    return () => keyboard.unlock();
  }, [fullscreen]);
}
