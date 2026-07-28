import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { deleteBackendSession, renameBackendSession } from '../lib/agentSessions';
import type { UiSpec } from '../viewer/uiSpec';
import type { ViewerCommand } from '../viewer/commands';

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  /** Map spec this reply rendered, kept so the reply can be replayed later. */
  mapSpec?: UiSpec;
  /** Viewer commands this reply ran (fly_to etc.), in order, for replay. */
  viewerCmds?: ViewerCommand[];
  /** Run error text, kept separate so it never overwrites streamed content. */
  error?: string;
}

export interface Session {
  id: string;
  name: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  /**
   * sibyl session this one runs against, attached on the first send. Sessions
   * persisted before this existed, and fresh ones, simply have none yet.
   */
  backendId?: string;
}

interface ChatState {
  sessions: Session[];
  activeSessionId: string | null;
  streaming: boolean;

  // Session management
  createSession: (name?: string) => string;
  deleteSession: (id: string) => void;
  renameSession: (id: string, name: string) => void;
  setActiveSession: (id: string) => void;
  setBackendId: (id: string, backendId: string) => void;

  // Messages
  addMessage: (msg: Omit<Message, 'id' | 'timestamp'>) => void;
  appendToLast: (content: string) => void;
  setLastContent: (content: string) => void;
  setLastError: (error: string) => void;
  setLastMapSpec: (mapSpec: UiSpec) => void;
  addLastViewerCmd: (cmd: ViewerCommand) => void;
  clearMessages: () => void;

  // Streaming state
  setStreaming: (v: boolean) => void;

  // Computed
  activeSession: () => Session | undefined;
  activeMessages: () => Message[];
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeSessionId: null,
      streaming: false,

      createSession: (name) => {
        const id = crypto.randomUUID();
        const session: Session = {
          id,
          name: name || `Session ${get().sessions.length + 1}`,
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        set((s) => ({
          sessions: [...s.sessions, session],
          activeSessionId: id,
        }));
        return id;
      },

      deleteSession: (id) => {
        const removed = get().sessions.find((sess) => sess.id === id);
        set((s) => {
          const sessions = s.sessions.filter((sess) => sess.id !== id);
          const activeSessionId =
            s.activeSessionId === id
              ? sessions[0]?.id ?? null
              : s.activeSessionId;
          return { sessions, activeSessionId };
        });
        if (removed?.backendId) {
          void deleteBackendSession(removed.backendId, get().activeSession()?.backendId);
        }
      },

      renameSession: (id, name) => {
        const backendId = get().sessions.find((sess) => sess.id === id)?.backendId;
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id === id ? { ...sess, name, updatedAt: Date.now() } : sess,
          ),
        }));
        if (backendId) void renameBackendSession(backendId, name);
      },

      setActiveSession: (id) => set({ activeSessionId: id }),

      setBackendId: (id, backendId) =>
        set((s) => ({
          sessions: s.sessions.map((sess) => (sess.id === id ? { ...sess, backendId } : sess)),
        })),

      addMessage: (msg) =>
        set((s) => {
          const full: Message = {
            ...msg,
            id: crypto.randomUUID(),
            timestamp: Date.now(),
          };
          return {
            sessions: s.sessions.map((sess) =>
              sess.id === s.activeSessionId
                ? {
                    ...sess,
                    messages: [...sess.messages, full],
                    updatedAt: Date.now(),
                  }
                : sess,
            ),
          };
        }),

      appendToLast: (content) =>
        set((s) => ({
          sessions: s.sessions.map((sess) => {
            if (sess.id !== s.activeSessionId) return sess;
            const msgs = [...sess.messages];
            const last = msgs[msgs.length - 1];
            if (last && last.role === 'assistant') {
              msgs[msgs.length - 1] = {
                ...last,
                content: last.content + content,
              };
            }
            return { ...sess, messages: msgs, updatedAt: Date.now() };
          }),
        })),

      setLastContent: (content) =>
        set((s) => ({
          sessions: s.sessions.map((sess) => {
            if (sess.id !== s.activeSessionId) return sess;
            const msgs = [...sess.messages];
            const last = msgs[msgs.length - 1];
            if (last && last.role === 'assistant') {
              msgs[msgs.length - 1] = { ...last, content };
            }
            return { ...sess, messages: msgs, updatedAt: Date.now() };
          }),
        })),

      setLastError: (error) =>
        set((s) => ({
          sessions: s.sessions.map((sess) => {
            if (sess.id !== s.activeSessionId) return sess;
            const msgs = [...sess.messages];
            const last = msgs[msgs.length - 1];
            if (last && last.role === 'assistant') {
              msgs[msgs.length - 1] = { ...last, error };
            }
            return { ...sess, messages: msgs, updatedAt: Date.now() };
          }),
        })),

      setLastMapSpec: (mapSpec) =>
        set((s) => ({
          sessions: s.sessions.map((sess) => {
            if (sess.id !== s.activeSessionId) return sess;
            const msgs = [...sess.messages];
            const last = msgs[msgs.length - 1];
            if (last && last.role === 'assistant') {
              msgs[msgs.length - 1] = { ...last, mapSpec };
            }
            return { ...sess, messages: msgs, updatedAt: Date.now() };
          }),
        })),

      addLastViewerCmd: (cmd) =>
        set((s) => ({
          sessions: s.sessions.map((sess) => {
            if (sess.id !== s.activeSessionId) return sess;
            const msgs = [...sess.messages];
            const last = msgs[msgs.length - 1];
            if (last && last.role === 'assistant') {
              msgs[msgs.length - 1] = {
                ...last,
                viewerCmds: [...(last.viewerCmds ?? []), cmd],
              };
            }
            return { ...sess, messages: msgs, updatedAt: Date.now() };
          }),
        })),

      clearMessages: () =>
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id === s.activeSessionId
              ? { ...sess, messages: [], updatedAt: Date.now() }
              : sess,
          ),
        })),

      setStreaming: (streaming) => set({ streaming }),

      activeSession: () => {
        const s = get();
        return s.sessions.find((sess) => sess.id === s.activeSessionId);
      },

      activeMessages: () => {
        const s = get();
        const session = s.sessions.find(
          (sess) => sess.id === s.activeSessionId,
        );
        return session?.messages ?? [];
      },
    }),
    {
      name: 'viewtopia-chat',
      partialize: (state) => ({
        sessions: state.sessions,
        activeSessionId: state.activeSessionId,
      }),
    },
  ),
);
