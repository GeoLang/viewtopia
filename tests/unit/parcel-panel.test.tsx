import { describe, it, expect, beforeEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import type { ParcelRecord } from '../../src/lib/realEstate';

// MantineProvider reads the color scheme through matchMedia and ScrollArea
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

const network = vi.hoisted(() => ({ searchParcels: vi.fn() }));

vi.mock('../../src/lib/realEstate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/lib/realEstate')>()),
  searchParcels: network.searchParcels,
}));

import { ParcelPanel } from '../../src/components/tools/ParcelPanel';

const BRANCH_ID = '11111111-1111-1111-1111-111111111111';

const square = (lng: number, lat: number): GeoJSON.Geometry => ({
  type: 'Polygon',
  coordinates: [
    [
      [lng, lat],
      [lng + 0.001, lat],
      [lng + 0.001, lat + 0.001],
      [lng, lat + 0.001],
      [lng, lat],
    ],
  ],
});

const parcel = (overrides: Partial<ParcelRecord> = {}): ParcelRecord => ({
  id: crypto.randomUUID(),
  apn: '1234567890',
  address: '100 Queen St W',
  owner: '',
  zoning: 'CR',
  sqft: 5000,
  properties: { land_use: 'Commercial' },
  geometry: square(-79.383, 43.653),
  ...overrides,
});

const onFlyTo = vi.fn();
const onHighlightParcel = vi.fn();
const onAddToSelection = vi.fn();

const renderPanel = () =>
  render(
    <MantineProvider>
      <ParcelPanel
        branchId={BRANCH_ID}
        onFlyTo={onFlyTo}
        onHighlightParcel={onHighlightParcel}
        onAddToSelection={onAddToSelection}
      />
    </MantineProvider>,
  );

const search = (text: string) => {
  fireEvent.change(screen.getByPlaceholderText('123-456-789'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
};

describe('ParcelPanel', () => {
  beforeEach(() => {
    network.searchParcels.mockReset();
    onFlyTo.mockReset();
    onHighlightParcel.mockReset();
    onAddToSelection.mockReset();
  });

  it('lists every match and shows the detail of the row picked', async () => {
    network.searchParcels.mockResolvedValue([
      parcel({ apn: '1100', address: '1100 Queen St W' }),
      parcel({ apn: '100', address: '100 Queen St W', properties: { land_use: 'Residential' } }),
    ]);
    renderPanel();
    search('100 Queen St W');

    await screen.findByText('2 parcels match');
    expect(screen.getByText('1100 Queen St W')).toBeInTheDocument();
    expect(screen.getByText('1100')).toBeInTheDocument();
    expect(screen.queryByText('Zoning & Land Use')).not.toBeInTheDocument();
    expect(onFlyTo).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /1100 Queen St W/ }));

    expect(await screen.findByText('Zoning & Land Use')).toBeInTheDocument();
    expect(screen.getByText('Commercial')).toBeInTheDocument();
    expect(onFlyTo).toHaveBeenCalledWith(expect.closeTo(43.6535, 3), expect.closeTo(-79.3825, 3), 18);
    expect(onHighlightParcel).toHaveBeenCalledWith(square(-79.383, 43.653));
  });

  it('asks for ten results and puts an exact match of the typed query first', async () => {
    network.searchParcels.mockResolvedValue([
      parcel({ apn: '1234567890-1', address: '102 Queen St W' }),
      parcel({ apn: '1234567890', address: '100 Queen St W' }),
      parcel({ apn: '1234567890-2', address: '104 Queen St W' }),
    ]);
    renderPanel();
    search('1234567890');

    await screen.findByText('3 parcels match');
    expect(network.searchParcels).toHaveBeenCalledWith(BRANCH_ID, 'apn', '1234567890', 10);

    const rows = screen
      .getAllByRole('button')
      .map((button) => button.textContent ?? '')
      .filter((text) => text.includes('Queen'));
    expect(rows[0]).toContain('100 Queen St W');
    expect(rows[1]).toContain('102 Queen St W');
  });

  it('shows a single hit directly, with no flood zone when the data has none', async () => {
    network.searchParcels.mockResolvedValue([parcel({ properties: { land_use: 'Commercial' } })]);
    renderPanel();
    search('1234567890');

    expect(await screen.findByText('100 Queen St W')).toBeInTheDocument();
    expect(screen.queryByText('Flood Zone')).not.toBeInTheDocument();
    expect(screen.queryByText(/Zone X/)).not.toBeInTheDocument();
  });

  it('keeps the flood zone section when the parcel carries one', async () => {
    network.searchParcels.mockResolvedValue([
      parcel({ properties: { land_use: 'Commercial', flood_zone: 'AE' } }),
    ]);
    renderPanel();
    search('1234567890');

    expect(await screen.findByText('Flood Zone')).toBeInTheDocument();
    expect(screen.getByText('Zone AE')).toBeInTheDocument();
  });

  it('hides the owner line and the valuation section when the data has neither', async () => {
    network.searchParcels.mockResolvedValue([parcel()]);
    renderPanel();
    search('1234567890');

    expect(await screen.findByText('100 Queen St W')).toBeInTheDocument();
    expect(screen.queryByText(/Owner:/)).not.toBeInTheDocument();
    expect(screen.queryByText('Valuation')).not.toBeInTheDocument();
    expect(screen.queryByText('Assessed')).not.toBeInTheDocument();
  });

  it('shows the owner and the values the data does carry', async () => {
    network.searchParcels.mockResolvedValue([
      parcel({
        owner: 'Smith, John',
        properties: { land_use: 'Residential', assessed_value: 420000 },
      }),
    ]);
    renderPanel();
    search('1234567890');

    expect(await screen.findByText('Owner: Smith, John')).toBeInTheDocument();
    expect(screen.getByText('Valuation')).toBeInTheDocument();
    expect(screen.getByText('$420,000')).toBeInTheDocument();
    expect(screen.queryByText('Market')).not.toBeInTheDocument();
  });

  it('reports a search that found nothing', async () => {
    network.searchParcels.mockResolvedValue([]);
    renderPanel();
    search('nothing');

    await waitFor(() =>
      expect(screen.getByText('No parcel found for this query.')).toBeInTheDocument(),
    );
  });
});
