import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AccessibilityState {
  highContrast: boolean;
  largeText: boolean;
  reduceMotion: boolean;
  setHighContrast: (v: boolean) => void;
  setLargeText: (v: boolean) => void;
  setReduceMotion: (v: boolean) => void;
}

// applies the current flags to the document root; camera code reads reduceMotion.
function applyToDocument(s: {
  highContrast: boolean;
  largeText: boolean;
  reduceMotion: boolean;
}) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle('a11y-high-contrast', s.highContrast);
  root.classList.toggle('a11y-reduce-motion', s.reduceMotion);
  root.style.fontSize = s.largeText ? '20px' : '';
}

export const useAccessibilityStore = create<AccessibilityState>()(
  persist(
    (set, get) => ({
      highContrast: false,
      largeText: false,
      reduceMotion: false,
      setHighContrast: (highContrast) => {
        set({ highContrast });
        applyToDocument(get());
      },
      setLargeText: (largeText) => {
        set({ largeText });
        applyToDocument(get());
      },
      setReduceMotion: (reduceMotion) => {
        set({ reduceMotion });
        applyToDocument(get());
      },
    }),
    {
      name: 'viewtopia-a11y',
      onRehydrateStorage: () => (state) => {
        if (state) applyToDocument(state);
      },
    },
  ),
);

/** Read the reduce-motion flag from non-hook code (camera-moving panels). */
export function reduceMotionEnabled(): boolean {
  return useAccessibilityStore.getState().reduceMotion;
}
