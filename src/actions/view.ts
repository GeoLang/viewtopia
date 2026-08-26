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
  description: 'Draw the map with the Cesium globe or with MapLibre, and optionally switch tab.',
  parameters: {
    renderer: {
      type: 'string',
      description: 'cesium for the 3D globe, maplibre for the faster vector renderer',
      enum: RENDERERS,
      required: true,
    },
    tab: {
      type: 'string',
      description: 'globe for the 3D view, map for the 2D view',
      enum: TABS,
    },
  },
  run: (args) => {
    const renderer = args.renderer as Renderer;
    const tab = args.tab as ViewerTab | undefined;
    const store = useAppStore.getState();
    store.setRenderer(renderer);
    if (tab) store.setActiveTab(tab);
    return { text: tab ? `Drawing with ${renderer} on the ${tab}.` : `Drawing with ${renderer}.` };
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
