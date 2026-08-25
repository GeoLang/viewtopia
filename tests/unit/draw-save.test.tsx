import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { DrawPanel } from '../../src/components/tools/DrawPanel';
import { useDrawStore, type DrawnFeature } from '../../src/store/draw';
import { geojsonToWkbHex } from '../../src/lib/wkb';

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
Element.prototype.scrollIntoView = vi.fn();

const DATASET_ID = 'ds-1';
const BRANCH_ID = 'br-1';

const DRAWN: DrawnFeature[] = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    type: 'Polygon',
    coords: [[0, 0], [2, 0], [1, 2]],
    color: '#a78bfa',
    lineWidth: 2,
    properties: { name: 'new lot' },
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    type: 'Circle',
    coords: [[5, 5]],
    radius: 120,
    color: '#a78bfa',
    lineWidth: 2,
  },
];

interface Call {
  url: string;
  body: unknown;
}

function serve() {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? JSON.parse(init.body as string) : undefined });
      if (url.endsWith('/datasets')) {
        return { ok: true, json: async () => [{ id: DATASET_ID, name: 'parcels' }] } as Response;
      }
      if (url.endsWith(`/datasets/${DATASET_ID}/branches`)) {
        return { ok: true, json: async () => [{ id: BRANCH_ID, name: 'main' }] } as Response;
      }
      if (url.endsWith(`/branches/${BRANCH_ID}/commit`)) {
        return { ok: true, json: async () => ({}) } as Response;
      }
      throw new Error(`unexpected fetch ${url}`);
    }),
  );
  return calls;
}

function open() {
  return render(
    <MantineProvider>
      <DrawPanel onClose={() => {}} />
    </MantineProvider>,
  );
}

beforeEach(() => {
  useDrawStore.setState({ mode: null, features: [...DRAWN], pending: [] });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the draw panel commits drawn shapes to a branch', () => {
  it('sends one insert per shape and clears the saved shapes', async () => {
    const calls = serve();
    open();

    fireEvent.click(screen.getByTestId('draw-save-open'));
    fireEvent.click(await screen.findByPlaceholderText('Pick a dataset'));
    fireEvent.click(await screen.findByText('parcels'));
    await screen.findByDisplayValue('main');

    fireEvent.click(screen.getByTestId('draw-save-commit'));
    await screen.findByTestId('draw-save-notice');

    const commit = calls.find((c) => c.url.endsWith('/commit'));
    expect(commit).toBeTruthy();
    const body = commit!.body as {
      operations: Array<{
        type: string;
        feature_id: string;
        geometry_wkb_hex: string;
        properties: Record<string, unknown>;
      }>;
    };
    expect(body.operations).toHaveLength(2);
    expect(body.operations[0]).toEqual({
      type: 'insert',
      feature_id: DRAWN[0].id,
      geometry_wkb_hex: geojsonToWkbHex({
        type: 'Polygon',
        coordinates: [[[0, 0], [2, 0], [1, 2], [0, 0]]],
      }),
      properties: { name: 'new lot' },
    });
    // a circle is committed as its center point carrying the radius
    expect(body.operations[1].geometry_wkb_hex).toBe(
      geojsonToWkbHex({ type: 'Point', coordinates: [5, 5] }),
    );
    expect(body.operations[1].properties).toEqual({ _radius_m: '120' });

    expect(useDrawStore.getState().features).toHaveLength(0);
  });

  it('keeps the shapes when the commit is refused', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('/datasets')) {
          return { ok: true, json: async () => [{ id: DATASET_ID, name: 'parcels' }] } as Response;
        }
        if (url.endsWith(`/datasets/${DATASET_ID}/branches`)) {
          return { ok: true, json: async () => [{ id: BRANCH_ID, name: 'main' }] } as Response;
        }
        return { ok: false, status: 403, text: async () => 'Forbidden' } as unknown as Response;
      }),
    );
    open();

    fireEvent.click(screen.getByTestId('draw-save-open'));
    fireEvent.click(await screen.findByPlaceholderText('Pick a dataset'));
    fireEvent.click(await screen.findByText('parcels'));
    await screen.findByDisplayValue('main');

    fireEvent.click(screen.getByTestId('draw-save-commit'));
    await waitFor(() => expect(screen.getByText(/403/)).toBeInTheDocument());
    expect(useDrawStore.getState().features).toHaveLength(2);
  });
});
