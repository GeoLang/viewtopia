import { useEffect, useCallback } from 'react';

interface ShortcutMap {
  [key: string]: () => void;
}

/**
 * Global keyboard shortcut hook.
 * Keys can be plain letters ("t") or modifier combos ("ctrl+b").
 */
export function useKeyboardShortcuts(shortcuts: ShortcutMap) {
  const handler = useCallback(
    (e: KeyboardEvent) => {
      // Don't trigger where the key already means something to what has focus:
      // typing in a field, or Enter and Space pressing the focused button
      const target = e.target as HTMLElement;
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (target.isContentEditable) return;
      if ((tag === 'BUTTON' || tag === 'A') && (e.key === 'Enter' || e.key === ' ')) return;

      const key = e.key.toLowerCase();
      // a modifier chord only matches a chord entry: falling back to the
      // bare key would shadow browser shortcuts like ctrl+r
      const fn =
        e.ctrlKey || e.metaKey
          ? shortcuts[`ctrl+${key}`]
          : e.altKey
            ? undefined
            : shortcuts[key];
      if (fn) {
        e.preventDefault();
        fn();
      }
    },
    [shortcuts],
  );

  useEffect(() => {
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handler]);
}
