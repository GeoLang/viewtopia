import { create } from 'zustand';

/** One property row of a picked 3D Tiles feature. */
export interface FeatureProp {
  id: string;
  value: string;
}

interface FeaturePickerState {
  /** When true, clicking a 3D Tiles feature inspects + highlights it. */
  enabled: boolean;
  /** Properties of the most recently picked feature (null = nothing picked). */
  selected: FeatureProp[] | null;
  toggle: () => void;
  setEnabled: (enabled: boolean) => void;
  setSelected: (selected: FeatureProp[] | null) => void;
}

export const useFeaturePickerStore = create<FeaturePickerState>((set) => ({
  enabled: false,
  selected: null,
  toggle: () =>
    set((s) => ({ enabled: !s.enabled, selected: s.enabled ? null : s.selected })),
  setEnabled: (enabled) => set({ enabled }),
  setSelected: (selected) => set({ selected }),
}));
