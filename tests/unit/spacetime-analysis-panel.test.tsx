import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';

/**
 * The worker is the only thing stubbed: requestAnalysis hands straight to the
 * real runAnalysis, so a button click drives the actual algorithms.
 */
vi.mock('../../src/features/spacetime/analysis/engine', async () => {
  const { runAnalysis } = await import('../../src/features/spacetime/analysis/run');
  return {
    requestAnalysis: vi.fn(async (kind, input) => runAnalysis(kind, input)),
  };
});

import { SpaceTimePanel } from '../../src/features/spacetime/SpaceTimePanel';
import { useSpaceTimeStore } from '../../src/features/spacetime/store';
import { useDeckLayersStore } from '../../src/hooks/deckLayers';
import { useSpaceTimeAnalysisDeckLayers } from '../../src/hooks/useSpaceTimeAnalysisDeckLayers';
import { runAnalysis } from '../../src/features/spacetime/analysis/run';
import type { Entity, SpaceTimeEvent, Track } from '../../src/features/spacetime/types';

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

const START = Date.parse('2024-01-15T08:00:00Z');
const TEN_MINUTES = 600_000;

function walker(entityId: string, lngOffset: number): Track {
  const events: SpaceTimeEvent[] = [0, 1, 2, 3, 4, 5].map((step) => ({
    id: `${entityId}-${step}`,
    entityId,
    timestamp: START + step * TEN_MINUTES,
    lng: -122.4 + step * 0.0001 + lngOffset,
    lat: 37.77,
  }));
  return { id: `track-${entityId}`, entityId, events };
}

function entity(id: string, name: string): Entity {
  return {
    id,
    name,
    kind: 'person',
    aliases: [],
    color: '#a78bfa',
    properties: {},
    createdAt: 0,
    updatedAt: 0,
  };
}

function loadFixture() {
  useSpaceTimeStore.setState({
    panelOpen: true,
    entities: new Map([
      ['alice', entity('alice', 'Alice')],
      ['bob', entity('bob', 'Bob')],
    ]),
    tracks: [walker('alice', 0), walker('bob', 0.0001)],
    links: [{ id: 'l1', sourceId: 'alice', targetId: 'bob', kind: 'colocation' }],
    timeRange: { min: START, max: START + 5 * TEN_MINUTES },
    currentTime: START,
    analysisResult: null,
    analysisRunning: null,
    analysisError: null,
  });
}

function renderPanel() {
  return render(
    <MantineProvider>
      <SpaceTimePanel />
    </MantineProvider>,
  );
}

async function openAnalysisTab() {
  fireEvent.click(screen.getByRole('tab', { name: /Analysis/ }));
  await screen.findByRole('button', { name: 'Colocation Detection' });
}

