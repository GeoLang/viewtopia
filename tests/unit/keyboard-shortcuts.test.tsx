import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';
import { useKeyboardShortcuts } from '../../src/hooks/useKeyboardShortcuts';

const press = (key: string, init: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent('keydown', { key, cancelable: true, ...init });
  Object.defineProperty(event, 'target', { value: document.body });
  window.dispatchEvent(event);
  return event;
};

describe('useKeyboardShortcuts', () => {
  afterEach(cleanup);

  it('fires a bare key and a chord independently', () => {
    const bare = vi.fn();
    const chord = vi.fn();
    renderHook(() => useKeyboardShortcuts({ r: bare, 'ctrl+b': chord }));

    press('r');
    expect(bare).toHaveBeenCalledTimes(1);

    press('b', { ctrlKey: true });
    expect(chord).toHaveBeenCalledTimes(1);
  });

  it('a chord never falls back to the bare key (ctrl+r must refresh)', () => {
    const bare = vi.fn();
    renderHook(() => useKeyboardShortcuts({ r: bare }));

    const plainChord = press('r', { ctrlKey: true });
    const shiftChord = press('R', { ctrlKey: true, shiftKey: true });

    expect(bare).not.toHaveBeenCalled();
    expect(plainChord.defaultPrevented).toBe(false);
    expect(shiftChord.defaultPrevented).toBe(false);
  });

  it('alt-modified keys never match bare entries', () => {
    const bare = vi.fn();
    renderHook(() => useKeyboardShortcuts({ d: bare }));

    const event = press('d', { altKey: true });
    expect(bare).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});
