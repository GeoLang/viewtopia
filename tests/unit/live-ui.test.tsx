import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import type { ReactNode } from 'react';
import { useAuthStore } from '../../src/features/auth/store';
import { joinLiveFromToken } from '../../src/live/joinFromLink';
import { LivePeers } from '../../src/live/LivePeers';
import { LiveSessionControl } from '../../src/live/LiveSessionControl';
import { LiveShareDialog } from '../../src/live/LiveShareDialog';
import { MapPresence } from '../../src/live/MapPresence';
import { useLiveStore } from '../../src/live/liveStore';
import { useAppStore } from '../../src/store/app';
import { setActiveMapLibre } from '../../src/viewer/registry';
import { FakeAgoraServer } from './stubs/fakeAgoraServer';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function draw(ui: ReactNode) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

let server: FakeAgoraServer;
let fetchMock: ReturnType<typeof vi.fn>;

describe('live session ui', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
      }),
    );
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);
    useAuthStore.setState({ token: 'jwt-token' });
    useLiveStore.setState({ peers: [] });
    useAppStore.setState({ layers: [], bookmarks: [], renderer: 'cesium', activeTab: 'globe' });
    server = new FakeAgoraServer();
    server.install();
  });

  afterEach(() => {
    cleanup();
    useLiveStore.getState().disconnect();
    setActiveMapLibre(null);
    useAuthStore.setState({ token: null });
    server.restore();
    vi.unstubAllGlobals();
  });

  it('shows one labelled avatar per peer', () => {
    useLiveStore.setState({
      peers: [
        { actor: 'ada', name: 'Ada Lovelace', role: 'edit' },
        { actor: 'grace', name: 'Grace Hopper', role: 'view' },
      ],
    });
    draw(<LivePeers />);
    expect(screen.getByLabelText('Ada Lovelace')).toHaveTextContent('AL');
    expect(screen.getByLabelText('Grace Hopper')).toHaveTextContent('GH');
  });

  it('starts a live session from the header control', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([]));
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'doc-9', name: 'Field survey' }));
    draw(<LiveSessionControl />);

    fireEvent.click(screen.getByRole('button', { name: 'Live' }));
    fireEvent.change(await screen.findByPlaceholderText('New live map name…'), {
      target: { value: 'Field survey' },
    });
    fireEvent.click(screen.getByTestId('start-live-session'));

    await waitFor(() => expect(server.connections).toHaveLength(1));
    expect(server.connection.documentParameter).toBe('doc-9');
    expect(useLiveStore.getState().documentId).toBe('doc-9');
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe('/agora/documents');
    expect(init.body).toBe(JSON.stringify({ name: 'Field survey' }));
  });

  it('joins a document listed by the service', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([{ id: 'doc-3', name: 'Coastline' }]));
    draw(<LiveSessionControl />);
    fireEvent.click(screen.getByRole('button', { name: 'Live' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Join' }));
    await waitFor(() => expect(server.connections).toHaveLength(1));
    expect(server.connection.documentParameter).toBe('doc-3');
  });

  it('shows the live document name and leaves on request', () => {
    server.document.meta.name = 'Coastline';
    useLiveStore.getState().connect({ documentId: 'doc-1', token: 'jwt-token' });
    server.accept();
    draw(<LiveSessionControl />);
    expect(screen.getByTestId('live-document-name')).toHaveTextContent('Coastline');

    fireEvent.click(screen.getByLabelText('Leave the live map'));
    expect(useLiveStore.getState().documentId).toBeNull();
  });

  it('creates a role scoped share link from the dialog', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ token: 'link-token' }));
    draw(<LiveShareDialog documentId="doc-1" opened onClose={() => {}} />);

    fireEvent.click(screen.getByText('Can edit'));
    fireEvent.click(screen.getByTestId('create-share-link'));

    await waitFor(() =>
      expect(screen.getByTestId('share-link')).toHaveValue(
        `${location.origin}/?live=link-token`,
      ),
    );
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/agora/documents/doc-1/links');
    expect(init.body).toBe(JSON.stringify({ role: 'edit' }));
  });

  it('reports a share link the service refused', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ reason: 'no' }, 403));
    draw(<LiveShareDialog documentId="doc-1" opened onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('create-share-link'));
    expect(await screen.findByTestId('share-error')).toHaveTextContent('403');
  });

  it('joins with the session token a share link resolves to', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ doc: 'doc-7', role: 'view', sessionToken: 'session-jwt' }),
    );
    await joinLiveFromToken('link-token');
    expect(fetchMock.mock.calls[0][0]).toBe('/agora/links/link-token');
    expect(server.connection.documentParameter).toBe('doc-7');
    expect(server.connection.offeredToken).toBe('session-jwt');
    expect(useLiveStore.getState().role).toBe('view');
  });

  it('broadcasts presence only on the maplibre renderer', () => {
    const handlers = new Map<string, () => void>();
    const map = {
      getCenter: () => ({ lng: 0, lat: 0 }),
      getZoom: () => 1,
      on: (event: string, handler: () => void) => handlers.set(event, handler),
      off: (event: string) => handlers.delete(event),
    };
    setActiveMapLibre(map as unknown as Parameters<typeof setActiveMapLibre>[0]);
    useLiveStore.getState().connect({ documentId: 'doc-1', token: 'jwt-token' });
    server.accept();

    const view = draw(<MapPresence />);
    expect(handlers.size).toBe(0);

    useAppStore.setState({ renderer: 'maplibre' });
    view.rerender(
      <MantineProvider>
        <MapPresence />
      </MantineProvider>,
    );
    expect([...handlers.keys()].sort()).toEqual(['mousemove', 'mouseout']);
  });
});