describe('Analysis tab buttons', () => {
  beforeEach(() => {
    loadFixture();
    useDeckLayersStore.setState({ groups: {} });
  });
  afterEach(cleanup);

  it('no longer offers Entity Resolution', async () => {
    renderPanel();
    await openAnalysisTab();
    expect(screen.queryByRole('button', { name: 'Entity Resolution' })).toBeNull();
  });

  it('offers every wired analysis, co-travel included', async () => {
    renderPanel();
    await openAnalysisTab();
    for (const label of [
      'Colocation Detection',
      'Co-Travel Detection',
      'Pattern-of-Life',
      'Network Metrics',
      'Behavioral Clustering',
      'Predictive Location',
      'Data Quality Check',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeEnabled();
    }
  });

  it('disables the buttons until tracks are imported', async () => {
    useSpaceTimeStore.setState({ tracks: [] });
    renderPanel();
    await openAnalysisTab();
    expect(screen.getByRole('button', { name: 'Colocation Detection' })).toBeDisabled();
  });

  it('runs colocation and lists its results', async () => {
    renderPanel();
    await openAnalysisTab();
    fireEvent.click(screen.getByRole('button', { name: 'Colocation Detection' }));

    const results = await screen.findByTestId('spacetime-analysis-results');
    expect(within(results).getByText('6 meetings')).toBeInTheDocument();
    expect(within(results).getAllByTestId('spacetime-analysis-row').length).toBe(6);
    expect(within(results).getAllByText('Alice + Bob').length).toBe(6);
    expect(useSpaceTimeStore.getState().analysisResult?.kind).toBe('colocation');
  });

  it('runs co-travel and lists its run', async () => {
    renderPanel();
    await openAnalysisTab();
    fireEvent.click(screen.getByRole('button', { name: 'Co-Travel Detection' }));

    const results = await screen.findByTestId('spacetime-analysis-results');
    expect(within(results).getByText('1 co-travel runs')).toBeInTheDocument();
    expect(within(results).getByText('Alice with Bob')).toBeInTheDocument();
  });

  // one case per button rather than a loop: a loop of seven renders runs past
  // the 15s cap on a loaded box, and vitest then leaves the abandoned
  // continuation unmounting trees and eating mocks belonging to later tests
  const ANALYSIS_RESULT_KIND_BY_BUTTON = [
    ['Colocation Detection', 'colocation'],
    ['Co-Travel Detection', 'cotravel'],
    ['Pattern-of-Life', 'pattern'],
    ['Network Metrics', 'network'],
    ['Behavioral Clustering', 'clustering'],
    ['Predictive Location', 'prediction'],
    ['Data Quality Check', 'quality'],
  ] as const;

  it.each(ANALYSIS_RESULT_KIND_BY_BUTTON)(
    '%s leaves a %s result in the store',
    async (label, kind) => {
      renderPanel();
      await openAnalysisTab();
      fireEvent.click(screen.getByRole('button', { name: label }));
      await waitFor(() => expect(useSpaceTimeStore.getState().analysisResult?.kind).toBe(kind));
    },
  );

  it('clears the results on demand', async () => {
    renderPanel();
    await openAnalysisTab();
    fireEvent.click(screen.getByRole('button', { name: 'Colocation Detection' }));
    await screen.findByTestId('spacetime-analysis-results');

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    await waitFor(() =>
      expect(screen.queryByTestId('spacetime-analysis-results')).toBeNull(),
    );
    expect(useSpaceTimeStore.getState().analysisResult).toBeNull();
  });

  it('surfaces a worker failure instead of hanging on the spinner', async () => {
    const { requestAnalysis } = await import('../../src/features/spacetime/analysis/engine');
    vi.mocked(requestAnalysis).mockRejectedValueOnce(new Error('worker died'));

    renderPanel();
    await openAnalysisTab();
    fireEvent.click(screen.getByRole('button', { name: 'Colocation Detection' }));

    expect(await screen.findByTestId('spacetime-analysis-error')).toHaveTextContent('worker died');
    expect(useSpaceTimeStore.getState().analysisRunning).toBeNull();
  });
});

describe('analysis deck layers', () => {
  beforeEach(() => {
    loadFixture();
    useDeckLayersStore.setState({ groups: {} });
  });
  afterEach(cleanup);

  function analysisLayerIds() {
    return (useDeckLayersStore.getState().groups['spacetime-analysis'] ?? []).map((l) => l.id);
  }

  function draw(kind: Parameters<typeof runAnalysis>[0]) {
    const state = useSpaceTimeStore.getState();
    useSpaceTimeStore.setState({
      analysisResult: runAnalysis(kind, {
        tracks: state.tracks,
        links: state.links,
        entities: [...state.entities.values()].map((e) => ({ id: e.id, name: e.name })),
        timeRange: state.timeRange,
      }),
    });
    renderHook(() => useSpaceTimeAnalysisDeckLayers());
  }

  it('draws nothing without a result', () => {
    renderHook(() => useSpaceTimeAnalysisDeckLayers());
    expect(analysisLayerIds()).toEqual([]);
  });

  it('draws meeting markers for colocation', () => {
    draw('colocation');
    expect(analysisLayerIds()).toEqual(['spacetime-analysis-points']);
  });

  it('draws paired segments for co-travel', () => {
    draw('cotravel');
    expect(analysisLayerIds()).toEqual(['spacetime-analysis-paths']);
  });

  it('draws dwell rings for pattern-of-life', () => {
    draw('pattern');
    expect(analysisLayerIds()).toContain('spacetime-analysis-rings');
  });

  it('draws recolored tracks for clustering', () => {
    draw('clustering');
    expect(analysisLayerIds()).toEqual(['spacetime-analysis-paths']);
  });

  it('draws a ghost marker and its path for prediction', () => {
    draw('prediction');
    expect(analysisLayerIds()).toEqual([
      'spacetime-analysis-paths',
      'spacetime-analysis-points',
    ]);
  });

  it('draws nothing for network metrics, which is a ranked list', () => {
    draw('network');
    expect(analysisLayerIds()).toEqual([]);
  });

  it('lifts the marks into the cube by their timestamp', () => {
    draw('colocation');
    const layer = useDeckLayersStore.getState().groups['spacetime-analysis'][0];
    const points = layer.props.data as { timestamp: number }[];
    const getPosition = layer.props.getPosition as (d: unknown) => [number, number, number];
    const first = getPosition(points[0]);
    const last = getPosition(points[points.length - 1]);
    expect(first[2]).toBe(0);
    expect(last[2]).toBeGreaterThan(first[2]);
  });
});
