import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { notifications } from '@mantine/notifications';
import { useFullscreen } from '../../src/hooks/useFullscreen';

vi.mock('@mantine/notifications', () => ({
  notifications: { show: vi.fn() },
}));

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

function installBrave() {
  Object.defineProperty(navigator, 'brave', {
    value: { isBrave: () => Promise.resolve(true) },
    configurable: true,
  });
}

function enterFullscreen() {
  Object.defineProperty(document, 'fullscreenElement', {
    value: document.documentElement,
    configurable: true,
  });
  act(() => {
    document.dispatchEvent(new Event('fullscreenchange'));
  });
}

function leaveFullscreen() {
  Object.defineProperty(document, 'fullscreenElement', {
    value: null,
    configurable: true,
  });
  act(() => {
    document.dispatchEvent(new Event('fullscreenchange'));
  });
}

beforeEach(() => {
  Object.defineProperty(document, 'fullscreenElement', {
    value: null,
    configurable: true,
  });
  localStorage.clear();
  vi.mocked(notifications.show).mockClear();
});

afterEach(() => {
  Reflect.deleteProperty(navigator, 'keyboard');
  Reflect.deleteProperty(navigator, 'brave');
  Reflect.deleteProperty(document, 'fullscreenElement');
  Reflect.deleteProperty(document.documentElement, 'requestFullscreen');
  Reflect.deleteProperty(document, 'exitFullscreen');
});

describe('useFullscreen', () => {
  it('requests fullscreen with the firefox keyboard lock option', () => {
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    document.documentElement.requestFullscreen = requestFullscreen;
    const { result } = renderHook(() => useFullscreen());

    act(() => result.current.toggle());
    expect(requestFullscreen).toHaveBeenCalledWith({ keyboardLock: 'browser' });
  });

  it('exits fullscreen when already fullscreen', () => {
    const exitFullscreen = vi.fn().mockResolvedValue(undefined);
    document.exitFullscreen = exitFullscreen;
    const { result } = renderHook(() => useFullscreen());
    enterFullscreen();
    expect(result.current.fullscreen).toBe(true);

    act(() => result.current.toggle());
    expect(exitFullscreen).toHaveBeenCalledTimes(1);
  });

  it('locks escape on entering fullscreen and unlocks on leaving', () => {
    const keyboard = installKeyboard();
    renderHook(() => useFullscreen());
    expect(keyboard.lock).not.toHaveBeenCalled();

    enterFullscreen();
    expect(keyboard.lock).toHaveBeenCalledWith(['Escape']);
    expect(keyboard.unlock).not.toHaveBeenCalled();

    leaveFullscreen();
    expect(keyboard.unlock).toHaveBeenCalledTimes(1);
  });

  it('unlocks on unmount while fullscreen', () => {
    const keyboard = installKeyboard();
    const { unmount } = renderHook(() => useFullscreen());
    enterFullscreen();
    expect(keyboard.lock).toHaveBeenCalledWith(['Escape']);

    unmount();
    expect(keyboard.unlock).toHaveBeenCalledTimes(1);
  });

  it('does nothing without the keyboard api', () => {
    expect(() => {
      const { unmount } = renderHook(() => useFullscreen());
      enterFullscreen();
      unmount();
    }).not.toThrow();
  });

  it('notices the missing keyboard api on brave', () => {
    installBrave();
    renderHook(() => useFullscreen());
    enterFullscreen();

    expect(notifications.show).toHaveBeenCalledTimes(1);
    expect(notifications.show).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('Brave Shields') }),
    );
    expect(localStorage.getItem('viewtopia-brave-keyboard-notice')).toBe('shown');
  });

  it('notices only once per browser', () => {
    installBrave();
    const { unmount } = renderHook(() => useFullscreen());
    enterFullscreen();
    leaveFullscreen();
    enterFullscreen();
    unmount();

    renderHook(() => useFullscreen());
    enterFullscreen();
    expect(notifications.show).toHaveBeenCalledTimes(1);
  });

  it('stays quiet on brave when the keyboard api is present', () => {
    installBrave();
    installKeyboard();
    renderHook(() => useFullscreen());
    enterFullscreen();

    expect(notifications.show).not.toHaveBeenCalled();
  });

  it('stays quiet without the keyboard api on other browsers', () => {
    renderHook(() => useFullscreen());
    enterFullscreen();

    expect(notifications.show).not.toHaveBeenCalled();
  });
});
