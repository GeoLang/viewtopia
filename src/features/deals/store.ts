import { create } from 'zustand';
import type { Deal } from './deal';

interface DealState {
  deal: Deal | null;
  setDeal: (deal: Deal | null) => void;
}

export const useDealStore = create<DealState>((set) => ({
  deal: null,
  setDeal: (deal) => set({ deal }),
}));
