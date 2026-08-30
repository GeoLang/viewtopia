import { create } from 'zustand';
import { getAuthToken } from '../features/auth/store';
import { useAssetStateStore } from './assetState';
import { nextReversal, operationsFor, stepFor, type HistoryStep } from './history';
import { LiveSocket, type LiveConnectionState } from './socket';
import { useWatchStateStore } from './watchState';
import {
  applyDocumentKey,
  emptyLiveDocument,
  type ClientMessage,
  type LiveDocument,
  type LiveOperation,
  type LivePeer,
  type LivePresence,
  type LiveRole,
  type ServerMessage,
} from './types';

const PRESENCE_INTERVAL_MS = 100;

/** One frame of unacked operations, whether it went out as an op or a batch. */
export interface PendingFrame {
  clientSeq: number;
  operations: LiveOperation[];
}

export interface ConnectOptions {
  documentId: string;
  token?: string;
  role?: LiveRole;
  guest?: boolean;
}

interface LiveState {
  connection: LiveConnectionState;
  documentId: string | null;
  role: LiveRole;
  /**
   * true when this session joined through a share link, so it holds a session
   * token rather than a platform one and the member routes would refuse it
   */
  guest: boolean;
  /** our own id in this session, learnt from the snapshot frame */
  actor: string | null;
  seq: number;
  document: LiveDocument;
  peers: LivePeer[];
  presence: Record<string, LivePresence>;
  /** the peer whose presence viewport the local camera tracks, null when not following */
  followedActor: string | null;
  pending: Record<number, PendingFrame>;
  /** our own applied frames, newest last, each one undo press */
  undoSteps: HistoryStep[];
  /** what we have undone since the last edit of our own, newest last */
  redoSteps: HistoryStep[];
  error: string | null;
  /** lifted here so a mention notification can open the panel from outside it */
  commentsOpen: boolean;
  /** the thread a deep link asked for, until the panel has shown it */
  focusedCommentId: string | null;

