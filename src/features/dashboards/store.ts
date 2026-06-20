import { create } from 'zustand';
import type { Dashboard, WidgetType } from './types';

/**
 * Dashboard builder (ported from vanilla dashboards.js). Configurable widget
 * dashboards persisted to localStorage (`viewtopia_dashboards`). No backend —
 * everything is local.
 */

const LOCAL_KEY = 'viewtopia_dashboards';

function load(): Dashboard[] {
  try {
    const stored = localStorage.getItem(LOCAL_KEY);
    return stored ? (JSON.parse(stored) as Dashboard[]) : [];
  } catch {
    return [];
  }
}

function persist(dashboards: Dashboard[]): void {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(dashboards));
}

function defaultConfig(type: WidgetType): Record<string, unknown> {
  switch (type) {
    case 'indicator':
      return { value: '0', label: 'Count' };
    case 'gauge':
      return { percent: 50 };
    case 'list':
      return { items: [] };
    case 'chart':
      return { chartType: 'bar', data: [] };
    case 'richtext':
      return { html: '<p>Enter text...</p>' };
    case 'map':
      return { center: [0, 0], zoom: 2 };
    default:
      return {};
  }
}

interface DashboardsState {
  dashboards: Dashboard[];
  activeId: string | null;
  refresh: () => void;
  create: () => void;
  open: (id: string) => void;
  back: () => void;
  remove: (id: string) => void;
  renameActive: (title: string) => void;
  addWidget: (type: WidgetType) => void;
  removeWidget: (widgetId: string) => void;
}

/** Save the dashboards array and mirror it into state. */
function commit(set: (p: Partial<DashboardsState>) => void, dashboards: Dashboard[]) {
  persist(dashboards);
  set({ dashboards });
}

export const useDashboardsStore = create<DashboardsState>((set, get) => ({
  dashboards: load(),
  activeId: null,

  refresh: () => set({ dashboards: load() }),

  create: () => {
    const now = new Date().toISOString();
    const dashboard: Dashboard = {
      id: crypto.randomUUID(),
      title: 'Untitled Dashboard',
      description: '',
      widgets: [],
      theme: { background: '#1a1a2e', accent: '#0f3460' },
      created: now,
      modified: now,
    };
    commit(set, [...get().dashboards, dashboard]);
    set({ activeId: dashboard.id });
  },

  open: (id) => set({ activeId: id }),
  back: () => set({ activeId: null }),

  remove: (id) => {
    commit(set, get().dashboards.filter((d) => d.id !== id));
    if (get().activeId === id) set({ activeId: null });
  },

  renameActive: (title) => {
    const { dashboards, activeId } = get();
    if (!activeId) return;
    commit(
      set,
      dashboards.map((d) =>
        d.id === activeId ? { ...d, title, modified: new Date().toISOString() } : d,
      ),
    );
  },

  addWidget: (type) => {
    const { dashboards, activeId } = get();
    if (!activeId) return;
    commit(
      set,
      dashboards.map((d) =>
        d.id === activeId
          ? {
              ...d,
              widgets: [
                ...d.widgets,
                {
                  id: crypto.randomUUID(),
                  type,
                  title: `New ${type}`,
                  config: defaultConfig(type),
                  layout: { x: 0, y: d.widgets.length, w: 2, h: 2 },
                },
              ],
              modified: new Date().toISOString(),
            }
          : d,
      ),
    );
  },

  removeWidget: (widgetId) => {
    const { dashboards, activeId } = get();
    if (!activeId) return;
    commit(
      set,
      dashboards.map((d) =>
        d.id === activeId
          ? {
              ...d,
              widgets: d.widgets.filter((w) => w.id !== widgetId),
              modified: new Date().toISOString(),
            }
          : d,
      ),
    );
  },
}));
