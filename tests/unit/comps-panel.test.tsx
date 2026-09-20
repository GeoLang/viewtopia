import { describe, it, expect, beforeEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';

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

const network = vi.hoisted(() => ({ searchComps: vi.fn() }));

vi.mock('../../src/lib/realEstate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/lib/realEstate')>()),
  searchComps: network.searchComps,
}));

import { CompsPanel } from '../../src/components/tools/CompsPanel';

const BRANCH_ID = '11111111-1111-1111-1111-111111111111';
const SUBJECT_LAT = 43.653;
const SUBJECT_LNG = -79.383;

const onFlyTo = vi.fn();
const onHighlightComps = vi.fn();

const renderPanel = () =>
  render(
    <MantineProvider>
      <CompsPanel
        branchId={BRANCH_ID}
        salesDataset="sales"
        subjectLat={SUBJECT_LAT}
        subjectLng={SUBJECT_LNG}
        onFlyTo={onFlyTo}
        onHighlightComps={onHighlightComps}
      />
    </MantineProvider>,
  );

const findComps = () => fireEvent.click(screen.getByRole('button', { name: 'Find Comps' }));

describe('CompsPanel', () => {
  beforeEach(() => {
    network.searchComps.mockReset();
    onFlyTo.mockReset();
    onHighlightComps.mockReset();
  });

  it('says a search found no sales, naming the radius and period it used', async () => {
    network.searchComps.mockResolvedValue({ comps: [], summary: null });
    renderPanel();
    findComps();

    expect(
      await screen.findByText('No sales within 0.5 miles in the last 6 months.'),
    ).toBeInTheDocument();
  });

  it('uses the months the form was changed to in that line', async () => {
    network.searchComps.mockResolvedValue({ comps: [], summary: null });
    renderPanel();
    fireEvent.change(screen.getByLabelText('Months back'), { target: { value: '12' } });
    findComps();

    expect(
      await screen.findByText('No sales within 0.5 miles in the last 12 months.'),
    ).toBeInTheDocument();
  });

  it('says nothing about an empty search once sales come back', async () => {
    network.searchComps.mockResolvedValue({
      comps: [
        {
          id: 'sale-1',
          address: '12 Rue Grimaldi',
          salePrice: 900000,
          saleDate: '2026-05-01',
          sqft: 1200,
          pricePerSqft: 750,
          distanceM: 400,
          properties: { lat: 43.7384, lng: 7.4246 },
        },
      ],
      summary: null,
    });
    renderPanel();
    findComps();

    expect(await screen.findByText('12 Rue Grimaldi')).toBeInTheDocument();
    expect(screen.queryByText(/No sales within/)).not.toBeInTheDocument();
    expect(onHighlightComps).toHaveBeenCalledWith([{ lat: 43.7384, lng: 7.4246 }]);
  });
});
