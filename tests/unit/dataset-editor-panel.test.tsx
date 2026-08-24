import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';

// the sync engine's own transport is covered by offline-feature-sync.test.ts;
// here the queue call is the seam, so the panel's edit path stays real
const sync = vi.hoisted(() => ({
  queueFeatureUpdate: vi.fn(),
  syncNow: vi.fn(),
  emit: null as null | ((s: unknown) => void),
}));
vi.mock('../../src/offline/sync', () => ({
  queueFeatureUpdate: sync.queueFeatureUpdate,
  syncNow: sync.syncNow,
  getSyncState: () => ({ conflicts: [] }),
  onSyncStateChange: (fn: (s: unknown) => void) => {
    sync.emit = fn;
    fn({ status: 'idle', pendingCount: 0, lastSyncAt: null, lastError: null, conflicts: [] });
    return () => {};
  },
}));

import { act } from '@testing-library/react';
import { DatasetEditorPanel } from '../../src/components/tools/DatasetEditorPanel';
import { rowsToTypedProperties } from '../../src/components/tools/PropertyRows';
import { useDrawStore } from '../../src/store/draw';

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
const FEATURE_ID = 'ft-1';
const POINT_HEX = '0101000000000000000000f03f0000000000000040';

const committed = { name: 'lot 5', acres: 12.5 };

function serve() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.endsWith('/datasets')) {
        return { ok: true, json: async () => [{ id: DATASET_ID, name: 'parcels' }] } as Response;
      }
      if (url.endsWith(`/datasets/${DATASET_ID}/branches`)) {
        return { ok: true, json: async () => [{ id: BRANCH_ID, name: 'main' }] } as Response;
      }
      if (url.includes(`/branches/${BRANCH_ID}/features/${FEATURE_ID}`)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            feature_id: FEATURE_ID,
            geometry_wkb_hex: POINT_HEX,
            properties: committed,
          }),
        } as Response;
      }
      if (url.includes(`/branches/${BRANCH_ID}/features`)) {
        return {
          ok: true,
          json: async () => ({
            features: [
              {
                id: FEATURE_ID,
                geometry_wkb: [...Buffer.from(POINT_HEX, 'hex')],
                properties: { name: 'lot 4', acres: 12.5 },
              },
            ],
          }),
        } as Response;
      }
      throw new Error(`unexpected fetch ${url}`);
    }),
  );
}

function open() {
  return render(
    <MantineProvider>
      <DatasetEditorPanel onClose={() => {}} />
    </MantineProvider>,
  );
}

