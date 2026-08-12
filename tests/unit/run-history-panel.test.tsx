/**
 * The run history panel against geodukt's `GET /runs` shape: externally tagged
 * status enums, a caller subject, and the manifest each run executed.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent, act, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';

const notify = vi.hoisted(() => vi.fn());
vi.mock('@mantine/notifications', () => ({ notifications: { show: notify } }));

import { RunHistoryPanel } from '../../src/features/runs/RunHistoryPanel';
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

const AUTH_KEY = 'viewtopia_auth';
const HOUR_SECONDS = 3600;

const base64url = (value: unknown) =>
  btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** a live session token, the only credential a 401 can end */
const SESSION_TOKEN = `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url({
  sub: 'ada',
  exp: Math.floor(Date.now() / 1000) + HOUR_SECONDS,
})}.signature`;

const FAILED_MANIFEST = '[project]\nname = "flood risk"\n';

const RUNS = [
  {
    id: 0,
    status: { Failed: 'Execution error: parcels.gpkg not found' },
    manifest_name: 'flood risk',
    manifest: FAILED_MANIFEST,
    steps: [
      { name: 'parcels', feature_count: 12, status: 'Completed' },
      { name: 'clip', feature_count: 0, status: { Failed: 'parcels.gpkg not found' } },
      { name: 'write', feature_count: 0, status: 'NotRun' },
    ],
    sub: 'ada',
  },
  {
    id: 1,
    status: 'Completed',
    manifest_name: 'bus stops',
    manifest: '[project]\nname = "bus stops"\n',
    steps: [{ name: 'stops', feature_count: 40, status: 'Completed' }],
    sub: 'grace',
  },
];

const fetchMock = vi.fn();

function answerWith(body: unknown, status = 200) {
  fetchMock.mockImplementation(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }));
}

async function renderPanel() {
  const utils = render(
    <MantineProvider>
      <RunHistoryPanel onClose={() => {}} />
    </MantineProvider>,
  );
  await act(async () => {});
  return utils;
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
  globalThis.fetch = fetchMock as never;
  localStorage.setItem(AUTH_KEY, JSON.stringify({ user: { email: 'a@b.c' }, token: SESSION_TOKEN }));
  useAuthStore.setState({ loggedIn: true, user: { email: 'a@b.c' }, token: SESSION_TOKEN, error: null });
  answerWith(RUNS);
});

afterEach(() => {
  cleanup();
});

describe('RunHistoryPanel', () => {
  it('asks geodukt through the proxy with the session bearer', async () => {
    await renderPanel();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/pipeline/runs');
    expect(new Headers(init.headers).get('Authorization')).toBe(`Bearer ${SESSION_TOKEN}`);
  });

  it('lists every run newest first, with its project, outcome and caller', async () => {
    await renderPanel();

    const rows = screen.getAllByTestId(/^run-\d+$/);
    expect(rows.map((row) => row.dataset.testid)).toEqual(['run-1', 'run-0']);

    const completed = screen.getByTestId('run-1');
    expect(completed).toHaveTextContent('bus stops');
    expect(completed).toHaveTextContent('completed');
    expect(completed).toHaveTextContent('ran by grace');
    expect(completed).toHaveTextContent('1 steps');

    const failed = screen.getByTestId('run-0');
    expect(failed).toHaveTextContent('flood risk');
    expect(failed).toHaveTextContent('ran by ada');
    expect(screen.getByTestId('run-0-message')).toHaveTextContent('parcels.gpkg not found');
  });

  it('shows the executed plan and each step outcome only once the run is opened', async () => {
    await renderPanel();

    expect(screen.queryByTestId('run-0-manifest')).toBeNull();

    const failed = screen.getByTestId('run-0');
    fireEvent.click(within(failed).getByRole('button', { name: 'Show plan' }));

    expect(screen.getByTestId('run-0-manifest')).toHaveTextContent('name = "flood risk"');
    const steps = within(failed).getAllByTestId('run-step');
    expect(steps).toHaveLength(3);
    expect(steps[0]).toHaveTextContent('12 features');
    expect(steps[1]).toHaveTextContent('failed');
    expect(steps[2]).toHaveTextContent('not run');
  });

  it('says nothing has run yet when geodukt has no records', async () => {
    answerWith([]);
    await renderPanel();

    expect(screen.getByTestId('run-history-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('run-history-error')).toBeNull();
    expect(screen.queryAllByTestId(/^run-\d+$/)).toHaveLength(0);
  });

  it('ends the session and asks the user to sign in when geodukt refuses the token', async () => {
    answerWith({ error: 'invalid or expired token' }, 401);
    await renderPanel();

    expect(screen.getByTestId('run-history-error')).toHaveTextContent('Sign in to read run history.');
    expect(screen.queryAllByTestId(/^run-\d+$/)).toHaveLength(0);
    expect(useAuthStore.getState().loggedIn).toBe(false);
    expect(localStorage.getItem(AUTH_KEY)).toBeNull();
  });
});
