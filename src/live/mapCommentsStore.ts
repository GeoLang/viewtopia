import { create } from 'zustand';

export interface MapCommentDraft {
  lng: number;
  lat: number;
}

/** What the map overlay has open: at most one compose box or one thread box. */
interface MapCommentsState {
  draft: MapCommentDraft | null;
  openThreadId: string | null;
  openDraft: (lng: number, lat: number) => void;
  closeDraft: () => void;
  openThread: (threadId: string) => void;
  closeThread: () => void;
}

export const useMapCommentsStore = create<MapCommentsState>((set) => ({
  draft: null,
  openThreadId: null,
  openDraft: (lng, lat) => set({ draft: { lng, lat }, openThreadId: null }),
  closeDraft: () => set({ draft: null }),
  openThread: (threadId) => set({ openThreadId: threadId, draft: null }),
  closeThread: () => set({ openThreadId: null }),
}));
