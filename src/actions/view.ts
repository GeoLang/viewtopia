/**
 * What the viewer draws with: the renderer and tab, the basemap under
 * everything, and the split view's panes.
 */
import { useAppStore, type Basemap, type Renderer, type ViewerTab } from '../store/app';
import { paneLayout, useSplitViewStore, type SplitLayout } from '../store/splitView';
import { ActionError, registerAction } from './registry';

const SPLIT_VIEW_ALREADY_OFF = 'Split view is already off.';

const RENDERERS = ['cesium', 'maplibre'] as const;
const TABS = ['globe', 'map'] as const;
const BASEMAPS = [
  'osm',
  'satellite',
  'topo',
  'dark',
  'liberty',
  'bright',
  'positron',
  'selfhosted',
] as const;
const SPLIT_LAYOUTS = ['twoAcross', 'grid'] as const;

registerAction({
  name: 'renderer.set',
  description:
    'Choose the engine that draws the globe tab and show that tab. Leaflet is not one of them: it draws the flat 2D map, so leaflet or 2D means view.set_tab with tab map.',
  parameters: {
    renderer: {
      type: 'string',
      description: 'cesium or maplibre, the engine behind the globe tab. Never leaflet, that is the map tab.',
      enum: RENDERERS,
      required: true,
    },
  },
  run: (args) => {
    const renderer = args.renderer as Renderer;
    const store = useAppStore.getState();
    // a call that changes nothing reads as an error, so the model tries something else
    if (store.renderer === renderer && store.activeTab === 'globe') {
      throw new ActionError(`The globe is already drawn with ${renderer}. For the flat 2D map use view.set_tab.`);
    }
    store.setRenderer(renderer);
    store.setActiveTab('globe');
    return { text: `Drawing with ${renderer}.` };
  },
});

registerAction({
  name: 'view.set_tab',
  description: 'Show the globe tab or the flat map tab. Leaflet draws the map tab, so asking for leaflet means tab map.',
  parameters: {
    tab: {
      type: 'string',
      description: 'globe is the 3D view, map is the flat 2D map drawn by Leaflet',
      enum: TABS,
      required: true,
    },
  },
  run: (args) => {
    const tab = args.tab as ViewerTab;
    const store = useAppStore.getState();
    if (store.activeTab === tab) {
      throw new ActionError(tab === 'map' ? 'The flat map is already showing.' : 'The globe is already showing.');
    }
    store.setActiveTab(tab);
    return { text: tab === 'map' ? 'Showing the flat map.' : 'Showing the globe.' };
  },
});

registerAction({
  name: 'basemap.set',
  description: 'Put a basemap under the layers.',
  parameters: {
    basemap: {
      type: 'string',
      description: 'which basemap to draw',
      enum: BASEMAPS,
      required: true,
    },
  },
  run: (args) => {
    const basemap = args.basemap as Basemap;
    const store = useAppStore.getState();
    if (store.basemap === basemap) {
      throw new ActionError(`The basemap is already ${basemap}.`);
    }
    store.setBasemap(basemap);
    return { text: `Basemap is ${basemap}.` };
  },
});

registerAction({
  name: 'split_view.set',
  description: 'Show the map in one pane or in several side by side.',
  parameters: {
    active: {
      type: 'boolean',
      description: 'true for several panes, false for one',
      required: true,
    },
    layout: {
      type: 'string',
      description: 'twoAcross for two panes, grid for four',
      enum: SPLIT_LAYOUTS,
    },
  },
  run: (args) => {
    const active = args.active as boolean;
    const layout = args.layout as SplitLayout | undefined;
    const store = useSplitViewStore.getState();
    // nothing stores the layout, the pane count is it
    const shownLayout = paneLayout(store.comparePanes.length + 1);
    if (!active && !store.active) {
      throw new ActionError(SPLIT_VIEW_ALREADY_OFF);
    }
    if (active && store.active && (layout === undefined || layout === shownLayout)) {
      throw new ActionError(`Split view is already on, ${shownLayout}.`);
    }
    if (layout) store.setLayout(layout);
    store.setActive(active);
    if (!active) return { text: 'Split view is off.' };
    return { text: layout ? `Split view is on, ${layout}.` : 'Split view is on.' };
  },
});