beforeEach(() => {
  sync.queueFeatureUpdate.mockClear();
  sync.syncNow.mockClear();
  useDrawStore.setState({ mode: null, features: [], pending: [] });
  serve();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the dataset editor edits a ptolemy branch', () => {
  it('loads a dataset, its default branch and that branch\'s features', async () => {
    open();
    fireEvent.click(await screen.findByPlaceholderText('Pick a dataset'));
    fireEvent.click(await screen.findByText('parcels'));

    expect(await screen.findByDisplayValue('main')).toBeInTheDocument();
    expect(await screen.findByText('lot 4')).toBeInTheDocument();
  });

  it('queues an edit against the branch the feature came from', async () => {
    open();
    fireEvent.click(await screen.findByPlaceholderText('Pick a dataset'));
    fireEvent.click(await screen.findByText('parcels'));
    fireEvent.click(await screen.findByText('lot 4'));

    const value = await screen.findByDisplayValue('lot 4');
    fireEvent.change(value, { target: { value: 'lot 5' } });

    await waitFor(() => expect(sync.queueFeatureUpdate).toHaveBeenCalled());
    const [branchId, ours, base] = sync.queueFeatureUpdate.mock.calls[0];
    expect(branchId).toBe(BRANCH_ID);
    expect(ours.id).toBe(FEATURE_ID);
    expect(ours.properties.name).toBe('lot 5');
    // the untouched number stays a number, it does not become "12.5"
    expect(ours.properties.acres).toBe(12.5);
    expect(ours.geometry).toEqual({ type: 'Point', coordinates: [1, 2] });
    // the merge's ancestor is what the branch held when the row was opened
    expect(base).toEqual({
      id: FEATURE_ID,
      properties: { name: 'lot 4', acres: 12.5 },
      geometry: { type: 'Point', coordinates: [1, 2] },
    });
  });

  it('takes the committed value as the ancestor for the next edit', async () => {
    open();
    fireEvent.click(await screen.findByPlaceholderText('Pick a dataset'));
    fireEvent.click(await screen.findByText('parcels'));
    fireEvent.click(await screen.findByText('lot 4'));

    fireEvent.change(await screen.findByTestId('property-value-name'), {
      target: { value: 'lot 5' },
    });
    await waitFor(() => expect(sync.queueFeatureUpdate).toHaveBeenCalled());

    // one pending edit makes the commit button live
    act(() => {
      sync.emit?.({ status: 'idle', pendingCount: 1, lastSyncAt: null, lastError: null, conflicts: [] });
    });
    fireEvent.click(screen.getByTestId('dataset-editor-commit'));
    await waitFor(() => expect(sync.syncNow).toHaveBeenCalled());

    sync.queueFeatureUpdate.mockClear();
    fireEvent.change(await screen.findByTestId('property-value-name'), {
      target: { value: 'lot 6' },
    });

    await waitFor(() => expect(sync.queueFeatureUpdate).toHaveBeenCalled());
    const [, , base] = sync.queueFeatureUpdate.mock.calls[0];
    // the branch's answer, not the value the row held before the commit
    expect(base.properties).toEqual({ name: 'lot 5', acres: 12.5 });
  });

  it('queues a redrawn geometry against the feature it started on', async () => {
    open();
    fireEvent.click(await screen.findByPlaceholderText('Pick a dataset'));
    fireEvent.click(await screen.findByText('parcels'));
    fireEvent.click(await screen.findByText('lot 4'));

    fireEvent.click(await screen.findByTestId('dataset-editor-redraw'));
    // a Point feature turns the Draw machinery to point mode
    expect(useDrawStore.getState().mode).toBe('point');

    // the map click the Draw machinery would deliver
    act(() => {
      useDrawStore.getState().addPendingPoint(9, 8);
      useDrawStore.getState().finishFeature();
    });

    await waitFor(() => expect(sync.queueFeatureUpdate).toHaveBeenCalled());
    const [branchId, ours, base] = sync.queueFeatureUpdate.mock.calls[0];
    expect(branchId).toBe(BRANCH_ID);
    expect(ours.id).toBe(FEATURE_ID);
    expect(ours.geometry).toEqual({ type: 'Point', coordinates: [9, 8] });
    expect(ours.properties).toEqual({ name: 'lot 4', acres: 12.5 });
    // the merge's ancestor keeps the geometry the branch held
    expect(base.geometry).toEqual({ type: 'Point', coordinates: [1, 2] });

    // the capture shape never stays a drawn feature and the mode is released
    expect(useDrawStore.getState().features).toHaveLength(0);
    expect(useDrawStore.getState().mode).toBeNull();
  });

  it('drops the capture when the selection changes mid-redraw', async () => {
    open();
    fireEvent.click(await screen.findByPlaceholderText('Pick a dataset'));
    fireEvent.click(await screen.findByText('parcels'));
    fireEvent.click(await screen.findByText('lot 4'));

    fireEvent.click(await screen.findByTestId('dataset-editor-redraw'));
    fireEvent.click(screen.getByText('lot 4'));
    expect(useDrawStore.getState().mode).toBeNull();

    act(() => {
      useDrawStore.getState().setMode('point');
      useDrawStore.getState().addPendingPoint(9, 8);
      useDrawStore.getState().finishFeature();
    });

    // the finished shape stays an ordinary drawn feature, nothing is queued
    await act(async () => {});
    expect(sync.queueFeatureUpdate).not.toHaveBeenCalled();
    expect(useDrawStore.getState().features).toHaveLength(1);
  });
});

describe('attributes keep the type they had', () => {
  it('reads an edited number back as a number and a new key as a string', () => {
    const typed = rowsToTypedProperties(
      [
        { key: 'acres', value: '13' },
        { key: 'zoning', value: 'R1' },
        { key: 'surveyed', value: 'false' },
        { key: 'note', value: '7' },
      ],
      { acres: 12.5, zoning: 'R2', surveyed: true },
    );
    expect(typed).toEqual({ acres: 13, zoning: 'R1', surveyed: false, note: '7' });
  });

  it('keeps text a number field can no longer hold as text', () => {
    expect(rowsToTypedProperties([{ key: 'acres', value: 'unknown' }], { acres: 12.5 })).toEqual({
      acres: 'unknown',
    });
  });
});
