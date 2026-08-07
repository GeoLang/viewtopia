import { create } from 'zustand';
import { getAuthToken } from '../features/auth/store';
import { LiveSocket, type LiveConnectionState } from './socket';
import {
  applyDocumentKey,
  emptyLiveDocument,
  type LiveDocument,
  type LivePeer,
  type LivePresence,
  type LiveRole,
  type ServerMessage,
} from './types';

const PRESENCE_INTERVAL_MS = 100;

export interface PendingOperation {
  clientSeq: number;
  key: string;
  value: unknown;
}

export interface ConnectOptions {
  documentId: string;
  token?: string;
  role?: LiveRole;
}

interface LiveState {
  connection: LiveConnectionState;
  documentId: string | null;
  role: LiveRole;
  seq: number;
  document: LiveDocument;
  peers: LivePeer[];
  presence: Record<string, LivePresence>;
  pending: Record<number, PendingOperation>;
  error: string | null;

  connect: (options: ConnectOptions) => void;
  disconnect: () => void;
  sendOperation: (key: string, value: unknown) => void;
  sendPresence: (presence: LivePresence) => void;
  receive: (message: ServerMessage) => void;
}

let socket: LiveSocket | null = null;
let clientSeqCounter = 0;
let presenceTimer: ReturnType<typeof setTimeout> | null = null;
let latestPresence: LivePresence | null = null;

function dropPresence(): void {
  if (presenceTimer !== null) clearTimeout(presenceTimer);
  presenceTimer = null;
  latestPresence = null;
}

function pendingInOrder(pending: Record<number, PendingOperation>): PendingOperation[] {
  return Object.values(pending).sort((left, right) => left.clientSeq - right.clientSeq);
}

export const useLiveStore = create<LiveState>((set, get) => ({
  connection: 'idle',
  documentId: null,
  role: 'edit',
  seq: 0,
  document: emptyLiveDocument(),
  peers: [],
  presence: {},
  pending: {},
  error: null,

  connect: ({ documentId, token, role = 'edit' }) => {
    if (get().documentId !== null) get().disconnect();
    clientSeqCounter = 0;
    set({
      documentId,
      role,
      connection: 'connecting',
      seq: 0,
      document: emptyLiveDocument(),
      peers: [],
      presence: {},
      pending: {},
      error: null,
    });
    socket = new LiveSocket({
      documentId,
      token: token ?? getAuthToken() ?? '',
      lastSeq: () => get().seq,
      onMessage: (message) => get().receive(message),
      onStateChange: (connection) => {
        set({ connection });
        if (connection !== 'open') {
          dropPresence();
          return;
        }
        // unacked local edits may never have reached the server, so offer them again
        for (const operation of pendingInOrder(get().pending)) {
          socket?.send({ type: 'op', ...operation });
        }
      },
    });
    socket.connect();
  },

  disconnect: () => {
    dropPresence();
    socket?.close();
    socket = null;
    set({
      connection: 'idle',
      documentId: null,
      seq: 0,
      document: emptyLiveDocument(),
      peers: [],
      presence: {},
      pending: {},
    });
  },

  sendOperation: (key, value) => {
    const { documentId, role } = get();
    if (documentId === null || role !== 'edit') return;
    clientSeqCounter += 1;
    const operation: PendingOperation = { clientSeq: clientSeqCounter, key, value };
    set((state) => ({
      document: applyDocumentKey(state.document, key, value),
      pending: { ...state.pending, [operation.clientSeq]: operation },
    }));
    socket?.send({ type: 'op', ...operation });
  },

  sendPresence: (presence) => {
    latestPresence = presence;
    if (presenceTimer !== null) return;
    presenceTimer = setTimeout(() => {
      presenceTimer = null;
      const outgoing = latestPresence;
      latestPresence = null;
      if (outgoing && get().connection === 'open') socket?.send({ type: 'presence', ...outgoing });
    }, PRESENCE_INTERVAL_MS);
  },

  receive: (message) => {
    switch (message.type) {
      case 'snapshot':
        set((state) => {
          let document: LiveDocument = { ...emptyLiveDocument(), ...message.state };
          for (const operation of pendingInOrder(state.pending)) {
            document = applyDocumentKey(document, operation.key, operation.value);
          }
          return { document, seq: message.seq };
        });
        return;
      case 'op':
        set((state) => ({
          document: applyDocumentKey(state.document, message.key, message.value),
          seq: Math.max(state.seq, message.seq),
        }));
        return;
      case 'ack':
        set((state) => {
          const acked = state.pending[message.clientSeq];
          const pending = { ...state.pending };
          delete pending[message.clientSeq];
          // the ack places our edit after everything already applied, so restate it
          const document = acked
            ? applyDocumentKey(state.document, acked.key, acked.value)
            : state.document;
          return { document, pending, seq: Math.max(state.seq, message.seq) };
        });
        return;
      case 'peers':
        set((state) => {
          const actors = new Set(message.peers.map((peer) => peer.actor));
          const presence = Object.fromEntries(
            Object.entries(state.presence).filter(([actor]) => actors.has(actor)),
          );
          return { peers: message.peers, presence };
        });
        return;
      case 'presence':
        set((state) => ({
          presence: {
            ...state.presence,
            [message.actor]: {
              cursor: message.cursor,
              selection: message.selection,
              viewport: message.viewport,
            },
          },
        }));
        return;
      case 'error':
        set({ error: message.reason });
        return;
    }
  },
}));

export function isLiveDocumentActive(): boolean {
  return useLiveStore.getState().documentId !== null;
}

export function canEditLiveDocument(): boolean {
  const { documentId, role } = useLiveStore.getState();
  return documentId !== null && role === 'edit';
}