  connect: (options: ConnectOptions) => void;
  disconnect: () => void;
  setCommentsOpen: (commentsOpen: boolean) => void;
  focusComment: (commentId: string) => void;
  clearFocusedComment: () => void;
  sendOperation: (key: string, value: unknown) => void;
  sendOperations: (operations: LiveOperation[]) => void;
  undo: () => void;
  redo: () => void;
  sendPresence: (presence: LivePresence) => void;
  setFollowedActor: (actor: string | null) => void;
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

function pendingInOrder(pending: Record<number, PendingFrame>): PendingFrame[] {
  return Object.values(pending).sort((left, right) => left.clientSeq - right.clientSeq);
}

function applyOperations(document: LiveDocument, operations: LiveOperation[]): LiveDocument {
  return operations.reduce(
    (applied, operation) => applyDocumentKey(applied, operation.key, operation.value),
    document,
  );
}

/**
 * Whether the server has ordered everything we sent. Taking back an op it has
 * not applied yet races that ordering, so undo waits for this.
 */
function settled(state: LiveState): boolean {
  return Object.keys(state.pending).length === 0;
}

/** One operation goes out as an op and several as a batch. */
function frameFor(frame: PendingFrame): ClientMessage {
  const [single] = frame.operations;
  if (frame.operations.length === 1) {
    return { type: 'op', clientSeq: frame.clientSeq, key: single.key, value: single.value };
  }
  return { type: 'batch', clientSeq: frame.clientSeq, ops: frame.operations };
}

/** Where a frame leaves the history stacks, read off the document it applied to. */
type HistoryUpdate = (state: LiveState) => Pick<LiveState, 'undoSteps' | 'redoSteps'>;

/** Apply a frame of our own, send it, and move the history stacks with it. */
function applyLocalFrame(operations: LiveOperation[], history: HistoryUpdate): void {
  const { documentId, role } = useLiveStore.getState();
  if (documentId === null || role !== 'edit' || operations.length === 0) return;
  clientSeqCounter += 1;
  const frame: PendingFrame = { clientSeq: clientSeqCounter, operations };
  useLiveStore.setState((state) => ({
    document: applyOperations(state.document, operations),
    pending: { ...state.pending, [frame.clientSeq]: frame },
    ...history(state),
  }));
  socket?.send(frameFor(frame));
}

export const useLiveStore = create<LiveState>((set, get) => ({
  connection: 'idle',
  documentId: null,
  role: 'edit',
  guest: false,
  actor: null,
  seq: 0,
  document: emptyLiveDocument(),
  peers: [],
  presence: {},
  followedActor: null,
  pending: {},
  undoSteps: [],
  redoSteps: [],
  error: null,
  commentsOpen: false,
  focusedCommentId: null,

  connect: ({ documentId, token, role = 'edit', guest = false }) => {
    // an empty subprotocol offer is not a legal one, so without a bearer there
    // is no socket to open. getAuthToken has already said why it is gone.
    const bearer = token ?? getAuthToken();
    if (bearer === null) return;
    if (get().documentId !== null) get().disconnect();
    clientSeqCounter = 0;
    useAssetStateStore.getState().clear();
    useWatchStateStore.getState().clear();
    set({
      documentId,
      role,
      guest,
      actor: null,
      connection: 'connecting',
      seq: 0,
      document: emptyLiveDocument(),
      peers: [],
      presence: {},
      followedActor: null,
      pending: {},
      undoSteps: [],
      redoSteps: [],
      error: null,
    });
    socket = new LiveSocket({
      documentId,
      token: bearer,
      // actor is only ever set by a snapshot, so null means this connection
      // epoch has no state yet and must not claim a since
      sinceForResume: () => (get().actor === null ? null : get().seq),
      onMessage: (message) => get().receive(message),
      onStateChange: (connection) => {
        set({ connection });
        if (connection !== 'open') {
          dropPresence();
          return;
        }
        // unacked local edits may never have reached the server, so offer them again
        for (const frame of pendingInOrder(get().pending)) {
          socket?.send(frameFor(frame));
        }
      },
    });
    socket.connect();
  },

  disconnect: () => {
    dropPresence();
    socket?.close();
    socket = null;
    useAssetStateStore.getState().clear();
    useWatchStateStore.getState().clear();
    set({
      connection: 'idle',
      documentId: null,
      guest: false,
      actor: null,
      seq: 0,
      document: emptyLiveDocument(),
      peers: [],
      presence: {},
      followedActor: null,
      pending: {},
      undoSteps: [],
      redoSteps: [],
      commentsOpen: false,
      focusedCommentId: null,
    });
  },

  setCommentsOpen: (commentsOpen) => set({ commentsOpen }),

  focusComment: (commentId) => set({ focusedCommentId: commentId, commentsOpen: true }),

  clearFocusedComment: () => set({ focusedCommentId: null }),

  sendOperation: (key, value) => {
    get().sendOperations([{ key, value }]);
  },

  sendOperations: (operations) => {
    applyLocalFrame(operations, (state) => ({
      undoSteps: [...state.undoSteps, stepFor(state.document, operations)],
      redoSteps: [],
    }));
  },

  undo: () => {
    const state = get();
    if (!settled(state)) return;
    const taken = nextReversal(state.undoSteps, state.document);
    // every step left was written over whole, so there is nothing to take back
    if (!taken) {
      set({ undoSteps: [] });
      return;
    }
    applyLocalFrame(operationsFor(taken.reversal), () => ({
      undoSteps: taken.remaining,
      redoSteps: [...state.redoSteps, taken.reversal],
    }));
  },

  redo: () => {
    const state = get();
    if (!settled(state)) return;
    const taken = nextReversal(state.redoSteps, state.document);
    if (!taken) {
      set({ redoSteps: [] });
      return;
    }
    applyLocalFrame(operationsFor(taken.reversal), () => ({
      undoSteps: [...state.undoSteps, taken.reversal],
      redoSteps: taken.remaining,
    }));
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

  setFollowedActor: (followedActor) => set({ followedActor }),

  receive: (message) => {
    switch (message.type) {
      case 'snapshot':
        set((state) => {
          let document: LiveDocument = { ...emptyLiveDocument(), ...message.state };
          for (const frame of pendingInOrder(state.pending)) {
            document = applyOperations(document, frame.operations);
          }
          return {
            document,
            seq: message.seq,
            actor: message.actor ?? state.actor,
            // joins that carry no link role (the bell, a comment deep link)
            // learn their member role here rather than assuming edit
            role: message.role ?? state.role,
          };
        });
        return;
      case 'op':
        set((state) => ({
          document: applyDocumentKey(state.document, message.key, message.value),
          seq: Math.max(state.seq, message.seq),
        }));
        return;
      case 'batch':
        set((state) => ({
          document: applyOperations(state.document, message.ops),
          seq: Math.max(state.seq, ...message.ops.map((operation) => operation.seq)),
        }));
        return;
      case 'ack':
        set((state) => {
          const acked = state.pending[message.clientSeq];
          const pending = { ...state.pending };
          delete pending[message.clientSeq];
          // the ack places our edits after everything already applied, so restate them
          const document = acked
            ? applyOperations(state.document, acked.operations)
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
          const following = state.followedActor !== null && actors.has(state.followedActor);
          return {
            peers: message.peers,
            presence,
            followedActor: following ? state.followedActor : null,
          };
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
      case 'readings':
      case 'assets':
      case 'liveness':
        useAssetStateStore.getState().receive(message);
        return;
      case 'watches':
      case 'watchReading':
        useWatchStateStore.getState().receive(message);
        return;
    }
  },
}));

export function isLiveDocumentActive(): boolean {
  return useLiveStore.getState().documentId !== null;
}

/** true when this session joined a live document through a view-role link */
export const useViewOnlyLive = () =>
  useLiveStore((s) => s.documentId !== null && s.role === 'view');

export const useCanUndoLive = () =>
  useLiveStore((s) => s.role === 'edit' && s.undoSteps.length > 0 && settled(s));

export const useCanRedoLive = () =>
  useLiveStore((s) => s.role === 'edit' && s.redoSteps.length > 0 && settled(s));

export function canEditLiveDocument(): boolean {
  const { documentId, role } = useLiveStore.getState();
  return documentId !== null && role === 'edit';
}
