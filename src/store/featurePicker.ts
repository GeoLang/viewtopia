import { create } from 'zustand';
import { useAppStore } from './app';

/** One property row of a picked feature. */
export interface FeatureProp {
  id: string;
  value: string;
}

export const toRow = (id: string, val: unknown): FeatureProp => ({
  id,
  value: typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val),
});

/** Flatten a feature's property bag into display rows. */
export function propsToRows(bag: Record<string, unknown>): FeatureProp[] {
  return Object.entries(bag).map(([id, val]) => toRow(id, val));
}

interface FeaturePickerState {
  /** When true, clicking a 3D Tiles feature inspects + highlights it. */
  enabled: boolean;
  /** Properties of the most recently picked feature (null = nothing picked). */
  selected: FeatureProp[] | null;
  /** Pointer is over a pickable feature; read by the deck overlay's getCursor. */
  hovering: boolean;
  toggle: () => void;
  setEnabled: (enabled: boolean) => void;
  setSelected: (selected: FeatureProp[] | null) => void;
  setHovering: (hovering: boolean) => void;
}

export const useFeaturePickerStore = create<FeaturePickerState>((set) => ({
  enabled: false,
  selected: null,
  hovering: false,
  toggle: () =>
    set((s) => ({ enabled: !s.enabled, selected: s.enabled ? null : s.selected })),
  setEnabled: (enabled) => set((s) => ({ enabled, hovering: enabled && s.hovering })),
  setHovering: (hovering) => set({ hovering }),
  setSelected: (selected) => {
    // The properties only render inside the picker panel, so a pick made while
    // it's closed would be invisible.
    if (selected) useAppStore.getState().setActivePanel('featurePicker');
    set({ selected });
  },
}));
