import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

// the map and the panel dock are the point of the test only by their absence,
// so they stand in as markers rather than booting cesium and every panel
vi.mock('../../src/components/ViewerArea', () => ({
  ViewerArea: () => <div data-testid="viewer-area" />,
}));
vi.mock('../../src/components/ToolPanels', () => ({
  ToolPanels: () => <div data-testid="tool-panels" />,
}));
vi.mock('../../src/features/spacetime/SpaceTimePanel', () => ({
  SpaceTimePanel: () => <div data-testid="spacetime-panel" />,
}));
vi.mock('../../src/overlay/OverlayCornerHandles', () => ({
  OverlayCornerHandles: () => <div data-testid="overlay-handles" />,
}));
vi.mock('../../src/onboarding/FirstRunOverlay', () => ({
  FirstRunOverlay: () => <div data-testid="first-run" />,
}));
vi.mock('../../src/components/TourOverlay', () => ({
  TourOverlay: () => <div data-testid="tour" />,
}));
vi.mock('../../src/components/CommandPalette', () => ({ CommandPalette: () => null }));
vi.mock('../../src/components/WindowDropZone', () => ({ WindowDropZone: () => null }));
vi.mock('../../src/features/tilesets/TilesetOffer', () => ({ TilesetOffer: () => null }));
vi.mock('../../src/live/MapPresence', () => ({ MapPresence: () => null }));

// boot work the shell starts and this test has no use for
vi.mock(import('../../src/offline/sync'), async (importOriginal) => ({
  ...(await importOriginal()),
  initSync: vi.fn(),
}));
vi.mock('../../src/offline/appShellWorker', () => ({ registerAppShellWorker: vi.fn() }));
vi.mock('../../src/live/documentBridge', () => ({ startDocumentBridge: () => () => {} }));
vi.mock('../../src/live/joinFromLink', () => ({ useJoinLiveFromLink: vi.fn() }));
vi.mock('../../src/projects/joinFromLink', () => ({ useJoinProjectFromLink: vi.fn() }));
vi.mock('../../src/hooks/useBackendDiscovery', () => ({ useBackendDiscovery: vi.fn() }));
vi.mock('../../src/lib/embedMessaging', () => ({ useEmbedMessaging: vi.fn() }));
vi.mock('../../src/projects/api', () => ({
  createProject: vi.fn(),
  deleteProject: vi.fn(),
  listProjects: vi.fn(),
  listWorkspaceProjects: vi.fn(),
  updateProject: vi.fn(),
}));
vi.mock('../../src/offline/db', () => ({
  hasIndexedDb: () => false,
  projectMaps: { getAll: vi.fn(async () => []), get: vi.fn(), put: vi.fn(), remove: vi.fn() },
  pendingOps: { count: vi.fn(async () => 0), getAll: vi.fn(async () => []) },
}));

import { App } from '../../src/App';
import { CHAT_MODE_HELP, announceChatMode, isChatModeRequested } from '../../src/actions/chatMode';
import { useAppStore } from '../../src/store/app';
import { useChatStore } from '../../src/store/chat';
import { executeViewerCommand } from '../../src/viewer/commands';

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
// jsdom has no scrolling, and the chat scrolls itself to the newest message
Element.prototype.scrollTo = vi.fn();

/** Mantine collapses the header by transforming it out of the page. */
const headerCollapsed = (): boolean =>
  [...document.querySelectorAll('style')].some((tag) =>
    tag.textContent?.includes('--app-shell-header-transform'),
  );

const messages = (): string[] =>
  useChatStore
    .getState()
    .activeMessages()
    .map((message) => message.content);

beforeEach(() => {
  history.replaceState(null, '', '/');
  useAppStore.setState({ chatMode: false, activePanel: null, navOpened: false });
  useChatStore.setState({ sessions: [], activeSessionId: null });
});

afterEach(() => {
  cleanup();
  // unmounting is not leaving the mode, so the help text is armed again by hand
  announceChatMode(false);
  useAppStore.getState().setChatMode(false);
  history.replaceState(null, '', '/');
});

