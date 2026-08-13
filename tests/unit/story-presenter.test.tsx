import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { StoryPresenterView } from '../../src/components/StoryPresenterView';
import { StoriesPanel } from '../../src/components/tools/StoriesPanel';
import {
  STORY_PRESENTER_CHANNEL_NAME,
  STORY_STEPS_STORAGE_KEY,
  isStoryPresenterRequested,
  loadStorySteps,
  openStoryPresenterChannel,
  type StoryPresenterMessage,
} from '../../src/lib/storyPresenter';
import type { StoryStep } from '../../src/lib/storyExport';
import { fakeChannelPeer, installFakeBroadcastChannel } from './stubs/fakeBroadcastChannel';

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

function step(overrides: Partial<StoryStep> = {}): StoryStep {
  return {
    id: crypto.randomUUID(),
    title: 'Harbour',
    description: 'Where the ferries dock',
    camera: { lng: 5.32, lat: 60.39, height: 9765.625, heading: 45, pitch: -60, roll: 0 },
    ...overrides,
  };
}

function storeSteps(steps: StoryStep[]): void {
  localStorage.setItem(STORY_STEPS_STORAGE_KEY, JSON.stringify(steps));
}

beforeEach(() => {
  installFakeBroadcastChannel();
  localStorage.clear();
});

describe('the presenter channel', () => {
  it('carries messages between the two windows', () => {
    const peer = fakeChannelPeer(STORY_PRESENTER_CHANNEL_NAME);
    const received: StoryPresenterMessage[] = [];
    const channel = openStoryPresenterChannel((message) => received.push(message));

    channel.send({ type: 'hello' });
    peer.send({ type: 'state', index: 2, playing: true });

    expect(peer.received).toEqual([{ type: 'hello' }]);
    expect(received).toEqual([{ type: 'state', index: 2, playing: true }]);

    channel.close();
    peer.close();
  });

  it('goes quiet once a side closes', () => {
    const peer = fakeChannelPeer(STORY_PRESENTER_CHANNEL_NAME);
    const received: StoryPresenterMessage[] = [];
    const channel = openStoryPresenterChannel((message) => received.push(message));

    channel.close();
    channel.send({ type: 'hello' });
    peer.send({ type: 'viewer-closed' });

    expect(peer.received).toEqual([]);
    expect(received).toEqual([]);
    peer.close();
  });

  it('reads the steps the panel saved, and survives junk', () => {
    storeSteps([step({ title: 'Harbour', notes: 'mention the ferries' })]);
    expect(loadStorySteps()).toEqual([expect.objectContaining({ notes: 'mention the ferries' })]);

    localStorage.setItem(STORY_STEPS_STORAGE_KEY, '{not json');
    expect(loadStorySteps()).toEqual([]);
  });

  it('boots the presenter only for the marked url', () => {
    const original = location.href;
    expect(isStoryPresenterRequested()).toBe(false);

    history.replaceState({}, '', '/?presenter=1');
    expect(isStoryPresenterRequested()).toBe(true);

    history.replaceState({}, '', original);
  });
});

describe('the presenter window', () => {
  const steps = [
    step({ title: 'Harbour', notes: 'mention the ferries' }),
    step({ title: 'Fløyen', description: 'The hill above town', notes: 'the funicular runs late' }),
  ];

  beforeEach(() => {
    storeSteps(steps);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function openPresenter() {
    const viewer = fakeChannelPeer(STORY_PRESENTER_CHANNEL_NAME);
    render(<StoryPresenterView />);
    return viewer;
  }

  it('shows the current notes and what comes next', () => {
    const viewer = openPresenter();
    act(() => viewer.send({ type: 'state', index: 0, playing: false }));

    expect(screen.getByTestId('presenter-position')).toHaveTextContent('Step 1 of 2');
    expect(screen.getByTestId('presenter-title')).toHaveTextContent('Harbour');
    expect(screen.getByTestId('presenter-notes')).toHaveTextContent('mention the ferries');
    expect(screen.getByTestId('presenter-next-step')).toHaveTextContent('Fløyen');
    expect(screen.getByTestId('presenter-next-step')).toHaveTextContent('the funicular runs late');
    expect(screen.getByTestId('presenter-link')).toHaveTextContent('Viewer connected');

    viewer.close();
  });

  it('drives the viewer window and follows what it reports back', () => {
    const viewer = openPresenter();
    act(() => viewer.send({ type: 'state', index: 0, playing: false }));

    fireEvent.click(screen.getByTestId('presenter-next'));
    expect(viewer.received).toContainEqual({ type: 'goto', index: 1 });

    act(() => viewer.send({ type: 'state', index: 1, playing: true }));
    expect(screen.getByTestId('presenter-position')).toHaveTextContent('Step 2 of 2');
    expect(screen.getByTestId('presenter-notes')).toHaveTextContent('the funicular runs late');
    expect(screen.getByTestId('presenter-next-step')).toHaveTextContent('End of story');
    expect(screen.getByText('Playing')).toBeInTheDocument();

    viewer.close();
  });

  it('asks for the position on open and reloads the steps on request', () => {
    const viewer = openPresenter();
    expect(viewer.received).toEqual([{ type: 'hello' }]);

    storeSteps([...steps, step({ title: 'Bryggen', notes: 'hanseatic wharf' })]);
    act(() => viewer.send({ type: 'steps-changed' }));

    expect(screen.getByTestId('presenter-position')).toHaveTextContent('Step 1 of 3');
    expect(screen.getByTestId('presenter-next-step')).toHaveTextContent('Fløyen');

    viewer.close();
  });

  it('is answered by the stories panel, which takes its navigation', () => {
    const presenter = fakeChannelPeer(STORY_PRESENTER_CHANNEL_NAME);
    render(
      <MantineProvider>
        <StoriesPanel onClose={() => {}} />
      </MantineProvider>,
    );

    act(() => presenter.send({ type: 'hello' }));
    expect(presenter.received).toEqual([{ type: 'state', index: 0, playing: false }]);

    act(() => presenter.send({ type: 'goto', index: 1 }));
    expect(presenter.received).toContainEqual({ type: 'state', index: 1, playing: false });
    // the panel moved its own cursor too, so step 2's notes are the ones editable
    expect(screen.getByLabelText('Speaker notes for step 2')).toBeInTheDocument();

    presenter.close();
  });

  it('reports a viewer that never answers, or one that leaves', () => {
    vi.useFakeTimers();
    render(<StoryPresenterView />);
    expect(screen.getByTestId('presenter-link')).toHaveTextContent('Connecting…');

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByTestId('presenter-link')).toHaveTextContent('Viewer disconnected');

    const viewer = fakeChannelPeer(STORY_PRESENTER_CHANNEL_NAME);
    act(() => viewer.send({ type: 'state', index: 1, playing: false }));
    expect(screen.getByTestId('presenter-link')).toHaveTextContent('Viewer connected');

    act(() => viewer.send({ type: 'viewer-closed' }));
    expect(screen.getByTestId('presenter-link')).toHaveTextContent('Viewer disconnected');

    viewer.close();
  });
});
