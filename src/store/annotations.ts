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

interface AnnotationState {
  annotations: Annotation[];
  addAnnotation: (annotation: Annotation) => void;
  removeAnnotation: (id: string) => void;
  setAnnotations: (annotations: Annotation[]) => void;
}

export const useAnnotationStore = create<AnnotationState>((set) => ({
  annotations: loadStoredAnnotations(),
  addAnnotation: (annotation) =>
    set((s) => ({ annotations: [...s.annotations, annotation] })),
  removeAnnotation: (id) =>
    set((s) => ({ annotations: s.annotations.filter((a) => a.id !== id) })),
  setAnnotations: (annotations) => set({ annotations }),
}));

// a live session's annotations belong to the document, so they never overwrite
// the annotations this browser owns
useAnnotationStore.subscribe((state, previous) => {
  if (state.annotations === previous.annotations || isLiveDocumentActive()) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.annotations));
});
