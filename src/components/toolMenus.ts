import type { ToolPanel } from '../store/app';

/**
 * Data-driven registry for the toolbar dropdown menus. Entries marked
 * `preview` are UI-only stubs, hidden unless settings.showPreviewTools is on.
 */
export interface ToolMenuItem {
  panel: NonNullable<ToolPanel>;
  label: string;
  preview?: boolean;
}

/** each menu is a list of sections; the toolbar renders a divider between them */
export const ANALYSIS_MENU: ToolMenuItem[][] = [
  [
    { panel: 'clipping', label: '✂ Clip' },
    { panel: 'crossSection', label: '📐 Section' },
    { panel: 'heatmap', label: '🔥 Heatmap' },
    { panel: 'timelapse', label: '⏳ Timelapse', preview: true },
  ],
  [
    { panel: 'shadows', label: '🌑 Shadows' },
    { panel: 'viewshed', label: '👁 Viewshed' },
    { panel: 'volume', label: '📦 Volume', preview: true },
    { panel: 'terrainAnalysis', label: '⛰ Terrain' },
    { panel: 'terrainProfile', label: '📈 Profile' },
    { panel: 'spatialStats', label: '📊 Statistics' },
    { panel: 'pointCloudCompare', label: '🔄 Cloud Compare', preview: true },
    { panel: 'classification', label: '🏷 Classification', preview: true },
  ],
];

export const SIMULATE_MENU: ToolMenuItem[][] = [
  [
    { panel: 'weather', label: '🌦 Weather' },
    { panel: 'flood', label: '🌊 Flood' },
    { panel: 'wind', label: '💨 Wind' },
    { panel: 'lighting', label: '☀ Lighting' },
    { panel: 'noise', label: '🔊 Noise', preview: true },
    { panel: 'energy', label: '🔋 Energy', preview: true },
    { panel: 'solar', label: '☀ Solar' },
    { panel: 'traffic', label: '🚗 Traffic' },
  ],
];

export const TOOLS_MENU: ToolMenuItem[][] = [
  [
    { panel: 'photo', label: '📷 Photo', preview: true },
    { panel: 'offline', label: '💾 Offline', preview: true },
    { panel: 'indoor', label: '🏛 Indoor', preview: true },
    { panel: 'drone', label: '🛸 Drone', preview: true },
    { panel: 'webxr', label: '🥽 WebXR', preview: true },
    { panel: 'accessibility', label: '♿ A11y' },
    { panel: 'export3d', label: '🖨 3D Print', preview: true },
    { panel: 'flythrough', label: '🎬 Flythrough', preview: true },
  ],
  [
    { panel: 'charts', label: '📊 Charts' },
    { panel: 'dashboards', label: '📈 Dashboards' },
    { panel: 'splitView', label: '🔲 Split View' },
    { panel: 'stories', label: '📖 Stories' },
    { panel: 'timeline', label: '⏱ Timeline' },
    { panel: 'dataTable', label: '📋 Data Table' },
    { panel: 'collaboration', label: '👥 Collaborate' },
    { panel: 'printExport', label: '🖨 Print/Export' },
  ],
];

export const DATA_MENU: ToolMenuItem[][] = [
  [{ panel: 'portal', label: '🗂 Catalog' }],
  [
    { panel: 'assets', label: '📦 Assets', preview: true },
    { panel: 'ogc', label: '🌐 OGC Layers' },
    { panel: 'import', label: '📂 Import' },
    { panel: 'modelImport', label: '🧊 3D Models', preview: true },
    { panel: 'trackImport', label: '🗺 Tracks' },
    { panel: 'vectorTiles', label: '🔷 Vector Tiles' },
    { panel: 'rasterViewer', label: '🖼 Raster/COG', preview: true },
  ],
  [
    { panel: 'cesiumIon', label: '🌍 Cesium Ion', preview: true },
    { panel: 'google3d', label: '🏙 Google 3D', preview: true },
    { panel: 'globalTerrain', label: '⛰ Terrain' },
  ],
];

export const MORE_MENU: ToolMenuItem[][] = [
  [
    { panel: 'settings', label: '⚙ Settings' },
    { panel: 'shareLink', label: '🔗 Share Link' },
    { panel: 'tour', label: '🎓 Tour' },
  ],
];

export const ALL_TOOL_MENU_ITEMS: ToolMenuItem[] = [
  ANALYSIS_MENU,
  SIMULATE_MENU,
  TOOLS_MENU,
  DATA_MENU,
  MORE_MENU,
].flat(2);

export function visibleToolItems(items: ToolMenuItem[], showPreview: boolean): ToolMenuItem[] {
  return showPreview ? items : items.filter((item) => !item.preview);
}

export function isPreviewPanel(panel: ToolPanel): boolean {
  return ALL_TOOL_MENU_ITEMS.some((item) => item.panel === panel && item.preview);
}