describe('the chat-only mode url', () => {
  it('is requested only by mode=chat', () => {
    expect(isChatModeRequested()).toBe(false);
    history.replaceState(null, '', '/?mode=embedded');
    expect(isChatModeRequested()).toBe(false);
    history.replaceState(null, '', '/?mode=chat');
    expect(isChatModeRequested()).toBe(true);
  });

  it('starts a fresh app store in the mode', async () => {
    history.replaceState(null, '', '/?mode=chat');
    vi.resetModules();

    const fresh = await import('../../src/store/app');

    expect(fresh.useAppStore.getState().chatMode).toBe(true);
  });

  it('keeps the mode in the url, so a reload comes back to it', () => {
    history.replaceState(null, '', '/?live=token');

    useAppStore.getState().setChatMode(true);
    expect(location.search).toBe('?live=token&mode=chat');

    useAppStore.getState().setChatMode(false);
    expect(location.search).toBe('?live=token');
  });
});

describe('the chat-only shell', () => {
  const enterByUrl = () => {
    history.replaceState(null, '', '/?mode=chat');
    useAppStore.setState({ chatMode: true });
    render(<App />);
  };

  it('drops the header and the panels, leaving the chat', () => {
    enterByUrl();

    expect(headerCollapsed()).toBe(true);
    expect(screen.queryByTestId('tool-panels')).not.toBeInTheDocument();
    expect(screen.queryByTestId('spacetime-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('overlay-handles')).not.toBeInTheDocument();
    expect(screen.queryByTestId('first-run')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tour')).not.toBeInTheDocument();
    expect(screen.getByTestId('viewer-area')).toBeInTheDocument();
    const box = screen.getByPlaceholderText('Type a message…');
    expect(box).toBeVisible();
    expect(box).toHaveAttribute('autocomplete', 'off');
    expect(box).not.toHaveAttribute('name');
    expect(box.tagName).toBe('TEXTAREA');
  });

  it('arrow-up fills older prompts from this session', () => {
    useChatStore.getState().createSession('Session 1');
    useChatStore.getState().addMessage({ role: 'user', content: 'fly to paris' });
    useChatStore.getState().addMessage({ role: 'assistant', content: 'flying' });
    useChatStore.getState().addMessage({ role: 'user', content: 'zoom in' });
    enterByUrl();

    const box = screen.getByPlaceholderText('Type a message…');
    fireEvent.keyDown(box, { key: 'ArrowUp' });
    expect(box).toHaveValue('zoom in');
    fireEvent.keyDown(box, { key: 'ArrowUp' });
    expect(box).toHaveValue('fly to paris');
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    expect(box).toHaveValue('zoom in');
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    expect(box).toHaveValue('');
  });

  it('says what the mode is and what it cannot do, once', () => {
    enterByUrl();

    expect(messages()).toEqual([CHAT_MODE_HELP]);
    expect(CHAT_MODE_HELP).toContain('drawing and annotation placement');
  });

  it('leaves the mode from the button over the map', () => {
    enterByUrl();

    fireEvent.click(screen.getByLabelText('Exit chat mode'));

    expect(useAppStore.getState().chatMode).toBe(false);
    expect(location.search).toBe('');
    expect(headerCollapsed()).toBe(false);
    expect(screen.getByTestId('tool-panels')).toBeInTheDocument();
  });

  it('enters the mode from the header', () => {
    render(<App />);
    expect(screen.getByTestId('tool-panels')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Chat-only mode'));

    expect(useAppStore.getState().chatMode).toBe(true);
    expect(location.search).toBe('?mode=chat');
    expect(screen.queryByTestId('tool-panels')).not.toBeInTheDocument();
    expect(messages()).toEqual([CHAT_MODE_HELP]);
  });
});

describe('panel commands in chat mode', () => {
  it('say what they would have opened, and open nothing', () => {
    useAppStore.setState({ chatMode: true });

    executeViewerCommand({ action: 'viewshed' });
    executeViewerCommand({ action: 'measure_area' });

    expect(useAppStore.getState().activePanel).toBeNull();
    expect(messages()).toEqual([
      'viewshed opens the viewshed panel, which chat mode does not show.',
      'measure_area opens the measure panel, which chat mode does not show.',
    ]);
  });

  it('open the panel as usual outside the mode', () => {
    executeViewerCommand({ action: 'viewshed' });

    expect(useAppStore.getState().activePanel).toBe('viewshed');
    expect(messages()).toEqual([]);
  });
});
