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
      // Don't trigger in inputs
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const key = e.key.toLowerCase();
      const combo = `${e.ctrlKey || e.metaKey ? 'ctrl+' : ''}${key}`;

      // Try combo first, then plain key
      const fn = shortcuts[combo] ?? shortcuts[key];
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
