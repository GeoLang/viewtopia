import { describe, it, expect, beforeEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';

vi.mock('../../src/services/geocode', () => ({
  geocode: vi.fn(),
}));
vi.mock('../../src/services/route', () => ({
  route: vi.fn(),
}));

import { RoutingPanel } from '../../src/components/tools/RoutingPanel';
import { geocode } from '../../src/services/geocode';
import { route } from '../../src/services/route';
import { useAppStore } from '../../src/store/app';
import { useFlythroughStore } from '../../src/store/flythrough';

window.matchMedia = vi.fn().mockReturnValue({
  matches: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
});
// the step list scrolls in a ScrollArea, which measures itself
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const GEOMETRY: [number, number][] = [
  [10, 45],
  [10.02, 45.01],
];

const type = (placeholder: string, value: string) =>
  fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value } });

async function findRoute() {
  render(
    <MantineProvider>
      <RoutingPanel onClose={() => {}} />
    </MantineProvider>,
  );
  type('Origin (address or place)', 'here');
  type('Destination', 'there');
  fireEvent.click(screen.getByRole('button', { name: 'Find Route' }));
  await screen.findByRole('button', { name: 'Fly This Route' });
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  useAppStore.setState({ activePanel: 'routing' });
  useFlythroughStore.setState({ routeGeometry: null });
  vi.mocked(geocode).mockResolvedValue([{ lat: 45, lng: 10, label: 'x', type: 'place' }]);
  vi.mocked(route).mockResolvedValue({
    distance: 2000,
    duration: 300,
    geometry: GEOMETRY,
    steps: [],
    source: 'itinera',
  });
});

describe('RoutingPanel', () => {
  it('hands the route to the flythrough panel and opens it', async () => {
    await findRoute();

    fireEvent.click(screen.getByRole('button', { name: 'Fly This Route' }));

    await waitFor(() => expect(useAppStore.getState().activePanel).toBe('flythrough'));
    expect(useFlythroughStore.getState().routeGeometry).toEqual(GEOMETRY);
  });

  it('offers the flight only once there is a route', () => {
    render(
      <MantineProvider>
        <RoutingPanel onClose={() => {}} />
      </MantineProvider>,
    );

    expect(screen.queryByRole('button', { name: 'Fly This Route' })).toBeNull();
  });

  it('lists each step with its instruction and distance', async () => {
    vi.mocked(route).mockResolvedValue({
      distance: 1700,
      duration: 300,
      geometry: GEOMETRY,
      steps: [
        { instruction: 'Head out on Via Roma', distance: 200 },
        { instruction: 'Turn left onto Corso Italia', distance: 1500 },
      ],
      source: 'itinera',
    });

    await findRoute();

    const directions = screen.getByRole('list', { name: 'Directions' });
    expect(within(directions).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Head out on Via Roma 200 m',
      'Turn left onto Corso Italia 1.5 km',
    ]);
  });

  it('shows no directions for a route that came without steps', async () => {
    vi.mocked(route).mockResolvedValue({
      distance: 3100,
      duration: 420,
      geometry: GEOMETRY,
      steps: [],
      source: 'osrm',
    });

    await findRoute();

    expect(screen.queryByRole('list', { name: 'Directions' })).toBeNull();
  });
});
