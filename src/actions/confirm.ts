import { create } from 'zustand';
import type { ActionArguments } from './registry';

/** A destructive action waiting for a confirming reply in the chat. */
export interface PendingAction {
  name: string;
  args: ActionArguments;
}

interface ConfirmState {
  pending: PendingAction | null;
  setPending: (pending: PendingAction | null) => void;
}

export const useConfirmStore = create<ConfirmState>((set) => ({
  pending: null,
  setPending: (pending) => set({ pending }),
}));
