/**
 * PluginHost — React component that renders plugin panels and provides context.
 *
 * Usage in ToolPanels.tsx:
 *   import { PluginPanel } from '../plugins/PluginHost';
 *   // In the switch statement default case:
 *   default:
 *     return <PluginPanel pluginId={activePanel} onClose={close} />;
 */

import { useMemo } from 'react';
import { useAppStore } from '../store/app';
import { useSpaceTimeStore } from '../features/spacetime/store';
import { getPlugin } from './registry';
import type { PluginContext, PluginMapContext, PluginStoreContext, PluginApiContext, PluginSettingsContext } from './sdk';

interface PluginPanelProps {
  pluginId: string;
  onClose: () => void;
}

export function PluginPanel({ pluginId, onClose }: PluginPanelProps) {
  const plugin = getPlugin(pluginId);
  const store = useAppStore();
  const flyTo = useSpaceTimeStore((s) => s.flyTo);

  const ctx: PluginContext = useMemo(() => {
    const mapCtx: PluginMapContext = {
      flyTo: (lng, lat, zoom) => flyTo(lng, lat, zoom ?? 14),
      getCursorCoords: () => store.cursorCoords,
      addGeoJsonLayer: (id, geojson, options) => {
        store.addLayer({
          id,
          name: id,
          type: 'geojson',
          visible: true,
          opacity: options?.opacity ?? 1,
        });
        // Dispatch custom event so renderers can pick up the GeoJSON data
        window.dispatchEvent(
          new CustomEvent('viewtopia:layer:add', { detail: { id, geojson, options } })
        );
      },
      removeLayer: (id) => {
        store.removeLayer(id);
        window.dispatchEvent(new CustomEvent('viewtopia:layer:remove', { detail: { id } }));
      },
      fitBounds: (bounds) => {
        const [west, south, east, north] = bounds;
        const lng = (west + east) / 2;
        const lat = (south + north) / 2;
        flyTo(lng, lat, 12);
      },
    };

    const storeCtx: PluginStoreContext = {
      getLayers: () => store.layers,
      getActivePanel: () => store.activePanel,
      getBasemap: () => store.basemap,
      getRenderer: () => store.renderer,
      getSettings: () => store.settings as unknown as Record<string, unknown>,
    };

    const apiCtx: PluginApiContext = {
      fetch: (path, options) => {
        const base = store.settings.tiletopiaUrl || '/api/v1';
        const url = path.startsWith('http') ? path : `${base}${path}`;
        return fetch(url, {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            ...(options?.headers || {}),
          },
        });
      },
      baseUrl: store.settings.tiletopiaUrl || '/api/v1',
    };

    const storageKey = `viewtopia-plugin-settings:${pluginId}`;
    const settingsCtx: PluginSettingsContext = {
      get: <T = unknown>(key: string, defaultValue?: T): T => {
        try {
          const data = JSON.parse(localStorage.getItem(storageKey) || '{}');
          return key in data ? data[key] : (defaultValue as T);
        } catch {
          return defaultValue as T;
        }
      },
      set: (key: string, value: unknown) => {
        try {
          const data = JSON.parse(localStorage.getItem(storageKey) || '{}');
          data[key] = value;
          localStorage.setItem(storageKey, JSON.stringify(data));
        } catch { /* ignore */ }
      },
      getAll: () => {
        try {
          return JSON.parse(localStorage.getItem(storageKey) || '{}');
        } catch {
          return {};
        }
      },
    };

    return { map: mapCtx, store: storeCtx, api: apiCtx, settings: settingsCtx, close: onClose };
  }, [store, flyTo, onClose]);

  if (!plugin) {
    return null;
  }

  const { Panel } = plugin;
  return <Panel ctx={ctx} />;
}
