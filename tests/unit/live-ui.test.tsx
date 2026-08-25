import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import type { ReactNode } from 'react';
import { useAuthStore } from '../../src/features/auth/store';
import { AssetTimeBar } from '../../src/live/AssetTimeBar';
import { useAssetStateStore } from '../../src/live/assetState';
import type { LiveMember } from '../../src/live/api';
import { joinLiveFromToken } from '../../src/live/joinFromLink';
import { LivePeers } from '../../src/live/LivePeers';
import { LiveSessionControl } from '../../src/live/LiveSessionControl';
import { LiveShareDialog } from '../../src/live/LiveShareDialog';
import { MapPresence } from '../../src/live/MapPresence';
import { useLiveStore } from '../../src/live/liveStore';
import { emptyLiveDocument, type AssetRule } from '../../src/live/types';
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

function noContentResponse(): Response {
  return new Response(null, { status: 204 });
}

function documentDetail(members: LiveMember[]) {
  return { id: 'doc-1', name: 'Coastline', members };
}

/**
 * An editor already in the document, which is what unlocks the members and
 * feeds sections. Both read on open, members first.
 */
function drawShareDialogAsEditor(members: LiveMember[]) {
  useLiveStore.setState({ documentId: 'doc-1', role: 'edit' });
  fetchMock.mockResolvedValueOnce(jsonResponse(documentDetail(members)));
  fetchMock.mockResolvedValueOnce(jsonResponse([]));
  draw(<LiveShareDialog documentId="doc-1" opened onClose={() => {}} />);
}

