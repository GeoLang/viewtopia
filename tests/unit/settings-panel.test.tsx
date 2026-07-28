import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { SettingsPanel } from '../../src/components/tools/SettingsPanel';

// MantineProvider reads the color scheme through matchMedia, and the Select
// dropdown scrolls and measures itself, all missing from jsdom
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
  active: 'local',
  profiles: [
    { id: 'cloud', label: 'Grok (cloud)', model: 'grok-4-1-fast-reasoning', available: true },
    {
      id: 'local',
      label: 'Local (Qwen3.5-9B-Q4_K_M)',
      model: 'Qwen3.5-9B-Q4_K_M',
      available: true,
    },
  ],
};

/** GET /agent/models answers `models`, PUT /agent/model answers `putStatus`. */
function mockAgent({ models = MODELS, putStatus = 204, getOk = true } = {}) {
  const fetchMock = vi.fn((url: string, _init?: RequestInit) => {
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

const modelSelect = () => screen.getByTestId('ai-model-select');

/** Open the model dropdown and hand back its options. */
async function openModels() {
  await waitFor(() => expect(modelSelect()).not.toBeDisabled());
  fireEvent.click(modelSelect());
  return screen.findAllByRole('option');
}

describe('SettingsPanel AI model section', () => {
  beforeEach(() => {
    // vitest globals are off, so testing-library's auto cleanup doesn't run
    cleanup();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists the profiles and preselects the active one', async () => {
    mockAgent();
    renderPanel();

    await waitFor(() => expect(modelSelect()).toHaveValue('Local (Qwen3.5-9B-Q4_K_M)'));
    const options = await openModels();
    expect(options.map((o) => o.textContent)).toEqual([
      'Grok (cloud)',
      'Local (Qwen3.5-9B-Q4_K_M)',
    ]);
    expect(screen.getByText(/applies to new messages only/i)).toBeInTheDocument();
  });

  it('disables an unavailable profile and refuses to switch to it', async () => {
    const fetchMock = mockAgent({
      models: {
        ...MODELS,
        profiles: [{ ...MODELS.profiles[0], available: false }, MODELS.profiles[1]],
      },
    });
    renderPanel();

    const [cloud, local] = await openModels();
    expect(cloud).toHaveTextContent('Grok (cloud) (unavailable)');
    expect(cloud).toHaveAttribute('data-combobox-disabled');
    expect(local).not.toHaveAttribute('data-combobox-disabled');

    fireEvent.click(cloud);
    expect(modelSelect()).toHaveValue('Local (Qwen3.5-9B-Q4_K_M)');
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);
  });

  it('puts the chosen profile id and keeps it once the switch lands', async () => {
    const fetchMock = mockAgent();
    renderPanel();

    const [cloud] = await openModels();
    fireEvent.click(cloud);

    await waitFor(() => expect(modelSelect()).toHaveValue('Grok (cloud)'));
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT');
    expect(put?.[0]).toBe('/agent/model');
    expect(JSON.parse(put?.[1]?.body as string)).toEqual({ id: 'cloud' });
    expect(screen.queryByTestId('ai-model-error')).not.toBeInTheDocument();
  });

  it('reverts the selection and reports the reason when the switch fails', async () => {
    mockAgent({ putStatus: 409 });
    renderPanel();

    const [cloud] = await openModels();
    fireEvent.click(cloud);

    await waitFor(() => expect(screen.getByTestId('ai-model-error')).toBeInTheDocument());
    expect(screen.getByTestId('ai-model-error')).toHaveTextContent(/cannot be reached/i);
    expect(modelSelect()).toHaveValue('Local (Qwen3.5-9B-Q4_K_M)');
  });

  it('degrades to an inert control when the models fetch fails', async () => {
    mockAgent({ getOk: false });
    renderPanel();

    await waitFor(() => expect(modelSelect()).toBeDisabled());
    expect(modelSelect()).toHaveAttribute('placeholder', 'Unavailable');
    expect(modelSelect()).toHaveValue('');
  });
});
