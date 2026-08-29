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
import { useChatStore } from '../../src/store/chat';
import { useAuthStore } from '../../src/features/auth/store';

// synthetic AG-UI event params: only `event` matters to the mapping, the rest of
// AgentSubscriberParams is filler the SDK would supply at runtime.
type P<K extends keyof AgentSubscriber> = Parameters<NonNullable<AgentSubscriber[K]>>[0];
const ctx = { messages: [], state: {}, agent: {}, input: {} };

describe('AG-UI subscriber mapping', () => {
  let setLastContent: ReturnType<typeof vi.fn>;
  let setLastError: ReturnType<typeof vi.fn>;
  let setLastMapSpec: ReturnType<typeof vi.fn>;
  let addLastViewerCmd: ReturnType<typeof vi.fn>;
  let setLastPlan: ReturnType<typeof vi.fn>;
  let setLastPlanReport: ReturnType<typeof vi.fn>;
  let sub: AgentSubscriber;

  beforeEach(() => {
    vi.clearAllMocks();
    setLastContent = vi.fn();
    setLastError = vi.fn();
    setLastMapSpec = vi.fn();
    addLastViewerCmd = vi.fn();
    setLastPlan = vi.fn();
    setLastPlanReport = vi.fn();
    sub = buildAgUiSubscriber({
      setLastContent,
      setLastError,
      setLastMapSpec,
      addLastViewerCmd,
      setLastPlan,
      setLastPlanReport,
    });
  });

  it('routes a run error to setLastError, leaving streamed content alone', () => {
    sub.onRunErrorEvent!({
      ...ctx,
      event: { type: 'RUN_ERROR', message: 'upstream died' },
    } as unknown as P<'onRunErrorEvent'>);
    expect(setLastError).toHaveBeenCalledWith('upstream died');
    expect(setLastContent).not.toHaveBeenCalled();
  });

  it('rewrites a missing login as a sign-in prompt', () => {
    sub.onRunErrorEvent!({
      ...ctx,
      event: { type: 'RUN_ERROR', message: 'HTTP 401: {"detail":"missing bearer token"}' },
    } as unknown as P<'onRunErrorEvent'>);
    expect(setLastError).toHaveBeenCalledWith('Sign in to chat with the agent.');
  });

  it('rewrites a refused local model as a settings prompt', () => {
    sub.onRunErrorEvent!({
      ...ctx,
      event: {
        type: 'RUN_ERROR',
        message:
          'calling the model: error sending request for url (http://host.docker.internal:18200/v1/chat/completions): client error (Connect): tcp connect error: Connection refused (os error 111)',
      },
    } as unknown as P<'onRunErrorEvent'>);
    expect(setLastError).toHaveBeenCalledWith(
      "The local model isn't running. Start it, or pick a cloud model in Settings.",
    );
    expect(setLastContent).not.toHaveBeenCalled();
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

  it('keeps a plan custom event on the message and runs nothing', () => {
    const plan = {
      title: 'Depot catchment',
      project: 'depot-catchment',
      validated: true,
      steps: [
        {
          index: 1,
          kind: 'source',
          name: 'depots',
          format: 'geojson',
          path: 'outputs/depots.geojson',
          params: {},
        },
      ],
      datasets: ['outputs/depots.geojson'],
      outputs: [],
      formats: ['geojson'],
      manifest: '[project]\nname = "depot-catchment"\n',
    };
    sub.onCustomEvent!({
      ...ctx,
      event: { type: 'CUSTOM', name: 'plan', value: plan },
    } as unknown as P<'onCustomEvent'>);
    expect(setLastPlan).toHaveBeenCalledWith(plan);
    expect(renderUISpec).not.toHaveBeenCalled();
    expect(executeViewerCommand).not.toHaveBeenCalled();
  });

  it('routes a run custom event onto the plan it belongs to', () => {
    const report = {
      id: 7,
      title: 'depot-catchment',
      status: 'completed',
      message: '',
      steps: [{ name: 'depots', outcome: 'completed', feature_count: 12, message: '' }],
      outputs: [
        { name: 'out', path: 'outputs/depot_catchment.gpkg', format: 'gpkg', written: true },
      ],
    };
    sub.onCustomEvent!({
      ...ctx,
      event: { type: 'CUSTOM', name: 'run', value: report },
    } as unknown as P<'onCustomEvent'>);
    expect(setLastPlanReport).toHaveBeenCalledWith(report);
    // a run of its own is not a plan and renders nothing on the map
    expect(setLastPlan).not.toHaveBeenCalled();
    expect(renderUISpec).not.toHaveBeenCalled();
  });
});

describe('AG-UI channel', () => {
  it('send() posts to /agent/chat/agui (the only channel)', async () => {
    useChatStore.getState().createSession('AG-UI');

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      // bail right after the request so we only assert the call target
      .mockResolvedValue({ ok: false, status: 500, statusText: 'err' } as Response);

    const { result } = renderHook(() => useSSE());
    await act(async () => {
      await result.current.send('hello');
    });

    const urls = fetchSpy.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('/agent/chat/agui'))).toBe(true);
    expect(urls.some((u) => u.includes('/agent/chat/stream'))).toBe(false);
    fetchSpy.mockRestore();
  });

  // geolang builds the model's tool list from the catalogue and puts the
  // snapshot in the system turn, so a run without them leaves the model blind
  it('sends the viewer snapshot and the action catalogue as the run state', async () => {
    useChatStore.getState().createSession('AG-UI');
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: false, status: 500, statusText: 'err' } as Response);

    const { result } = renderHook(() => useSSE());
    await act(async () => {
      await result.current.send('hello');
    });

    const call = fetchSpy.mock.calls.find((c) => String(c[0]).includes('/agent/chat/agui'));
    fetchSpy.mockRestore();
    const { state } = JSON.parse(String(call?.[1]?.body));
    expect(state.viewer.mode).toBe('full');
    expect(state.viewer.layers).toEqual([]);
    expect(state.actions.map((action: { name: string }) => action.name)).toContain('basemap.set');
  });

  // the action already posted its result as a system message, so a second copy
  // as a user prompt would read as something the user typed
  it('sends a follow-up run without writing a prompt into the transcript', async () => {
    useChatStore.getState().createSession('AG-UI');
    useChatStore.setState({ followUpCount: 0 });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: false, status: 500, statusText: 'err' } as Response);

    const { result } = renderHook(() => useSSE());
    await act(async () => {
      await result.current.send('Result of layers.list: 2 layers.', { followUp: true });
    });
    fetchSpy.mockRestore();

    const roles = useChatStore
      .getState()
      .activeMessages()
      .map((message) => message.role);
    expect(roles).toEqual(['assistant']);
    expect(useChatStore.getState().followUpCount).toBe(1);
  });

  /** Headers the run request went out with, or undefined if it never went out. */
  async function runHeaders(): Promise<Record<string, string> | undefined> {
    useChatStore.getState().createSession('AG-UI');
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: false, status: 500, statusText: 'err' } as Response);

    const { result } = renderHook(() => useSSE());
    await act(async () => {
      await result.current.send('hello');
    });

    const call = fetchSpy.mock.calls.find((c) => String(c[0]).includes('/agent/chat/agui'));
    fetchSpy.mockRestore();
    return call?.[1]?.headers as Record<string, string> | undefined;
  }

  // the run carries the user's identity to every tool call downstream, so a
  // signed-in user's writes to ptolemy and geodukt are theirs, not anonymous
  it('sends the signed-in bearer with the run', async () => {
    useAuthStore.setState({ loggedIn: true, token: 'jwt-abc', user: null });
    expect((await runHeaders())?.Authorization).toBe('Bearer jwt-abc');
  });

  it('sends no Authorization when nobody is signed in', async () => {
    useAuthStore.setState({ loggedIn: false, token: null, user: null });
    const headers = await runHeaders();
    expect(headers).toBeDefined();
    expect(headers?.Authorization).toBeUndefined();
  });
});