function requestTo(url: string): RequestInit {
  const call = fetchMock.mock.calls.find(([called]) => called === url);
  if (!call) throw new Error(`no request to ${url}`);
  return call[1] as RequestInit;
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

  it('follows a peer on click and stops on the next click', () => {
    useLiveStore.setState({ peers: [{ actor: 'ada', name: 'Ada Lovelace', role: 'edit' }] });
    draw(<LivePeers />);
    const avatar = screen.getByLabelText('Ada Lovelace');
    expect(avatar).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(avatar);
    expect(useLiveStore.getState().followedActor).toBe('ada');
    expect(screen.getByLabelText('Ada Lovelace')).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByLabelText('Ada Lovelace'));
    expect(useLiveStore.getState().followedActor).toBeNull();
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

  it('undoes on ctrl+z and leaves a focused text field its own undo', () => {
    server.document.meta.name = 'Coastline';
    useLiveStore.getState().connect({ documentId: 'doc-1', token: 'jwt-token' });
    server.accept();
    draw(<LiveSessionControl />);
    act(() => useLiveStore.getState().sendOperation('meta/name', 'Renamed'));
    expect(screen.getByTestId('live-document-name')).toHaveTextContent('Renamed');

    const field = document.createElement('input');
    document.body.append(field);
    fireEvent.keyDown(field, { key: 'z', ctrlKey: true });
    expect(screen.getByTestId('live-document-name')).toHaveTextContent('Renamed');
    field.remove();

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(screen.getByTestId('live-document-name')).toHaveTextContent('Coastline');

    fireEvent.keyDown(window, { key: 'Z', ctrlKey: true, shiftKey: true });
    expect(screen.getByTestId('live-document-name')).toHaveTextContent('Renamed');
  });

  it('enables the undo and redo buttons only when there is something to take back', () => {
    useLiveStore.getState().connect({ documentId: 'doc-1', token: 'jwt-token' });
    server.accept();
    draw(<LiveSessionControl />);
    expect(screen.getByTestId('live-undo')).toBeDisabled();
    expect(screen.getByTestId('live-redo')).toBeDisabled();

    act(() => useLiveStore.getState().sendOperation('meta/name', 'Renamed'));
    expect(screen.getByTestId('live-undo')).toBeEnabled();

    fireEvent.click(screen.getByTestId('live-undo'));
    expect(screen.getByTestId('live-undo')).toBeDisabled();
    expect(screen.getByTestId('live-redo')).toBeEnabled();
  });

  it('shows no undo affordance on a view role session', () => {
    useLiveStore.getState().connect({ documentId: 'doc-1', token: 'jwt-token', role: 'view' });
    server.accept({ role: 'view' });
    draw(<LiveSessionControl />);
    expect(screen.queryByTestId('live-undo')).not.toBeInTheDocument();
  });

  it('creates a role scoped share link carrying the current camera', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ token: 'link-token' }));
    draw(<LiveShareDialog documentId="doc-1" opened onClose={() => {}} />);

    fireEvent.click(screen.getByText('Can edit'));
    fireEvent.click(screen.getByTestId('create-share-link'));

    await waitFor(() => {
      const value = (screen.getByTestId('share-link') as HTMLInputElement).value;
      expect(value.startsWith(`${location.origin}/?live=link-token#cam=`)).toBe(true);
      expect(value).toContain('renderer=');
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/agora/documents/doc-1/links');
    expect(init.body).toBe(JSON.stringify({ role: 'edit' }));
  });

  it('offers an embed snippet only for view links, camera included', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ token: 'view-token' }));
    draw(<LiveShareDialog documentId="doc-1" opened onClose={() => {}} />);

    fireEvent.click(screen.getByTestId('create-share-link'));
    await waitFor(() => {
      const snippet = (screen.getByTestId('embed-snippet') as HTMLInputElement).value;
      expect(snippet).toContain('<iframe src=');
      expect(snippet).toContain('live=view-token');
      expect(snippet).toContain('embed=1');
      expect(snippet).toContain('#cam=');
    });

    fetchMock.mockResolvedValueOnce(jsonResponse({ token: 'edit-token' }));
    fireEvent.click(screen.getByText('Can edit'));
    fireEvent.click(screen.getByTestId('create-share-link'));
    await waitFor(() =>
      expect(screen.queryByTestId('embed-snippet')).not.toBeInTheDocument(),
    );
  });

  it('reports a share link the service refused, without the raw failure', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ reason: 'no' }, 403));
    draw(<LiveShareDialog documentId="doc-1" opened onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('create-share-link'));
    const shown = await screen.findByTestId('share-error');
    expect(shown).toHaveTextContent('Could not create the link.');
    expect(shown).not.toHaveTextContent('403');
  });

  it('lists the members the document reports, with their roles', async () => {
    drawShareDialogAsEditor([
      { userId: 'ada', role: 'edit' },
      { userId: 'grace', role: 'view' },
    ]);

    const row = await screen.findByTestId('live-member-grace');
    expect(row).toHaveTextContent('grace');
    expect(within(row).getByRole('radio', { name: 'View' })).toBeChecked();
    expect(within(screen.getByTestId('live-member-ada')).getByRole('radio', { name: 'Edit' })).toBeChecked();
    expect(fetchMock.mock.calls[0][0]).toBe('/agora/documents/doc-1');
  });

  it('adds a member by user id and reloads the list', async () => {
    drawShareDialogAsEditor([{ userId: 'ada', role: 'edit' }]);
    await screen.findByTestId('live-member-ada');
    fetchMock.mockResolvedValueOnce(noContentResponse());
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        documentDetail([
          { userId: 'ada', role: 'edit' },
          { userId: 'grace', role: 'edit' },
        ]),
      ),
    );

    fireEvent.change(screen.getByTestId('new-member-id'), { target: { value: ' grace ' } });
    fireEvent.click(within(screen.getByTestId('new-member-role')).getByText('Edit'));
    fireEvent.click(screen.getByTestId('add-member'));

    expect(await screen.findByTestId('live-member-grace')).toBeInTheDocument();
    const put = requestTo('/agora/documents/doc-1/members/grace');
    expect(put.method).toBe('PUT');
    expect(put.body).toBe(JSON.stringify({ role: 'edit' }));
    // the members read, the feeds read, the PUT, and the members read again
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('removes a member and reloads the list', async () => {
    drawShareDialogAsEditor([
      { userId: 'ada', role: 'edit' },
      { userId: 'grace', role: 'view' },
    ]);
    await screen.findByTestId('live-member-grace');
    fetchMock.mockResolvedValueOnce(noContentResponse());
    fetchMock.mockResolvedValueOnce(jsonResponse(documentDetail([{ userId: 'ada', role: 'edit' }])));

    fireEvent.click(screen.getByLabelText('Remove grace'));

    await waitFor(() => expect(screen.queryByTestId('live-member-grace')).not.toBeInTheDocument());
    expect(requestTo('/agora/documents/doc-1/members/grace').method).toBe('DELETE');
  });

  it('shows the refusal when the last editor cannot be demoted', async () => {
    drawShareDialogAsEditor([{ userId: 'ada', role: 'edit' }]);
    const row = await screen.findByTestId('live-member-ada');
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: 'the last editor cannot be demoted' }, 400),
    );

    fireEvent.click(within(row).getByText('View'));

    expect(await screen.findByTestId('live-member-error')).toHaveTextContent(
      'the last editor cannot be demoted',
    );
    expect(within(screen.getByTestId('live-member-ada')).getByRole('radio', { name: 'Edit' })).toBeChecked();
  });

  it('shows no members section to a share link guest', async () => {
    useAuthStore.setState({ token: null });
    useLiveStore.setState({ documentId: 'doc-1', role: 'view', guest: true });
    draw(<LiveShareDialog documentId="doc-1" opened onClose={() => {}} />);

    await waitFor(() => expect(screen.getByTestId('create-share-link')).toBeInTheDocument());
    expect(screen.queryByTestId('live-members')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows no members section to a signed in user who joined by edit link', async () => {
    useAuthStore.setState({ token: 'jwt-token' });
    useLiveStore.setState({ documentId: 'doc-1', role: 'edit', guest: true });
    draw(<LiveShareDialog documentId="doc-1" opened onClose={() => {}} />);

    await waitFor(() => expect(screen.getByTestId('create-share-link')).toBeInTheDocument());
    expect(screen.queryByTestId('live-members')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
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
    expect(useLiveStore.getState().guest).toBe(true);
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

  describe('the asset time bar', () => {
    const AT = '2026-08-25T09:00:00.000Z';
    const LATER = '2026-08-25T09:30:00.000Z';

    const RULE: AssetRule = {
      layerId: 'twin-assets',
      kind: 'temperature',
      breakpoints: [{ value: 0, color: '#2ecc71' }],
      defaultColor: '#95a5a6',
      offlineColor: '#7f8c8d',
    };

    const snapshotAt = (value: number) => ({
      assets: [
        {
          asset: 'TWIN-03',
          feed: 'feed-1',
          online: true,
          values: [{ kind: 'temperature', value, at: AT }],
        },
      ],
    });

    const historyCalls = () =>
      fetchMock.mock.calls.filter(([url]) => String(url).includes('/assets/at?t='));

    const drawBarWithRule = () => {
      useLiveStore.setState({
        documentId: 'doc-1',
        role: 'edit',
        document: { ...emptyLiveDocument(), assets: { rule: RULE } },
      });
      draw(<AssetTimeBar />);
    };

    const typeMoment = (moment: string) =>
      fireEvent.change(screen.getByTestId('asset-time-input'), { target: { value: moment } });

    beforeEach(() => {
      useAssetStateStore.getState().clear();
    });

    it('stays out of the way until a live document carries the rule', () => {
      useLiveStore.setState({ documentId: 'doc-1', document: emptyLiveDocument() });
      draw(<AssetTimeBar />);
      expect(screen.queryByTestId('asset-time-bar')).not.toBeInTheDocument();

      act(() => {
        useLiveStore.setState({
          document: { ...emptyLiveDocument(), assets: { rule: RULE } },
        });
      });
      expect(screen.getByTestId('asset-time-bar')).toBeInTheDocument();
    });

    it('asks once for the moment the typing settled on, and goes back to live', async () => {
      drawBarWithRule();
      fetchMock.mockResolvedValueOnce(jsonResponse(snapshotAt(21)));

      typeMoment(AT);
      typeMoment(LATER);

      await waitFor(() => expect(useAssetStateStore.getState().historyAt).toBe(LATER));
      expect(historyCalls()).toHaveLength(1);
      expect(historyCalls()[0][0]).toBe(
        `/agora/documents/doc-1/assets/at?t=${encodeURIComponent(LATER)}`,
      );
      expect(screen.getByTestId('asset-time-label')).toHaveTextContent(
        new Date(LATER).toLocaleString(),
      );

      fireEvent.click(screen.getByTestId('asset-time-live'));
      expect(useAssetStateStore.getState().historyAt).toBeNull();
      expect(screen.getByTestId('asset-time-label')).toHaveTextContent('Live');
    });

    it('drops an answer to a moment that is no longer the one asked for', async () => {
      drawBarWithRule();
      const answers: Array<(response: Response) => void> = [];
      fetchMock.mockImplementation(
        () => new Promise<Response>((resolve) => answers.push(resolve)),
      );

      typeMoment(AT);
      await waitFor(() => expect(historyCalls()).toHaveLength(1));
      typeMoment(LATER);
      await waitFor(() => expect(historyCalls()).toHaveLength(2));

      answers[1](jsonResponse(snapshotAt(31)));
      await waitFor(() => expect(useAssetStateStore.getState().historyAt).toBe(LATER));

      // the first moment answers last, and the map must not fall back to it
      answers[0](jsonResponse(snapshotAt(21)));
      await act(async () => {
        await new Promise((settle) => setTimeout(settle, 0));
      });
      expect(useAssetStateStore.getState().historyAt).toBe(LATER);
      expect(useAssetStateStore.getState().history?.['TWIN-03'].values.temperature.value).toBe(31);
    });
  });
});
