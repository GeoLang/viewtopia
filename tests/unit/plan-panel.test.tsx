import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import type { AgentSubscriber } from '@ag-ui/client';

// the subscriber pulls in the viewer renderers, which need cesium/deck.gl
vi.mock('../../src/viewer/commands', () => ({ executeViewerCommand: vi.fn() }));
vi.mock('../../src/viewer/uiSpec', () => ({ renderUISpec: vi.fn(() => Promise.resolve()) }));

import { PlanPanel } from '../../src/features/workflow/PlanPanel';
import type { WorkflowPlan } from '../../src/features/workflow/plan';
import { buildAgUiSubscriber } from '../../src/hooks/useSSE';
import { useChatStore } from '../../src/store/chat';
import { useAuthStore } from '../../src/features/auth/store';

window.matchMedia = vi.fn().mockReturnValue({
  matches: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
});
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// what geolang's plan_payload emits (src/agents/tools/_geodukt.py)
const PLAN: WorkflowPlan = {
  title: 'Depot catchment areas',
  project: 'depot-catchment',
  validated: true,
  steps: [
    {
      index: 1,
      kind: 'source',
      name: 'depots',
      operation: null,
      input: null,
      format: 'geojson',
      path: 'outputs/depots.geojson',
      params: {},
    },
    {
      index: 2,
      kind: 'transform',
      name: 'catchment',
      operation: 'buffer',
      input: 'depots',
      format: null,
      path: null,
      params: { distance: 500 },
    },
    {
      index: 3,
      kind: 'sink',
      name: 'out',
      operation: null,
      input: 'catchment',
      format: 'gpkg',
      path: 'outputs/depot_catchment.gpkg',
      params: {},
    },
  ],
  datasets: ['outputs/depots.geojson'],
  outputs: ['outputs/depot_catchment.gpkg'],
  formats: ['geojson', 'gpkg'],
  manifest:
    '[project]\nname = "depot-catchment"\n\n[[source]]\nname = "depots"\nformat = "geojson"\npath = "outputs/depots.geojson"\n',
};

const RUN_REPORT =
  'Workflow "depot-catchment" run 7f3c completed.\n  depots: 12 features\n  catchment: 12 features\n  wrote outputs/depot_catchment.gpkg (gpkg)';

/** A session holding one assistant reply, the message a plan attaches to. */
function seedSession(): string {
  const store = useChatStore.getState();
  store.createSession('Plans');
  store.addMessage({ role: 'assistant', content: 'Here is the plan.' });
  return useChatStore.getState().activeMessages()[0].id;
}

const renderPanel = (messageId: string, plan: WorkflowPlan = PLAN) =>
  render(
    <MantineProvider>
      <PlanPanel messageId={messageId} plan={plan} />
    </MantineProvider>,
  );

describe('plan event', () => {
  beforeEach(() => {
    useChatStore.setState({ sessions: [], activeSessionId: null });
  });

  it('lands on the streaming assistant message', () => {
    seedSession();
    const { setLastContent, setLastError, setLastMapSpec, addLastViewerCmd, setLastPlan } =
      useChatStore.getState();
    const sub: AgentSubscriber = buildAgUiSubscriber({
      setLastContent,
      setLastError,
      setLastMapSpec,
      addLastViewerCmd,
      setLastPlan,
    });

    sub.onCustomEvent!({
      messages: [],
      state: {},
      agent: {},
      input: {},
      event: { type: 'CUSTOM', name: 'plan', value: PLAN },
    } as unknown as Parameters<NonNullable<AgentSubscriber['onCustomEvent']>>[0]);

    const last = useChatStore.getState().activeMessages().at(-1);
    expect(last?.plan?.title).toBe('Depot catchment areas');
    expect(last?.plan?.steps).toHaveLength(3);
    expect(last?.planRun).toBeUndefined();
  });
});

