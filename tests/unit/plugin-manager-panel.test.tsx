import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { createHash } from 'node:crypto';
import { installMemoryIndexedDb } from './stubs/memoryIndexedDb';
import { PluginManagerPanel } from '../../src/plugins/runtime/PluginManagerPanel';
import { useAppStore } from '../../src/store/app';

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

const REGISTRY = {
  plugins: [
    {
      id: 'demo-plugin',
      name: 'Demo Plugin',
      version: '1.0.0',
      author: 'Someone',
      url: 'https://plugins.example.com/demo.js',
      integrity: `sha256-${createHash('sha256').update('demo').digest('base64')}`,
    },
  ],
};

const renderPanel = () =>
  render(
    <MantineProvider>
      <PluginManagerPanel onClose={vi.fn()} />
    </MantineProvider>,
  );

let resetIndexedDb: () => void;

beforeEach(() => {
  resetIndexedDb = installMemoryIndexedDb();
  useAppStore.getState().updateSettings({ pluginRegistryUrl: '' });
  vi.stubEnv('VITE_PLUGIN_REGISTRY_URL', '');
});

afterEach(() => {
  resetIndexedDb();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('PluginManagerPanel', () => {
  it('says no registry is configured when neither the build nor the setting names one', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    renderPanel();

    expect(await screen.findByText(/No plugin registry is configured/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lists what the registry offers and installs nothing without a confirmation', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => REGISTRY }));
    vi.stubGlobal('fetch', fetchMock);
    useAppStore
      .getState()
      .updateSettings({ pluginRegistryUrl: 'https://plugins.example.com/registry.json' });

    renderPanel();

    expect(await screen.findByText(/Demo Plugin/)).toBeInTheDocument();
    expect(screen.getByText(/by Someone/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Install' }));

    // the first click only asks; nothing has been downloaded yet
    expect(await screen.findByText(/Install Demo Plugin v1.0.0/)).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe('https://plugins.example.com/registry.json');
  });

  it('reports a malformed registry instead of rendering plugins', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ plugins: 'nope' }) })),
    );
    useAppStore
      .getState()
      .updateSettings({ pluginRegistryUrl: 'https://plugins.example.com/registry.json' });

    renderPanel();

    expect(await screen.findByText(/Registry unusable/)).toBeInTheDocument();
  });
});
