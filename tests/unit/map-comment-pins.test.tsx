import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import type { MutableRefObject, ReactNode } from 'react';
import type { Viewer } from 'cesium';
import type { Map as LeafletMap } from 'leaflet';
import type { Map as MapLibreMap } from 'maplibre-gl';

vi.mock('cesium', () => ({
  Cartesian3: { fromDegrees: () => ({}) },
  SceneTransforms: { worldToWindowCoordinates: () => undefined },
}));

import { ContextMenu } from '../../src/components/ContextMenu';
import { useAuthStore } from '../../src/features/auth/store';
import { setSharedCamera } from '../../src/hooks/sharedCamera';
import { useLiveStore } from '../../src/live/liveStore';
import { MapCommentsOverlay } from '../../src/live/MapCommentsOverlay';
import { useMapCommentsStore } from '../../src/live/mapCommentsStore';
import { emptyLiveDocument, type LiveComment, type LiveRole } from '../../src/live/types';
import { useAppStore } from '../../src/store/app';
import { FakeAgoraServer } from './stubs/fakeAgoraServer';

const OWN_ACTOR = 'ada';

/** a maplibre stand-in that projects a point per degree, so pins land apart */
const maplibreRef = {
  current: {
    project: ([lng, lat]: [number, number]) => ({ x: 100 + lng, y: 100 + lat }),
    on: () => {},
    off: () => {},
  },
} as unknown as MutableRefObject<MapLibreMap | null>;

const cesiumRef = { current: null } as MutableRefObject<Viewer | null>;
const leafletRef = { current: null } as MutableRefObject<LeafletMap | null>;

function overlay() {
  return (
    <MapCommentsOverlay
      cesiumRef={cesiumRef}
      maplibreRef={maplibreRef}
      leafletRef={leafletRef}
    />
  );
}

function comment(overrides: Partial<LiveComment> = {}): LiveComment {
  return {
    id: 'root-1',
    actor: OWN_ACTOR,
    authorName: 'Ada Lovelace',
    text: 'is this the right coastline',
    createdAt: 10,
    resolved: false,
    anchor: { lng: 7.4, lat: 43.7, zoom: 11, placed: true },
    ...overrides,
  };
}

function draw(ui: ReactNode) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

let server: FakeAgoraServer;

function joinWith(comments: LiveComment[], role: LiveRole = 'edit') {
  server.document = {
    ...emptyLiveDocument('coastline'),
    comments: Object.fromEntries(comments.map((entry) => [entry.id, entry])),
  };
  useLiveStore.getState().connect({ documentId: 'doc-1', token: 'jwt-token', role });
  const connection = server.connection;
  connection.acceptHandshake();
  connection.deliver({ type: 'snapshot', seq: 0, state: server.document, actor: OWN_ACTOR, role });
  server.sendPeers([{ actor: OWN_ACTOR, name: 'Ada Lovelace', role }]);
  return connection;
}

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
  server = new FakeAgoraServer();
  server.install();
  useAuthStore.setState({ user: null, token: 'jwt-token' });
  setSharedCamera({ longitude: 0, latitude: 20, zoom: 2 });
  useAppStore.setState({ activeTab: 'globe', renderer: 'maplibre', contextMenu: null });
  useMapCommentsStore.setState({ draft: null, openThreadId: null });
});

afterEach(() => {
  cleanup();
  useLiveStore.getState().disconnect();
  useAuthStore.setState({ user: null, token: null });
  useAppStore.setState({ contextMenu: null });
  useMapCommentsStore.setState({ draft: null, openThreadId: null });
  server.restore();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('map comment pins', () => {
  it('draws a pin for every unresolved placed thread and nothing else', () => {
    joinWith([
      comment(),
      comment({ id: 'root-2', createdAt: 20, anchor: { lng: 8, lat: 44, zoom: 11, placed: true } }),
      comment({ id: 'resolved', createdAt: 30, resolved: true }),
      comment({ id: 'camera', createdAt: 40, anchor: { lng: 1, lat: 2, zoom: 5 } }),
      comment({ id: 'plain', createdAt: 50, anchor: null }),
    ]);
    draw(overlay());

    expect(screen.getAllByTestId('comment-pin')).toHaveLength(2);
  });

  it('draws nothing outside a live session', () => {
    draw(overlay());
    expect(screen.queryByTestId('map-comments-overlay')).not.toBeInTheDocument();
  });

  it('posts a placed comment at the point the context menu was opened on', () => {
    const connection = joinWith([]);
    useAppStore.getState().showContextMenu({ x: 40, y: 60, lat: 43.7, lng: 7.4 });
    draw(
      <>
        <ContextMenu />
        {overlay()}
      </>,
    );

    fireEvent.click(screen.getByText('Comment here'));
    fireEvent.change(screen.getByLabelText('Comment on this spot'), {
      target: { value: 'the coastline is wrong here' },
    });
    fireEvent.click(screen.getByTestId('map-comment-submit'));

    const [sent] = connection.operationsSent;
    expect(sent.value).toMatchObject({
      text: 'the coastline is wrong here',
      anchor: { lng: 7.4, lat: 43.7, zoom: 2, placed: true },
    });
    expect(screen.queryByLabelText('Comment on this spot')).not.toBeInTheDocument();
  });

  it('opens the thread on a pin click and replies into it', () => {
    const connection = joinWith([comment()]);
    draw(overlay());

    expect(screen.queryByText('is this the right coastline')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('comment-pin'));
    expect(screen.getByText('is this the right coastline')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reply' }));
    fireEvent.change(screen.getByLabelText('Reply to Ada Lovelace'), {
      target: { value: 'checked, it is' },
    });
    fireEvent.click(screen.getByTestId('comment-reply-submit'));

    expect(connection.operationsSent[0].value).toMatchObject({
      parentId: 'root-1',
      text: 'checked, it is',
    });
  });

  it('closes the thread box on its close button', () => {
    joinWith([comment()]);
    draw(overlay());

    fireEvent.click(screen.getByTestId('comment-pin'));
    fireEvent.click(screen.getByLabelText('Close comment thread'));
    expect(screen.queryByText('is this the right coastline')).not.toBeInTheDocument();
  });
});

describe('comment here context menu action', () => {
  beforeEach(() => {
    useAppStore.getState().showContextMenu({ x: 40, y: 60, lat: 43.7, lng: 7.4 });
  });

  it('is offered in a live edit session', () => {
    joinWith([]);
    draw(<ContextMenu />);
    expect(screen.getByText('Comment here')).toBeInTheDocument();
  });

  it('is withheld from a view role', () => {
    joinWith([], 'view');
    draw(<ContextMenu />);
    expect(screen.queryByText('Comment here')).not.toBeInTheDocument();
  });

  it('is withheld outside a live session', () => {
    draw(<ContextMenu />);
    expect(screen.queryByText('Comment here')).not.toBeInTheDocument();
  });
});
