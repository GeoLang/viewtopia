import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useAppStore } from '../../store/app';

/** A catalog the user saved, or one collection inside it. */
export interface StacFavorite {
  catalogUrl: string;
  /** null for the catalog itself */
  collectionId: string | null;
  title: string;
}

export function favoriteKey(catalogUrl: string, collectionId: string | null): string {
  return `${catalogUrl}|${collectionId ?? ''}`;
}

interface StacState {
  favorites: StacFavorite[];
  /** the asset href the browser handed to the raster analysis panel */
  rasterAnalysisUrl: string;
  toggleFavorite: (favorite: StacFavorite) => void;
  removeFavorite: (key: string) => void;
  openInRasterAnalysis: (href: string) => void;
}

export const useStacStore = create<StacState>()(
  persist(
    (set, get) => ({
      favorites: [],
      rasterAnalysisUrl: '',

      toggleFavorite: (favorite) => {
        const key = favoriteKey(favorite.catalogUrl, favorite.collectionId);
        const favorites = get().favorites;
        const known = favorites.some((s) => favoriteKey(s.catalogUrl, s.collectionId) === key);
        set({
          favorites: known
            ? favorites.filter((s) => favoriteKey(s.catalogUrl, s.collectionId) !== key)
            : [...favorites, favorite],
        });
      },

      removeFavorite: (key) =>
        set((s) => ({
          favorites: s.favorites.filter((f) => favoriteKey(f.catalogUrl, f.collectionId) !== key),
        })),

      openInRasterAnalysis: (rasterAnalysisUrl) => {
        set({ rasterAnalysisUrl });
        useAppStore.getState().setActivePanel('rasterViewer');
      },
    }),
    {
      name: 'viewtopia-stac',
      partialize: (state) => ({ favorites: state.favorites }),
    },
  ),
);
