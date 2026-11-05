import { render } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import type { ReactNode } from 'react';
import { vi } from 'vitest';
import { useLiveStore } from '../../../src/live/liveStore';
import { emptyLiveDocument, type LiveComment, type LiveRole } from '../../../src/live/types';
import type { FakeAgoraServer } from './fakeAgoraServer';

export const OWN_ACTOR = 'ada';

export function stubMantineBrowserGlobals() {
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
}

export function draw(ui: ReactNode) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function comment(overrides: Partial<LiveComment> = {}): LiveComment {
  return {
    id: 'root-1',
    actor: OWN_ACTOR,
    authorName: 'Ada Lovelace',
    text: 'is this the right coastline',
    createdAt: 10,
    resolved: false,
    ...overrides,
  };
}

export function joinWith(server: FakeAgoraServer, comments: LiveComment[], role: LiveRole = 'edit') {
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
