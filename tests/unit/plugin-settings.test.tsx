import { describe, it, expect, beforeEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { PluginSettingsPanel } from '../../src/plugins/PluginSettings';

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

const LOGISTICS_SETTINGS_KEY = 'viewtopia-plugin-settings:logistics';

const storedLogistics = () => JSON.parse(localStorage.getItem(LOGISTICS_SETTINGS_KEY) ?? '{}');

describe('plugin settings form', () => {
  beforeEach(() => {
    localStorage.clear();
    render(
      <MantineProvider>
        <PluginSettingsPanel />
      </MantineProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Logistics/ }));
  });

  it('stores a number the user types', () => {
    fireEvent.change(screen.getByLabelText('Max Delivery Stops'), { target: { value: '7' } });

    expect(storedLogistics().maxStops).toBe(7);
  });

  it('drops a cleared number field instead of storing an empty string', () => {
    const field = screen.getByLabelText('Max Delivery Stops');
    fireEvent.change(field, { target: { value: '7' } });
    fireEvent.change(field, { target: { value: '' } });

    expect(storedLogistics()).not.toHaveProperty('maxStops');
  });
});
