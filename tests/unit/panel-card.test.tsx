import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { IconRuler } from '@tabler/icons-react';
import { PanelCard, PanelHeader } from '../../src/components/PanelCard';
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

const BODY = 'panel body content';
const OTHER_BODY = 'other panel body';

// the collapse itself is a stylesheet rule, so the assertions below only mean
// something with the app's own css loaded
function loadGlobalCss() {
  const style = document.createElement('style');
  style.textContent = readFileSync(resolve(process.cwd(), 'src/global.css'), 'utf8');
  document.head.append(style);
  return () => style.remove();
}

const renderPanel = () =>
  render(
    <MantineProvider>
      <PanelCard width={280} anchor="left" testId="test-panel">
        <PanelHeader icon={<IconRuler size={16} />} title="Measure" onClose={vi.fn()} />
        <div>{BODY}</div>
      </PanelCard>
    </MantineProvider>,
  );

const renderTwoPanels = () =>
  render(
    <MantineProvider>
      <PanelCard width={280} anchor="left" testId="test-panel">
        <PanelHeader icon={<IconRuler size={16} />} title="Measure" onClose={vi.fn()} />
        <div>{BODY}</div>
      </PanelCard>
      <PanelCard width={280} anchor="left" testId="other-panel">
        <PanelHeader icon={<IconRuler size={16} />} title="Space-Time" onClose={vi.fn()} />
        <div>{OTHER_BODY}</div>
      </PanelCard>
    </MantineProvider>,
  );

const card = () => screen.getByTestId('test-panel');
const titleBar = (title = 'Measure') =>
  screen.getByText(title).closest('[data-panel-handle]') as HTMLElement;
const minimizeButton = (index = 0) => screen.getAllByLabelText('Minimize panel')[index];
const placements = () => Object.values(useAppStore.getState().panelPlacements);

const clearPanels = () => useAppStore.setState({ activePanel: null, panelPlacements: {} });

describe('PanelCard minimize', () => {
  let unloadCss = () => {};

  beforeEach(() => {
    cleanup();
    clearPanels();
    unloadCss = loadGlobalCss();
  });

  afterEach(() => unloadCss());

  it('collapses the card to its title bar and back', () => {
    renderPanel();
    expect(screen.getByText(BODY)).toBeVisible();

    fireEvent.click(minimizeButton());

    expect(screen.getByText('Measure')).toBeVisible();
    expect(screen.getByText(BODY)).not.toBeVisible();
    expect(placements()).toEqual([{ minimized: true, position: null }]);

    fireEvent.click(screen.getByLabelText('Restore panel'));

    expect(screen.getByText(BODY)).toBeVisible();
  });

  it('collapses on a double click of the title bar', () => {
    renderPanel();

    fireEvent.doubleClick(titleBar());

    expect(screen.getByText(BODY)).not.toBeVisible();
  });

  it('leaves the body mounted while collapsed so panel input survives', () => {
    renderPanel();
    fireEvent.click(minimizeButton());

    expect(screen.getByText(BODY)).toBeInTheDocument();
  });

  it('leaves a second open card alone', () => {
    renderTwoPanels();

    fireEvent.click(minimizeButton());

    expect(screen.getByText(BODY)).not.toBeVisible();
    expect(screen.getByText(OTHER_BODY)).toBeVisible();
  });

  it('forgets a card that closed on its own, outside the activePanel rule', () => {
    const { unmount } = renderPanel();
    fireEvent.click(minimizeButton());
    expect(placements()).toHaveLength(1);

    unmount();

    expect(placements()).toEqual([]);
  });

  it('offers no minimize button to a header outside a card', () => {
    render(
      <MantineProvider>
        <PanelHeader icon={<IconRuler size={16} />} title="Loose" onClose={vi.fn()} />
      </MantineProvider>,
    );

    expect(screen.queryByLabelText('Minimize panel')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Close panel')).toBeInTheDocument();
  });
});

describe('PanelCard drag', () => {
  beforeEach(() => {
    cleanup();
    clearPanels();
  });

  it('floats the card at the dragged position', () => {
    renderPanel();
    expect(card()).toHaveStyle({ position: 'absolute' });

    fireEvent.pointerDown(titleBar(), { button: 0, clientX: 100, clientY: 20 });
    fireEvent.pointerMove(window, { clientX: 300, clientY: 200 });

    expect(placements()).toEqual([{ minimized: false, position: { x: 200, y: 180 } }]);
    expect(card()).toHaveStyle({ position: 'fixed', left: '200px', top: '180px' });
  });

  it('leaves a second open card where it was', () => {
    renderTwoPanels();

    fireEvent.pointerDown(titleBar(), { button: 0, clientX: 100, clientY: 20 });
    fireEvent.pointerMove(window, { clientX: 300, clientY: 200 });

    expect(card()).toHaveStyle({ position: 'fixed' });
    expect(screen.getByTestId('other-panel')).toHaveStyle({ position: 'absolute' });
  });

  it('keeps the card inside the viewport', () => {
    renderPanel();

    fireEvent.pointerDown(titleBar(), { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(window, { clientX: window.innerWidth + 500, clientY: -400 });

    expect(placements()[0].position).toEqual({ x: window.innerWidth, y: 0 });
  });

  it('ignores a click that never travels', () => {
    renderPanel();

    fireEvent.pointerDown(titleBar(), { button: 0, clientX: 100, clientY: 20 });
    fireEvent.pointerMove(window, { clientX: 101, clientY: 21 });
    fireEvent.pointerUp(window, { clientX: 101, clientY: 21 });

    expect(placements()).toEqual([]);
  });

  it('stops following the pointer once it is released', () => {
    renderPanel();

    fireEvent.pointerDown(titleBar(), { button: 0, clientX: 100, clientY: 20 });
    fireEvent.pointerMove(window, { clientX: 300, clientY: 200 });
    fireEvent.pointerUp(window, { clientX: 300, clientY: 200 });
    fireEvent.pointerMove(window, { clientX: 500, clientY: 400 });

    expect(placements()[0].position).toEqual({ x: 200, y: 180 });
  });
});

describe('panel placement state', () => {
  beforeEach(() => {
    cleanup();
    useAppStore.setState({
      activePanel: 'measure',
      panelPlacements: { card: { minimized: true, position: { x: 5, y: 6 } } },
    });
  });

  it('resets when another panel opens', () => {
    useAppStore.getState().setActivePanel('layers');

    expect(useAppStore.getState().panelPlacements).toEqual({});
  });

  it('resets when the panel closes', () => {
    useAppStore.getState().togglePanel('measure');

    expect(useAppStore.getState().activePanel).toBeNull();
    expect(useAppStore.getState().panelPlacements).toEqual({});
  });

  it('stays out of the persisted state', () => {
    useAppStore.getState().setActivePanel('layers');
    const persisted = JSON.parse(window.localStorage.getItem('viewtopia-app') ?? '{}');

    expect(persisted.state).toHaveProperty('basemap');
    expect(persisted.state).not.toHaveProperty('panelPlacements');
  });
});
