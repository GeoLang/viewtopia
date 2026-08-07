import { create } from 'zustand';
import { isLiveDocumentActive } from '../live/liveStore';

export interface Annotation {
  id: string;
  label: string;
  color: string;
  lat: number;
  lng: number;
  createdAt: number;
}

const STORAGE_KEY = 'viewtopia-annotations';

export function loadStoredAnnotations(): Annotation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Annotation[]) : [];
  } catch {
    return [];
  }
}

/** The label and color a click on the map is about to turn into an annotation. */
export interface PendingPlacement {
  label: string;
  color: string;
}

interface AnnotationState {
  annotations: Annotation[];
  pendingPlacement: PendingPlacement | null;
  addAnnotation: (annotation: Annotation) => void;
  removeAnnotation: (id: string) => void;
  setAnnotations: (annotations: Annotation[]) => void;
  startPlacement: (label: string, color: string) => void;
  cancelPlacement: () => void;
  placePendingAnnotation: (lng: number, lat: number) => void;
}

export const useAnnotationStore = create<AnnotationState>((set) => ({
  annotations: loadStoredAnnotations(),
  pendingPlacement: null,
  addAnnotation: (annotation) =>
    set((s) => ({ annotations: [...s.annotations, annotation] })),
  removeAnnotation: (id) =>
    set((s) => ({ annotations: s.annotations.filter((a) => a.id !== id) })),
  setAnnotations: (annotations) => set({ annotations }),
  startPlacement: (label, color) => set({ pendingPlacement: { label, color } }),
  cancelPlacement: () => set({ pendingPlacement: null }),
  placePendingAnnotation: (lng, lat) =>
    set((s) => {
      if (!s.pendingPlacement) return s;
      const annotation: Annotation = {
        id: crypto.randomUUID(),
        label: s.pendingPlacement.label,
        color: s.pendingPlacement.color,
        lat,
        lng,
        createdAt: Date.now(),
      };
      return { annotations: [...s.annotations, annotation], pendingPlacement: null };
    }),
}));

// a live session's annotations belong to the document, so they never overwrite
// the annotations this browser owns
useAnnotationStore.subscribe((state, previous) => {
  if (state.annotations === previous.annotations || isLiveDocumentActive()) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.annotations));
});
