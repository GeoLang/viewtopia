import { describe, it, expect, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup } from '@testing-library/react';
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
