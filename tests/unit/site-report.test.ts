import { describe, expect, it } from 'vitest';
import type { CompSale } from '../../src/components/tools/CompsPanel';
import type { RankedSite, TradeAreaTable } from '../../src/plugins/real-estate/siteRanking';
import { siteReport, siteReportPdf } from '../../src/plugins/real-estate/siteReport';

const ONE_PIXEL_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const WEIGHTS = { population: 1, competition: 3 };

const RANKED: RankedSite[] = [
  { name: 'Junction', scores: { population: 0, competition: 100 }, total: 75, rank: 1 },
  { name: 'King West', scores: { population: 100, competition: 0 }, total: 25, rank: 2 },
];

const TRADE_AREAS: TradeAreaTable = {
  columns: ['minutes', 'population', 'median_income'],
  rows: [
    { site: 'Scarborough', values: { minutes: 10, population: 15000, median_income: 64000 } },
    { site: 'King West', values: { minutes: 10, population: 40000, median_income: 90000.456 } },
    { site: 'Junction', values: { minutes: 10, population: 20000, median_income: null } },
  ],
};

const COMP: CompSale = {
  address: '12 Dundas St W',
  saleDate: '2026-05-01',
  salePrice: 1250000,
  sqft: 2500,
  pricePerSqft: 500.4,
  bedrooms: 0,
  bathrooms: 0,
  yearBuilt: 1990,
  distance: 0.4567,
  lat: 43.65,
  lng: -79.38,
};

describe('siteReport', () => {
  it('lists the ranking in its current order with the weights behind it', () => {
    const report = siteReport(RANKED, WEIGHTS, null, []);

    expect(report.weights).toBe('population 1, competition 3');
    expect(report.tables).toEqual([
      {
        title: 'Ranking',
        headers: ['#', 'Site', 'Score', 'population', 'competition'],
        rows: [
          ['1', 'Junction', '75.0', '0', '100'],
          ['2', 'King West', '25.0', '100', '0'],
        ],
      },
    ]);
  });

  it('orders the trade areas by the ranking and puts sites off the shortlist last', () => {
    const report = siteReport(RANKED, WEIGHTS, TRADE_AREAS, []);
    const tradeAreas = report.tables[1];

    expect(tradeAreas.title).toBe('Trade areas');
    expect(tradeAreas.headers).toEqual(['Site', 'minutes', 'population', 'median income']);
    expect(tradeAreas.rows.map((row) => row[0])).toEqual(['Junction', 'King West', 'Scarborough']);
    expect(tradeAreas.rows[0][3]).toBe('n/a');
    expect(tradeAreas.rows[1][3]).toBe((90000.46).toLocaleString());
  });

  it('carries the comparable sales the comps panel found', () => {
    const report = siteReport(RANKED, WEIGHTS, null, [COMP]);

    expect(report.tables[1]).toEqual({
      title: 'Comparable sales',
      headers: ['Address', 'Price', '$/sqft', 'Date', 'Distance'],
      rows: [['12 Dundas St W', `$${(1250000).toLocaleString()}`, '$500', '2026-05-01', '0.46 mi']],
    });
  });
});

describe('siteReportPdf', () => {
  it('writes every table row and runs a long table onto more pages', () => {
    const manySites: RankedSite[] = Array.from({ length: 60 }, (_, index) => ({
      name: `Candidate ${index + 1}`,
      scores: { population: index, competition: 0 },
      total: 60 - index,
      rank: index + 1,
    }));
    const doc = siteReportPdf(siteReport(manySites, WEIGHTS, null, [COMP]), null, '2026-09-23');
    const content = doc.output();

    expect(content).toContain('(Site report)');
    expect(content).toContain('(Candidate 60)');
    expect(content).toContain('(12 Dundas St W)');
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
  });

  it('puts the map image on the first page', () => {
    const mapImage = { dataUrl: ONE_PIXEL_PNG, width: 1600, height: 900 };
    const withMap = siteReportPdf(siteReport(RANKED, WEIGHTS, null, []), mapImage, '2026-09-23');
    const withoutMap = siteReportPdf(siteReport(RANKED, WEIGHTS, null, []), null, '2026-09-23');

    expect(withMap.output()).toContain('/Subtype /Image');
    expect(withoutMap.output()).not.toContain('/Subtype /Image');
  });
});
