import { describe, expect, it } from 'vitest';
import type { AgentLayer } from '../../src/store/agentLayers';
import {
  dealSiteScores,
  rankSites,
  siteShortlist,
  tradeAreaTable,
} from '../../src/plugins/real-estate/siteRanking';

function layer(id: string, rows: Array<Record<string, unknown>>): AgentLayer {
  return {
    id,
    name: `${id}.gpkg`,
    path: `outputs/${id}.gpkg`,
    geojson: {
      type: 'FeatureCollection',
      features: rows.map((properties, index) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [-79.38 + index * 0.01, 43.65] },
        properties,
      })),
    },
  };
}

// columns as score_sites writes them, ranked with weights population 3 and competition 1
const SCORE_SITES_ROWS = [
  { name: 'King West', total_score: 75, rank: 1, population_raw: 9000, population_score: 100, population_weight: 3, competition_raw: 1, competition_score: 0, competition_weight: 1 },
  { name: 'Leslieville', total_score: 50, rank: 2, population_raw: 6000, population_score: 50, population_weight: 3, competition_raw: 3, competition_score: 50, competition_weight: 1 },
  { name: 'Junction', total_score: 25, rank: 3, population_raw: 3000, population_score: 0, population_weight: 3, competition_raw: 5, competition_score: 100, competition_weight: 1 },
];

// columns as trade_area writes them
const TRADE_AREA_ROWS = [
  { site: 'King West', lat: 43.64, lon: -79.4, minutes: 10, mode: 'driving', area_km2: 12.5, population: 40000, population_source: 'GHS-POP', competitors: 6, anchor_transit: 12, median_income: 90000 },
  { site: 'Leslieville', lat: 43.66, lon: -79.33, minutes: 10, mode: 'driving', area_km2: 14, population: 30000, population_source: 'GHS-POP', competitors: 2, anchor_transit: 12, median_income: null },
  { site: 'Junction', lat: 43.66, lon: -79.47, minutes: 10, mode: 'driving', area_km2: 11, population: 20000, population_source: 'GHS-POP', competitors: 4, anchor_transit: 12, median_income: 70000 },
];

describe('siteShortlist', () => {
  it('reads a score_sites layer with the weights the tool ranked it by', () => {
    const shortlist = siteShortlist([layer('site_scores', SCORE_SITES_ROWS)]);

    expect(shortlist?.criteria).toEqual(['population', 'competition']);
    expect(shortlist?.weights).toEqual({ population: 3, competition: 1 });
    expect(shortlist?.sites[1]).toEqual({
      name: 'Leslieville',
      scores: { population: 50, competition: 50 },
    });
  });

  it('scales trade_area figures to 0 to 100, fewer competitors scoring higher', () => {
    const shortlist = siteShortlist([layer('trade_areas', TRADE_AREA_ROWS)]);

    // band columns rate nothing, and median income is missing for one site
    expect(shortlist?.criteria).toEqual(['population', 'competitors', 'anchor_transit']);
    expect(shortlist?.sites.map((site) => site.scores)).toEqual([
      { population: 100, competitors: 0, anchor_transit: 50 },
      { population: 50, competitors: 100, anchor_transit: 50 },
      { population: 0, competitors: 50, anchor_transit: 50 },
    ]);
  });

  it('takes the newest score_sites or trade_area layer and skips any other', () => {
    const scores = layer('site_scores', SCORE_SITES_ROWS);
    const tradeAreas = layer('trade_areas', TRADE_AREA_ROWS);
    const parcels = layer('parcels', [{ apn: '123', address: '1 Front St' }]);

    expect(siteShortlist([tradeAreas, scores, parcels])?.layerId).toBe('site_scores');
    expect(siteShortlist([scores, tradeAreas, parcels])?.layerId).toBe('trade_areas');
    expect(siteShortlist([parcels])).toBeNull();
  });
});

describe('rankSites', () => {
  it('matches the total and rank score_sites wrote for the same weights', () => {
    const shortlist = siteShortlist([layer('site_scores', SCORE_SITES_ROWS)]);
    const ranked = rankSites(shortlist?.sites ?? [], { population: 3, competition: 1 });

    expect(ranked.map((site) => [site.name, site.total, site.rank])).toEqual(
      SCORE_SITES_ROWS.map((row) => [row.name, row.total_score, row.rank]),
    );
  });

  it('re-ranks when a weight moves', () => {
    const shortlist = siteShortlist([layer('site_scores', SCORE_SITES_ROWS)]);
    const ranked = rankSites(shortlist?.sites ?? [], { population: 1, competition: 3 });

    expect(ranked.map((site) => site.name)).toEqual(['Junction', 'Leslieville', 'King West']);
    expect(ranked[0]).toMatchObject({ rank: 1, total: 75 });
  });

  it('scores every site 0 when every weight is 0', () => {
    const shortlist = siteShortlist([layer('site_scores', SCORE_SITES_ROWS)]);
    const ranked = rankSites(shortlist?.sites ?? [], { population: 0, competition: 0 });

    expect(ranked.map((site) => site.total)).toEqual([0, 0, 0]);
  });
});

describe('tradeAreaTable', () => {
  it('keeps every trade_area column but the site name, one row per site', () => {
    const table = tradeAreaTable([layer('trade_areas', TRADE_AREA_ROWS), layer('site_scores', SCORE_SITES_ROWS)]);

    expect(table?.columns).toEqual(Object.keys(TRADE_AREA_ROWS[0]).filter((column) => column !== 'site'));
    expect(table?.rows.map((row) => row.site)).toEqual(['King West', 'Leslieville', 'Junction']);
  });
});

describe('dealSiteScores', () => {
  it('keeps the deal sites whose label names a scored site and lists the rest as unscored', () => {
    const shortlist = siteShortlist([layer('site_scores', SCORE_SITES_ROWS)]);
    const matched = dealSiteScores(shortlist?.sites ?? [], [
      { featureId: 'parcel-1', label: ' junction ' },
      { featureId: 'parcel-2', label: 'Liberty Village' },
      { featureId: 'parcel-3', label: 'King West' },
    ]);

    expect(matched.sites.map((site) => site.name)).toEqual(['Junction', 'King West']);
    expect(matched.unscored).toEqual([{ featureId: 'parcel-2', label: 'Liberty Village' }]);
  });
});
