import { describe, it, expect, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { vi } from 'vitest';

import { ViewerToolbar } from '../../src/components/ViewerToolbar';
import { useLiveStore } from '../../src/live/liveStore';

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

const renderToolbar = () =>
  render(
    <MantineProvider>
      <ViewerToolbar />
    </MantineProvider>,
  );

describe('view-only toolbar chrome', () => {
  afterEach(() => {
    cleanup();
    useLiveStore.setState({ documentId: null, role: 'edit' });
  });

  it('shows the full toolbar outside a view-role session', () => {
    renderToolbar();
    expect(screen.getByRole('button', { name: 'Actions' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Data' })).toBeInTheDocument();
    expect(screen.getByLabelText('Settings')).toBeInTheDocument();
    expect(screen.queryByText('View only')).not.toBeInTheDocument();
  });

  it('collapses to view-safe controls in a view-role session', () => {
    useLiveStore.setState({ documentId: 'doc-1', role: 'view' });
    renderToolbar();
    expect(screen.getByText('View only')).toBeInTheDocument();
    expect(screen.getByLabelText('Measure')).toBeInTheDocument();
    expect(screen.getByLabelText('Layers')).toBeInTheDocument();
    expect(screen.getByLabelText('Legend')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Actions' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Data' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Settings')).not.toBeInTheDocument();
  });

  it('an edit-role session keeps the full toolbar', () => {
    useLiveStore.setState({ documentId: 'doc-1', role: 'edit' });
    renderToolbar();
    expect(screen.getByRole('button', { name: 'Actions' })).toBeInTheDocument();
    expect(screen.queryByText('View only')).not.toBeInTheDocument();
  });
});

describe('compact toolbar (phone row)', () => {
  afterEach(() => {
    cleanup();
    useLiveStore.setState({ documentId: null, role: 'edit' });
  });

  const renderCompact = () =>
    render(
      <MantineProvider>
        <ViewerToolbar compact />
      </MantineProvider>,
    );

  it('folds the labeled menus into one All tools menu', async () => {
    renderCompact();
    expect(screen.queryByRole('button', { name: 'Actions' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Layers')).toBeInTheDocument();
    expect(screen.getByLabelText('Inspect')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('All tools'));
    expect(await screen.findByText('Export PNG')).toBeInTheDocument();
    expect(screen.getByText('Measure')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('keeps the view-safe icon row in a view-role session', () => {
    useLiveStore.setState({ documentId: 'doc-1', role: 'view' });
    renderCompact();
    expect(screen.getByText('View only')).toBeInTheDocument();
    expect(screen.getByLabelText('Measure')).toBeInTheDocument();
    expect(screen.getByLabelText('Legend')).toBeInTheDocument();
    expect(screen.queryByLabelText('All tools')).not.toBeInTheDocument();
  });
});
