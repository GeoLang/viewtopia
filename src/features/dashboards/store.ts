import { create } from 'zustand';
import { getProjectState, putProjectState } from '../../projects/api';
import { useProjectsStore } from '../../projects/projectsStore';
import type { Dashboard, WidgetType } from './types';

/**
 * Dashboard builder. A dashboard belongs to the active project and lives under
 * its `dashboards` state key in ptolemy, so every member of the project sees
 * the same ones. Dashboards left in this browser's `viewtopia_dashboards`
 * localStorage key are moved into the first project that opens after this, and
 * the key is dropped.
 */

const STATE_KEY = 'dashboards';
const LEGACY_LOCAL_KEY = 'viewtopia_dashboards';

/** How long the dashboards sit still before they go to the project. */
export const DASHBOARD_SAVE_DEBOUNCE_MS = 1000;

function defaultConfig(type: WidgetType): Record<string, unknown> {
  switch (type) {
    case 'indicator':
      return { value: '0', label: 'Count' };
    case 'gauge':
      return { percent: 50 };
    case 'list':
      return { items: [] };
    case 'chart':
      return {
        chartType: 'bar',
        data: [
          { label: 'A', value: 30 },
          { label: 'B', value: 60 },
          { label: 'C', value: 45 },
        ],
      };
    case 'richtext':
      return { html: '<p>Enter text...</p>' };
    case 'map':
      return { center: [0, 20], zoom: 1 };
    default:
      return {};
  }
}

/** What this browser saved before dashboards belonged to a project. */
function legacyLocalDashboards(): Dashboard[] {
  try {
    const stored = localStorage.getItem(LEGACY_LOCAL_KEY);
    const parsed: unknown = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? (parsed as Dashboard[]) : [];
  } catch {
    return [];
  }
}

interface DashboardsState {
  dashboards: Dashboard[];
  activeId: string | null;
  /** the project the loaded dashboards came from, and the one a write goes back to */
  projectId: string | null;
  refresh: () => void;
  create: () => void;
  open: (id: string) => void;
  back: () => void;
  remove: (id: string) => void;
  renameActive: (title: string) => void;
  addWidget: (type: WidgetType) => void;
  removeWidget: (widgetId: string) => void;
  updateWidgetConfig: (widgetId: string, patch: Record<string, unknown>) => void;
}

export const useDashboardsStore = create<DashboardsState>((set, get) => {
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let waiting: { projectId: string; dashboards: Dashboard[] } | null = null;

  function stopWaiting(): void {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    waiting = null;
  }

  function sendWaiting(): void {
    const write = waiting;
    stopWaiting();
    if (!write) return;
    void putProjectState(write.projectId, STATE_KEY, write.dashboards).catch(
      (failure: unknown) => {
        console.warn('could not save the dashboards to the project', failure);
      },
    );
  }

  /**
   * Mirror the dashboards into state and send them to the project once the
   * editing stops, so dragging a widget is one write and not one per frame.
   * With no project open there is nowhere to put them, so the edit is refused
   * rather than held in a browser that would lose it on the next reload.
   */
  function commit(dashboards: Dashboard[]) {
    const { projectId } = get();
    if (!projectId) return;
    set({ dashboards });
    if (saveTimer) clearTimeout(saveTimer);
    waiting = { projectId, dashboards };
    saveTimer = setTimeout(sendWaiting, DASHBOARD_SAVE_DEBOUNCE_MS);
  }

  async function load(projectId: string) {
    const stored = (await getProjectState<Dashboard[]>(projectId, STATE_KEY))?.value ?? [];
    const held = Array.isArray(stored) ? stored : [];
    const legacy = legacyLocalDashboards();
    const known = new Set(held.map((dashboard) => dashboard.id));
    const migrated = [...held, ...legacy.filter((dashboard) => !known.has(dashboard.id))];

    set({ projectId, dashboards: migrated });
    if (legacy.length > 0) {
      localStorage.removeItem(LEGACY_LOCAL_KEY);
      if (migrated.length > held.length) {
        await putProjectState(projectId, STATE_KEY, migrated);
      }
    }
  }

  return {
    dashboards: [],
    activeId: null,
    projectId: null,

    refresh: () => {
      const project = useProjectsStore.getState().getActive();
      if (!project) {
        stopWaiting();
        set({ projectId: null, dashboards: [], activeId: null });
        return;
      }
      sendWaiting();
      void load(project.id).catch((failure: unknown) => {
        console.warn('could not read the dashboards from the project', failure);
        set({ projectId: project.id, dashboards: [] });
      });
    },

    create: () => {
      if (!get().projectId) return;
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
      commit([...get().dashboards, dashboard]);
      set({ activeId: dashboard.id });
    },

    open: (id) => set({ activeId: id }),
    back: () => set({ activeId: null }),

    remove: (id) => {
      commit(get().dashboards.filter((d) => d.id !== id));
      if (get().activeId === id) set({ activeId: null });
    },

    renameActive: (title) => {
      const { dashboards, activeId } = get();
      if (!activeId) return;
      commit(
        dashboards.map((d) =>
          d.id === activeId ? { ...d, title, modified: new Date().toISOString() } : d,
        ),
      );
    },

    addWidget: (type) => {
      const { dashboards, activeId } = get();
      if (!activeId) return;
      commit(
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

    updateWidgetConfig: (widgetId, patch) => {
      const { dashboards, activeId } = get();
      if (!activeId) return;
      commit(
        dashboards.map((d) =>
          d.id === activeId
            ? {
                ...d,
                widgets: d.widgets.map((w) =>
                  w.id === widgetId ? { ...w, config: { ...w.config, ...patch } } : w,
                ),
                modified: new Date().toISOString(),
              }
            : d,
        ),
      );
    },
  };
});
