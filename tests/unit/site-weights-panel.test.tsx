import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { startDeal, addToShortlist } from '../../src/features/deals/deal';
import { useDealStore } from '../../src/features/deals/store';
import { useAgentLayerStore } from '../../src/store/agentLayers';
import { SiteWeightsPanel } from '../../src/plugins/real-estate/SiteWeightsPanel';

// MantineProvider reads the color scheme through matchMedia and the slider
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

const SCORE_SITES_ROWS = [
  { name: 'King West', total_score: 66.7, rank: 1, population_score: 100, population_weight: 2, competition_score: 0, competition_weight: 1 },
  { name: 'Junction', total_score: 33.3, rank: 2, population_score: 0, population_weight: 2, competition_score: 100, competition_weight: 1 },
  { name: 'Leslieville', total_score: 33.3, rank: 3, population_score: 0, population_weight: 2, competition_score: 100, competition_weight: 1 },
];

function showScoreSitesLayer() {
  useAgentLayerStore.getState().setLayers([
    {
      id: 'site_scores',
      name: 'site_scores.gpkg',
      geojson: {
        type: 'FeatureCollection',
        features: SCORE_SITES_ROWS.map((properties, index) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [-79.4 + index * 0.05, 43.65] },
          properties,
        })),
      },
    },
  ]);
}

const siteOrder = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => row.querySelectorAll('td')[1]?.textContent);

describe('SiteWeightsPanel', () => {
  afterEach(() => {
    useAgentLayerStore.getState().clear();
    useDealStore.getState().setDeal(null);
  });

  it('says how to get a shortlist when no scored layer is on the map', () => {
    render(
      <MantineProvider>
        <SiteWeightsPanel comps={[]} />
      </MantineProvider>,
    );

    expect(screen.getByText(/No scored sites yet/)).toBeInTheDocument();
  });

  it('re-ranks the shortlist as a weight slider moves', () => {
    showScoreSitesLayer();
    render(
      <MantineProvider>
        <SiteWeightsPanel comps={[]} />
      </MantineProvider>,
    );
    expect(siteOrder()).toEqual(['King West', 'Junction', 'Leslieville']);

    const competition = screen.getByRole('slider', { name: 'competition weight' });
    for (let step = 0; step < 2; step++) fireEvent.keyDown(competition, { key: 'ArrowRight' });

    expect(screen.getByText('competition: 3')).toBeInTheDocument();
    expect(siteOrder()).toEqual(['Junction', 'Leslieville', 'King West']);
  });

  it('compares only the deal shortlist when the deal has one', () => {
    showScoreSitesLayer();
    useDealStore.getState().setDeal(
      addToShortlist(startDeal('Toronto grocery'), [
        { featureId: 'parcel-1', label: 'Leslieville' },
        { featureId: 'parcel-2', label: 'King West' },
        { featureId: 'parcel-3', label: 'Liberty Village' },
      ]),
    );
    render(
      <MantineProvider>
        <SiteWeightsPanel comps={[]} />
      </MantineProvider>,
    );

    expect(siteOrder()).toEqual(['King West', 'Leslieville']);
    expect(screen.getByText('Not in site_scores.gpkg: Liberty Village')).toBeInTheDocument();
  });
});
