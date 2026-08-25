import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { BACKENDS } from '../../src/offline/backends';
import { useBackendDiscovery } from '../../src/hooks/useBackendDiscovery';
import { useAppStore } from '../../src/store/app';

/** Answer each health path from this table, or reject when it holds no entry. */
let health: Record<string, number>;

function probeAnswer(input: RequestInfo | URL): Promise<Response> {
  const path = String(input);
  const status = health[path];
  if (status === undefined) return Promise.reject(new TypeError('Failed to fetch'));
  return Promise.resolve(new Response('', { status }));
}

describe('backend discovery', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    health = {
      [BACKENDS.ptolemy.healthPath]: 200,
      [BACKENDS.tiletopia.healthPath]: 200,
      [BACKENDS.agora.healthPath]: 200,
      [BACKENDS.geolang.healthPath]: 200,
    };
    fetchMock = vi.fn(probeAnswer);
    vi.stubGlobal('fetch', fetchMock);
    useAppStore.setState({
      backendStatus: {
        ptolemy: 'unknown',
        tiletopia: 'unknown',
        agora: 'unknown',
        geolang: 'unknown',
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts with every service unprobed', () => {
    expect(useAppStore.getState().backendStatus).toEqual({
      ptolemy: 'unknown',
      tiletopia: 'unknown',
      agora: 'unknown',
      geolang: 'unknown',
    });
  });

  it('writes a status for all four services', async () => {
    renderHook(() => useBackendDiscovery());
    await waitFor(() => {
      expect(useAppStore.getState().backendStatus).toEqual({
        ptolemy: 'up',
        tiletopia: 'up',
        agora: 'up',
        geolang: 'up',
      });
    });
    const probed = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(probed.sort()).toEqual(
      Object.values(BACKENDS)
        .map((backend) => backend.healthPath)
        .sort(),
    );
  });

  it('marks a service down for a refusal and for no reply at all', async () => {
    health[BACKENDS.agora.healthPath] = 503;
    delete health[BACKENDS.geolang.healthPath];
    renderHook(() => useBackendDiscovery());
    await waitFor(() => {
      expect(useAppStore.getState().backendStatus).toEqual({
        ptolemy: 'up',
        tiletopia: 'up',
        agora: 'down',
        geolang: 'down',
      });
    });
  });

  it('gives every probe three seconds', async () => {
    renderHook(() => useBackendDiscovery());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    for (const call of fetchMock.mock.calls) {
      expect((call[1] as RequestInit).signal).toBeInstanceOf(AbortSignal);
    }
  });

  it('re-probes when the browser says the network came back', async () => {
    delete health[BACKENDS.tiletopia.healthPath];
    renderHook(() => useBackendDiscovery());
    await waitFor(() => {
      expect(useAppStore.getState().backendStatus.tiletopia).toBe('down');
    });

    health[BACKENDS.tiletopia.healthPath] = 200;
    window.dispatchEvent(new Event('online'));
    await waitFor(() => {
      expect(useAppStore.getState().backendStatus.tiletopia).toBe('up');
    });
  });

  it('stops probing once the viewer is gone', async () => {
    const { unmount } = renderHook(() => useBackendDiscovery());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    unmount();
    window.dispatchEvent(new Event('online'));
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
