import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { AgentSubscriber } from '@ag-ui/client';

// stub the renderer boundaries so the subscriber test asserts the dispatch
// without loading cesium/deck.gl or hitting a live viewer
vi.mock('../../src/viewer/commands', () => ({ executeViewerCommand: vi.fn() }));
vi.mock('../../src/viewer/uiSpec', () => ({ renderUISpec: vi.fn(() => Promise.resolve()) }));

import { buildAgUiSubscriber, useSSE } from '../../src/hooks/useSSE';
import { executeViewerCommand } from '../../src/viewer/commands';
import { renderUISpec } from '../../src/viewer/uiSpec';
import { useAppStore } from '../../src/store/app';
import { useChatStore } from '../../src/store/chat';

// synthetic AG-UI event params: only `event` matters to the mapping, the rest of
// AgentSubscriberParams is filler the SDK would supply at runtime.
type P<K extends keyof AgentSubscriber> = Parameters<NonNullable<AgentSubscriber[K]>>[0];
const ctx = { messages: [], state: {}, agent: {}, input: {} };

describe('AG-UI subscriber mapping', () => {
  let setLastContent: ReturnType<typeof vi.fn>;
  let setLastMapSpec: ReturnType<typeof vi.fn>;
  let addLastViewerCmd: ReturnType<typeof vi.fn>;
  let sub: AgentSubscriber;

  beforeEach(() => {
    vi.clearAllMocks();
    setLastContent = vi.fn();
    setLastMapSpec = vi.fn();
    addLastViewerCmd = vi.fn();
    sub = buildAgUiSubscriber({ setLastContent, setLastMapSpec, addLastViewerCmd });
  });

  it('appends text deltas via setLastContent', () => {
    sub.onTextMessageContentEvent!({
      ...ctx,
      event: { type: 'TEXT_MESSAGE_CONTENT', messageId: 'm1', delta: 'Hello ' },
      textMessageBuffer: 'Hello ',
    } as unknown as P<'onTextMessageContentEvent'>);
    sub.onTextMessageContentEvent!({
      ...ctx,
      event: { type: 'TEXT_MESSAGE_CONTENT', messageId: 'm1', delta: 'world' },
      textMessageBuffer: 'Hello world',
    } as unknown as P<'onTextMessageContentEvent'>);

    expect(setLastContent).toHaveBeenNthCalledWith(1, 'Hello ');
    expect(setLastContent).toHaveBeenNthCalledWith(2, 'Hello world');
  });

  it('shows a progress custom event only before any assistant text', () => {
    sub.onCustomEvent!({
      ...ctx,
      event: { type: 'CUSTOM', name: 'progress', value: { text: 'searching…' } },
    } as unknown as P<'onCustomEvent'>);
    expect(setLastContent).toHaveBeenCalledWith('searching…');

    // once text has streamed, later progress is ignored (same guard as legacy)
    setLastContent.mockClear();
    sub.onTextMessageContentEvent!({
      ...ctx,
      event: { type: 'TEXT_MESSAGE_CONTENT', messageId: 'm1', delta: 'answer' },
      textMessageBuffer: 'answer',
    } as unknown as P<'onTextMessageContentEvent'>);
    setLastContent.mockClear();
    sub.onCustomEvent!({
      ...ctx,
      event: { type: 'CUSTOM', name: 'progress', value: { text: 'still going' } },
    } as unknown as P<'onCustomEvent'>);
    expect(setLastContent).not.toHaveBeenCalled();
  });

  it('dispatches a viewer_cmd custom event and keeps it on the message for replay', () => {
    const cmd = { action: 'fly_to', params: { lat: 48.85, lng: 2.29, zoom: 14 } };
    sub.onCustomEvent!({
      ...ctx,
      event: { type: 'CUSTOM', name: 'viewer_cmd', value: cmd },
    } as unknown as P<'onCustomEvent'>);
    expect(executeViewerCommand).toHaveBeenCalledWith(cmd);
    expect(addLastViewerCmd).toHaveBeenCalledWith(cmd);
  });

  it('keeps and renders a ui_spec custom event', () => {
    const spec = {
      type: 'map',
      center: [2.29, 48.85] as [number, number],
      zoom: 15,
      layers: [{ name: 'Cafes', file: 'outputs/cafes.gpkg' }],
    };
    sub.onCustomEvent!({
      ...ctx,
      event: { type: 'CUSTOM', name: 'ui_spec', value: spec },
    } as unknown as P<'onCustomEvent'>);
    expect(setLastMapSpec).toHaveBeenCalledWith(spec);
    expect(renderUISpec).toHaveBeenCalledWith(spec);
  });

  it('routes a run error to setLastContent', () => {
    sub.onRunErrorEvent!({
      ...ctx,
      event: { type: 'RUN_ERROR', message: 'boom' },
    } as unknown as P<'onRunErrorEvent'>);
    expect(setLastContent).toHaveBeenCalledWith('boom');
  });
});

describe('AG-UI channel flag', () => {
  it('defaults to true (AG-UI is the default channel)', () => {
    expect(useAppStore.getState().settings.useAgUiChannel).toBe(true);
  });

  it('with the flag off, send() uses the legacy /agent/chat/stream request', async () => {
    useAppStore.getState().updateSettings({ useAgUiChannel: false });
    useChatStore.getState().createSession('AG-UI off');

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      // bail right after the request so we only assert the legacy call shape
      .mockResolvedValue({ ok: false, status: 500, statusText: 'err' } as Response);

    const { result } = renderHook(() => useSSE());
    await act(async () => {
      await result.current.send('hello');
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      '/agent/chat/stream',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ message: 'hello' }),
      }),
    );
    fetchSpy.mockRestore();
  });
});
