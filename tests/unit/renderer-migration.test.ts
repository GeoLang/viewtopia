import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

// the share-link hook flies the live Cesium viewer, which never exists here
vi.mock('../../src/viewer/registry', () => ({
  getActiveCesiumViewer: vi.fn(() => null),
}));
vi.mock('../../src/store/cameraViews', () => ({
  flyToCameraState: vi.fn(),
}));

const PERSIST_KEY = 'viewtopia-app';

/** Load a fresh app store over the given persisted blob. */
async function loadStore(persisted: unknown) {
  localStorage.setItem(
    PERSIST_KEY,
    JSON.stringify({ state: persisted, version: 0 }),
  );
  vi.resetModules();
  const { useAppStore } = await import('../../src/store/app');
  return useAppStore.getState();
}

describe('retired deck.gl renderer', () => {
  beforeEach(() => {
    localStorage.clear();
    window.location.hash = '';
  });

  it('falls back to maplibre for a persisted deckgl renderer', async () => {
    const state = await loadStore({
      renderer: 'deckgl',
      settings: { defaultRenderer: 'deckgl' },
    });
    expect(state.renderer).toBe('maplibre');
    expect(state.settings.defaultRenderer).toBe('maplibre');
  });

  it('keeps a persisted renderer that still exists', async () => {
    const state = await loadStore({ renderer: 'maplibre' });
    expect(state.renderer).toBe('maplibre');
  });

  it('keeps the default when the persisted renderer is unknown', async () => {
    const state = await loadStore({ renderer: 'nonsense' });
    expect(state.renderer).toBe('cesium');
  });

  it('falls back to maplibre for a deckgl share link', async () => {
    window.location.hash = '#cam=5,52,1000000,0,-30&renderer=deckgl';
    vi.resetModules();
    const { useAppStore } = await import('../../src/store/app');
    const { useShareLinkHash } = await import('../../src/hooks/useShareLinkHash');
    renderHook(() => useShareLinkHash());
    expect(useAppStore.getState().renderer).toBe('maplibre');
  });

  it('leaves the renderer alone when a share link names an unknown one', async () => {
    window.location.hash = '#cam=5,52,1000000,0,-30&renderer=nonsense';
    vi.resetModules();
    const { useAppStore } = await import('../../src/store/app');
    const { useShareLinkHash } = await import('../../src/hooks/useShareLinkHash');
    renderHook(() => useShareLinkHash());
    expect(useAppStore.getState().renderer).toBe('cesium');
  });
});
