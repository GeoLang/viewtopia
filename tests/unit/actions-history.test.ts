import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../src/actions/history';
import { runAction } from '../../src/actions/registry';
import { useAssetStateStore } from '../../src/live/assetState';
import { useLiveStore } from '../../src/live/liveStore';
import { emptyLiveDocument } from '../../src/live/types';

const AT = '2026-08-25T10:00:00Z';

function snapshot() {
  return {
    assets: [
      {
        asset: 'TWIN-03',
        feed: 'pumps',
        online: true,
        values: [{ kind: 'temperature', value: 21, at: AT }],
      },
    ],
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

describe('history actions', () => {
  beforeEach(() => {
    fetchMock = vi.fn(async () => jsonResponse(snapshot()));
    vi.stubGlobal('fetch', fetchMock);
    useLiveStore.setState({ documentId: 'doc-1', role: 'edit', document: emptyLiveDocument() });
    useAssetStateStore.getState().clear();
  });

  afterEach(() => {
    useLiveStore.setState({ documentId: null });
    vi.unstubAllGlobals();
  });

  it('shows every asset as it stood at the moment asked for', async () => {
    const result = await runAction('history.show_at', { at: AT });

    expect(fetchMock.mock.calls[0][0]).toBe(
      `/agora/documents/doc-1/assets/at?t=${encodeURIComponent('2026-08-25T10:00:00.000Z')}`,
    );
    expect(useAssetStateStore.getState().historyAt).toBe('2026-08-25T10:00:00.000Z');
    expect(useAssetStateStore.getState().history?.['TWIN-03'].values.temperature.value).toBe(21);
    expect(result.text).toContain('1 assets');
  });

  it('goes back to the live readings', async () => {
    await runAction('history.show_at', { at: AT });
    const result = await runAction('history.show_live', {});

    expect(useAssetStateStore.getState().historyAt).toBeNull();
    expect(result.text).toBe('The map follows the live readings again.');
  });

  it('refuses a moment that is not a date', async () => {
    await expect(runAction('history.show_at', { at: 'this morning' })).rejects.toThrow(
      'at is not a date',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses to read history with no live map joined', async () => {
    useLiveStore.setState({ documentId: null });
    await expect(runAction('history.show_at', { at: AT })).rejects.toThrow(
      'not joined to a live map',
    );
  });
});
