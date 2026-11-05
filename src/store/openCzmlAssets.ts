import { create } from 'zustand';
import type { CzmlDataSource, Viewer } from 'cesium';

interface OpenCzmlAsset {
  viewer: Viewer;
  dataSource: CzmlDataSource;
}

interface OpenCzmlAssetState {
  openAssets: Record<string, OpenCzmlAsset>;
  putOpenAsset: (assetId: string, openAsset: OpenCzmlAsset) => void;
  closeAsset: (assetId: string) => void;
}

export const useOpenCzmlAssetStore = create<OpenCzmlAssetState>((set, get) => ({
  openAssets: {},

  putOpenAsset: (assetId, openAsset) =>
    set((state) => ({ openAssets: { ...state.openAssets, [assetId]: openAsset } })),

  closeAsset: (assetId) => {
    const { [assetId]: closing, ...stillOpen } = get().openAssets;
    if (!closing) return;
    if (!closing.viewer.isDestroyed()) closing.viewer.dataSources.remove(closing.dataSource, true);
    set({ openAssets: stillOpen });
  },
}));
