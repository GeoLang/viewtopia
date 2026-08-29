/**
 * What the viewer draws with: the renderer and tab, the basemap under
 * everything, and the split view's panes.
 */
import { useAppStore, type Basemap, type Renderer, type ViewerTab } from '../store/app';
import { useSplitViewStore, type SplitLayout } from '../store/splitView';
import { registerAction } from './registry';

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
  description: 'Pick the engine the globe tab draws with. The flat 2D map is the map tab, see view.set_tab.',
  parameters: {
    renderer: {
      type: 'string',
      description: 'cesium for the 3D globe, maplibre for the vector map, both on the globe tab',
      enum: RENDERERS,
      required: true,
    },
  },
  run: (args) => {
    const renderer = args.renderer as Renderer;
    useAppStore.getState().setRenderer(renderer);
    return { text: `Drawing with ${renderer}.` };
  },
});

registerAction({
  name: 'view.set_tab',
  description: 'Show the globe tab or the flat map tab.',
  parameters: {
    tab: {
      type: 'string',
      description: 'globe is the 3D view drawn by the chosen renderer, map is the flat 2D map drawn by Leaflet',
      enum: TABS,
      required: true,
    },
  },
  run: (args) => {
    const tab = args.tab as ViewerTab;
    useAppStore.getState().setActiveTab(tab);
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
    useAppStore.getState().setBasemap(basemap);
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
    if (layout) store.setLayout(layout);
    store.setActive(active);
    if (!active) return { text: 'Split view is off.' };
    return { text: layout ? `Split view is on, ${layout}.` : 'Split view is on.' };
  },
});
