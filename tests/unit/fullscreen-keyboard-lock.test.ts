import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFullscreenKeyboardLock } from '../../src/hooks/useFullscreenKeyboardLock';

function installKeyboard() {
  const keyboard = {
    lock: vi.fn().mockResolvedValue(undefined),
    unlock: vi.fn(),
  };
  Object.defineProperty(navigator, 'keyboard', {
    value: keyboard,
    configurable: true,
  });
  return keyboard;
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'keyboard');
});

describe('useFullscreenKeyboardLock', () => {
  it('locks escape on entering fullscreen and unlocks on leaving', () => {
    const keyboard = installKeyboard();
    const { rerender } = renderHook(({ full }) => useFullscreenKeyboardLock(full), {
      initialProps: { full: false },
    });
    expect(keyboard.lock).not.toHaveBeenCalled();

    rerender({ full: true });
    expect(keyboard.lock).toHaveBeenCalledWith(['Escape']);
    expect(keyboard.unlock).not.toHaveBeenCalled();

    rerender({ full: false });
    expect(keyboard.unlock).toHaveBeenCalledTimes(1);
  });

  it('unlocks on unmount while fullscreen', () => {
    const keyboard = installKeyboard();
    const { unmount } = renderHook(() => useFullscreenKeyboardLock(true));
    expect(keyboard.lock).toHaveBeenCalledWith(['Escape']);
    unmount();
    expect(keyboard.unlock).toHaveBeenCalledTimes(1);
  });

  it('does nothing without the keyboard api', () => {
    expect(() => {
      const { unmount } = renderHook(() => useFullscreenKeyboardLock(true));
      unmount();
    }).not.toThrow();
  });
});
