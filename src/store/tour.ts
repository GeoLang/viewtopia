import { create } from 'zustand';

interface TourState {
  /** current step index, null while the tour is inactive */
  step: number | null;
  start: () => void;
  stop: () => void;
  setStep: (step: number) => void;
}

export const useTourStore = create<TourState>((set) => ({
  step: null,
  start: () => set({ step: 0 }),
  stop: () => set({ step: null }),
  setStep: (step) => set({ step }),
}));
