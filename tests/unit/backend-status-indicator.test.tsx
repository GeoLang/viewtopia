import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import type { BackendName } from '../../src/offline/backends';

// MantineProvider reads the color scheme through matchMedia, and the popover
// measures itself, both missing from jsdom
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

// the sync half of the indicator has its own tests: this one drives it as a
// value so the down list can be read beside a pending queue and a conflict
const sync = vi.hoisted(() => ({
  online: true,
  status: 'idle',
  pendingCount: 0,
  lastSyncAt: null as number | null,
  lastError: null as string | null,
  conflicts: [] as unknown[],
}));

vi.mock('../../src/offline/hooks', () => ({
  useOnlineStatus: () => sync.online,
  useSyncStatus: () => ({
    ...sync,
    triggerSync: vi.fn(),
    discard: vi.fn(),
    resolveConflicts: vi.fn(),
    dismissConflicts: vi.fn(),
  }),
}));

import { OfflineIndicator } from '../../src/offline/OfflineIndicator';
import { useAppStore } from '../../src/store/app';

function showDown(...names: BackendName[]) {
  useAppStore.setState({
    backendStatus: {
      ptolemy: names.includes('ptolemy') ? 'down' : 'up',
      tiletopia: names.includes('tiletopia') ? 'down' : 'up',
      agora: names.includes('agora') ? 'down' : 'up',
      geolang: names.includes('geolang') ? 'down' : 'up',
    },
  });
}

function renderIndicator() {
  render(
    <MantineProvider>
      <OfflineIndicator />
    </MantineProvider>,
  );
}

function openPopover() {
  fireEvent.click(screen.getByLabelText('Sync status'));
}

describe('the header names the services that are down', () => {
  beforeEach(() => {
    cleanup();
    sync.online = true;
    sync.status = 'idle';
    sync.pendingCount = 0;
    sync.conflicts = [];
    showDown();
  });

  it('says nothing extra while every service answers', async () => {
    renderIndicator();
    openPopover();
    expect(await screen.findByText('All changes synced')).toBeInTheDocument();
    expect(screen.queryByTestId('backend-status')).toBeNull();
  });

  it('says nothing extra before the first probe answers', async () => {
    useAppStore.setState({
      backendStatus: {
        ptolemy: 'unknown',
        tiletopia: 'unknown',
        agora: 'unknown',
        geolang: 'unknown',
      },
    });
    renderIndicator();
    openPopover();
    expect(await screen.findByText('All changes synced')).toBeInTheDocument();
    expect(screen.queryByTestId('backend-status')).toBeNull();
  });

  it('badges the one service that is down by name', async () => {
    showDown('tiletopia');
    renderIndicator();
    expect(screen.getByText('tiletopia (tiles) down')).toBeInTheDocument();
    openPopover();
    expect(await screen.findByTestId('backend-status')).toBeInTheDocument();
    const lines = screen.getAllByTestId('backend-down');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveTextContent('tiletopia (tiles) is unreachable');
  });

  it('counts them once more than one is down, and lists each in the popover', async () => {
    showDown('ptolemy', 'agora', 'geolang');
    renderIndicator();
    expect(screen.getByText('3 services down')).toBeInTheDocument();
    openPopover();
    await screen.findByTestId('backend-status');
    expect(screen.getAllByTestId('backend-down').map((line) => line.textContent)).toEqual([
      'ptolemy (data) is unreachable',
      'agora (live) is unreachable',
      'geolang (agent) is unreachable',
    ]);
  });

  it('turns the icon red, ahead of a conflict', () => {
    sync.conflicts = [{ featureId: 'f1' }];
    showDown('agora');
    renderIndicator();
    // Mantine writes the variant colour onto the action icon as a variable
    const icon = screen.getByLabelText('Sync status');
    expect(icon.getAttribute('style')).toContain('red');
    expect(screen.getByText('agora (live) down')).toBeInTheDocument();
  });

  it('leaves the sync side of the popover alone', async () => {
    sync.pendingCount = 2;
    showDown('ptolemy');
    renderIndicator();
    openPopover();
    expect(await screen.findByText('2 changes waiting to sync')).toBeInTheDocument();
    expect(screen.getByTestId('backend-status')).toBeInTheDocument();
  });
});
