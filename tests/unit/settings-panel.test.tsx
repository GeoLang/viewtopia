import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { SettingsPanel } from '../../src/components/tools/SettingsPanel';

window.matchMedia = vi.fn().mockReturnValue({
  matches: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
});
Element.prototype.scrollIntoView = vi.fn();
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const MODELS = {
  active: 'local:Qwen3.5-9B-Q4_K_M',
  profiles: [
    {
      id: 'cloud:grok-4-1-fast-reasoning',
      label: 'grok-4-1-fast-reasoning (cloud)',
      model: 'grok-4-1-fast-reasoning',
      server: 'cloud',
      provider: 'cloud',
      available: true,
      reachable: true,
    },
    {
      id: 'local:Qwen3.5-9B-Q4_K_M',
      label: 'Qwen3.5-9B-Q4_K_M (local)',
      model: 'Qwen3.5-9B-Q4_K_M',
      server: 'local',
      provider: 'local',
      available: true,
      reachable: true,
    },
  ],
  providers: [
    {
      id: 'local',
      label: 'local',
      server: 'local',
      base: 'http://127.0.0.1:18200/v1',
      models: ['Qwen3.5-9B-Q4_K_M'],
      has_key: false,
      reachable: true,
    },
    {
      id: 'cloud',
      label: 'cloud',
      server: 'cloud',
      base: 'https://api.x.ai/v1',
      models: ['grok-4-1-fast-reasoning'],
      has_key: true,
      reachable: true,
    },
  ],
};

function mockAgent({
  models = MODELS,
  putStatus = 204,
  providerStatus = 204,
  getOk = true,
} = {}) {
  const fetchMock = vi.fn((url: string) => {
    if (typeof url === 'string' && url.startsWith('/agent/model/providers')) {
      return Promise.resolve(new Response(null, { status: providerStatus }));
    }
    if (url === '/agent/model') {
      return Promise.resolve(new Response(null, { status: putStatus }));
    }
    if (!getOk) return Promise.reject(new Error('offline'));
    return Promise.resolve(
      new Response(JSON.stringify(models), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const renderPanel = () =>
  render(
    <MantineProvider>
      <SettingsPanel onClose={() => {}} />
    </MantineProvider>,
  );

describe('SettingsPanel AI model section', () => {
  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists every provider and preselects the active model', async () => {
    mockAgent();
    renderPanel();

    await waitFor(() => expect(screen.getByTestId('ai-provider-local')).toBeInTheDocument());
    expect(screen.getByTestId('ai-provider-cloud')).toBeInTheDocument();
    expect(screen.getByLabelText('Qwen3.5-9B-Q4_K_M')).toBeChecked();
    expect(screen.getByLabelText('grok-4-1-fast-reasoning')).not.toBeChecked();
    expect(screen.getByText(/several cloud APIs and local servers/i)).toBeInTheDocument();
  });

  it('puts the chosen profile id when a radio is picked', async () => {
    const fetchMock = mockAgent();
    renderPanel();

    await waitFor(() => expect(screen.getByLabelText('grok-4-1-fast-reasoning')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText('grok-4-1-fast-reasoning'));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url, init]) => url === '/agent/model' && init?.method === 'PUT'),
      ).toBe(true),
    );
    const put = fetchMock.mock.calls.find(([url, init]) => url === '/agent/model' && init?.method === 'PUT');
    expect(JSON.parse(put?.[1]?.body as string)).toEqual({
      id: 'cloud:grok-4-1-fast-reasoning',
    });
  });

  it('reverts the selection when the switch fails', async () => {
    mockAgent({ putStatus: 409 });
    renderPanel();

    await waitFor(() => expect(screen.getByLabelText('Qwen3.5-9B-Q4_K_M')).toBeChecked());
    fireEvent.click(screen.getByLabelText('grok-4-1-fast-reasoning'));

    await waitFor(() => expect(screen.getByTestId('ai-model-error')).toBeInTheDocument());
    expect(screen.getByTestId('ai-model-error')).toHaveTextContent(/cannot be reached/i);
    expect(screen.getByLabelText('Qwen3.5-9B-Q4_K_M')).toBeChecked();
  });

  it('degrades to an inert control when the models fetch fails', async () => {
    mockAgent({ getOk: false });
    renderPanel();

    await waitFor(() => expect(screen.getByText('Unavailable')).toBeInTheDocument());
    expect(screen.queryByTestId('ai-provider-cloud')).not.toBeInTheDocument();
  });

  it('warns when a local provider is not reachable', async () => {
    mockAgent({
      models: {
        ...MODELS,
        providers: [
          { ...MODELS.providers[0], reachable: false },
          MODELS.providers[1],
        ],
        profiles: [
          MODELS.profiles[0],
          { ...MODELS.profiles[1], reachable: false },
        ],
      },
    });
    renderPanel();

    await waitFor(() => expect(screen.getByTestId('ai-local-warning')).toBeInTheDocument());
    expect(screen.getByLabelText('Qwen3.5-9B-Q4_K_M')).toBeDisabled();
  });

  it('saves a second cloud API without replacing the first', async () => {
    const fetchMock = mockAgent();
    renderPanel();

    await waitFor(() => expect(screen.getByTestId('ai-add-cloud')).toBeEnabled());
    fireEvent.click(screen.getByTestId('ai-add-cloud'));
    fireEvent.click(screen.getByTestId('ai-cloud-provider'));
    fireEvent.click(await screen.findByRole('option', { name: 'Anthropic (Claude)' }));
    fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'sk-ant-new' } });
    fireEvent.click(screen.getByTestId('ai-cloud-save'));

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => url === '/agent/model/providers')).toBe(true),
    );
    const save = fetchMock.mock.calls.find(([url, init]) => url === '/agent/model/providers' && init?.method === 'PUT');
    expect(JSON.parse(save?.[1]?.body as string)).toEqual({
      server: 'cloud',
      base: 'https://api.anthropic.com/v1',
      models: 'claude-sonnet-4-5',
      id: 'anthropic',
      label: 'Anthropic (Claude)',
      key: 'sk-ant-new',
    });
  });

  it('saves a second local server', async () => {
    const fetchMock = mockAgent();
    renderPanel();

    await waitFor(() => expect(screen.getByTestId('ai-add-local')).toBeEnabled());
    fireEvent.click(screen.getByTestId('ai-add-local'));
    fireEvent.change(screen.getByTestId('ai-provider-label'), { target: { value: 'Workshop' } });
    fireEvent.change(screen.getByTestId('ai-cloud-base'), {
      target: { value: 'http://127.0.0.1:18100/v1' },
    });
    fireEvent.change(screen.getByTestId('ai-cloud-models'), {
      target: { value: 'gpt-oss-20b, qwen3' },
    });
    fireEvent.click(screen.getByTestId('ai-cloud-save'));

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => url === '/agent/model/providers')).toBe(true),
    );
    const save = fetchMock.mock.calls.find(([url]) => url === '/agent/model/providers');
    expect(JSON.parse(save?.[1]?.body as string)).toEqual({
      server: 'local',
      base: 'http://127.0.0.1:18100/v1',
      models: 'gpt-oss-20b, qwen3',
      label: 'Workshop',
    });
  });
});