describe('PlanPanel', () => {
  let messageId: string;

  beforeEach(() => {
    vi.restoreAllMocks();
    useChatStore.setState({ sessions: [], activeSessionId: null });
    messageId = seedSession();
  });

  afterEach(cleanup);

  it('renders the title, ordered steps, datasets and formats', () => {
    renderPanel(messageId);

    expect(screen.getByText('Depot catchment areas')).toBeInTheDocument();
    const steps = screen.getAllByTestId('plan-step');
    expect(steps).toHaveLength(3);
    expect(steps[0]).toHaveTextContent('1. source');
    expect(steps[0]).toHaveTextContent('read depots from outputs/depots.geojson (geojson)');
    expect(steps[1]).toHaveTextContent('buffer depots → catchment (distance=500)');
    expect(steps[2]).toHaveTextContent('write catchment to outputs/depot_catchment.gpkg (gpkg)');
    expect(screen.getByText('Reads: outputs/depots.geojson')).toBeInTheDocument();
    expect(screen.getByText('Writes: outputs/depot_catchment.gpkg')).toBeInTheDocument();
    expect(screen.getByText('Formats: geojson, gpkg')).toBeInTheDocument();
    expect(screen.getByTestId('plan-status')).toHaveTextContent('not run yet');
    expect(screen.getByTestId('plan-validated')).toHaveTextContent('validated');
  });

  it('flags a plan geodukt could not check', () => {
    renderPanel(messageId, { ...PLAN, validated: false });

    const badge = screen.getByTestId('plan-validated');
    expect(badge).toHaveTextContent('not validated');
    expect(badge).toHaveAttribute('data-variant', 'filled');
    expect(
      screen.getByText('geodukt did not check this plan, only its TOML was parsed.'),
    ).toBeInTheDocument();
  });

  it('shows the raw manifest once the collapsed view is opened', () => {
    renderPanel(messageId);

    fireEvent.click(screen.getByTestId('plan-manifest-toggle'));
    expect(screen.getByTestId('plan-manifest')).toHaveTextContent('name = "depot-catchment"');
    expect(screen.getByTestId('plan-manifest-toggle')).toHaveTextContent('Hide manifest');
  });

  it('approving posts the manifest verbatim with notify and renders the run report', async () => {
    // the approved run happens outside the model's turn, so it carries the
    // user's own bearer rather than riding on the chat run's
    useAuthStore.setState({ loggedIn: true, token: 'jwt-abc', user: null });
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ result: RUN_REPORT }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    renderPanel(messageId);
    fireEvent.click(screen.getByTestId('plan-approve'));

    await waitFor(() => expect(screen.getByTestId('plan-run-result')).toBeInTheDocument());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/agent/tools/run_workflow');
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer jwt-abc');
    // notify is a sibling of args: it puts the report in the model's session
    expect(JSON.parse(String(init.body))).toEqual({
      args: { manifest_toml: PLAN.manifest },
      notify: true,
    });

    expect(screen.getByTestId('plan-run-result')).toHaveTextContent('wrote outputs/depot_catchment.gpkg');
    expect(screen.getByTestId('plan-status')).toHaveTextContent('ran');
    expect(screen.queryByTestId('plan-approve')).not.toBeInTheDocument();

    // the run is on the message and in the transcript, not only in the panel
    expect(useChatStore.getState().activeMessages()[0].planRun).toBe(RUN_REPORT);
    const note = useChatStore.getState().activeMessages().at(-1);
    expect(note?.role).toBe('system');
    expect(note?.content).toContain('Ran approved plan "Depot catchment areas"');
    expect(note?.content).toContain('run 7f3c completed');
  });

  it('marks a failed run without hiding the report', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ result: 'ERROR: geodukt is unreachable' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
      ),
    );

    renderPanel(messageId);
    fireEvent.click(screen.getByTestId('plan-approve'));

    await waitFor(() => expect(screen.getByTestId('plan-status')).toHaveTextContent('run failed'));
    expect(screen.getByTestId('plan-run-result')).toHaveTextContent('geodukt is unreachable');
  });

  it('dismiss collapses the plan and leaves it re-openable', () => {
    renderPanel(messageId);

    fireEvent.click(screen.getByTestId('plan-dismiss'));
    expect(screen.queryByTestId('plan-panel')).not.toBeInTheDocument();
    expect(screen.getByTestId('plan-panel-dismissed')).toHaveTextContent(
      'Plan dismissed: Depot catchment areas',
    );

    fireEvent.click(screen.getByText('Show'));
    expect(screen.getAllByTestId('plan-step')).toHaveLength(3);
  });
});
