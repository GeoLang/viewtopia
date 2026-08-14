import type { Icon } from '@tabler/icons-react';
import {
  IconAccessible,
  IconBook,
  IconBookmark,
  IconBox,
  IconBuildingBank,
  IconBuildingSkyscraper,
  IconCamera,
  IconCar,
  IconChartAreaLine,
  IconChartBar,
  IconChartHistogram,
  IconClock,
  IconClockHour4,
  IconCloud,
  IconCube,
  IconDatabase,
  IconDeviceFloppy,
  IconDrone,
  IconDroplet,
  IconEye,
  IconFlame,
  IconFolders,
  IconHistory,
  IconLayoutColumns,
  IconLayoutDashboard,
  IconLink,
  IconMapPin,
  IconMapRoute,
  IconMoon,
  IconMountain,
  IconMovie,
  IconPackage,
  IconPackageExport,
  IconPalette,
  IconPencil,
  IconPhoto,
  IconPhotoPlus,
  IconPlanet,
  IconPlug,
  IconPrinter,
  IconRoute,
  IconRuler2,
  IconSchool,
  IconSearch,
  IconScissors,
  IconSolarPanel,
  IconSun,
  IconTable,
  IconTimeline,
  IconTools,
  IconTransform,
  IconUsers,
  IconVectorTriangle,
  IconWind,
  IconWorldSearch,
} from '@tabler/icons-react';
import type { ToolPanel } from '../store/app';

/**
 * Data-driven registry for the toolbar dropdown menus. Entries marked
 * `preview` are UI-only stubs, hidden unless settings.showPreviewTools is on.
 */
export interface ToolMenuItem {
  panel: NonNullable<ToolPanel>;
  label: string;
  icon: Icon;
  preview?: boolean;
  /** extra terms the command palette searches, for names the label drops */
  keywords?: string[];
}

/** each menu is a list of sections; the toolbar renders a divider between them */
export const ACTIONS_MENU: ToolMenuItem[][] = [
  [
    { panel: 'draw', label: 'Draw', icon: IconPencil },
    { panel: 'annotate', label: 'Annotate', icon: IconMapPin },
    { panel: 'routing', label: 'Route', icon: IconRoute },
    { panel: 'bookmark', label: 'Bookmarks', icon: IconBookmark },
    { panel: 'geocoding', label: 'Search', icon: IconSearch },
    { panel: 'buildings', label: 'Buildings', icon: IconBuildingSkyscraper },
    { panel: 'geojsonEditor', label: 'GeoJSON Editor', icon: IconVectorTriangle },
    { panel: 'styleEditor', label: 'Style Editor', icon: IconPalette },
  ],
];

export const ANALYSIS_MENU: ToolMenuItem[][] = [
  [
    { panel: 'travelTime', label: 'Travel Time', icon: IconClockHour4 },
    { panel: 'clipping', label: 'Clip', icon: IconScissors },
    { panel: 'crossSection', label: 'Section', icon: IconRuler2 },
    { panel: 'heatmap', label: 'Heatmap', icon: IconFlame },
    { panel: 'timelapse', label: 'Timelapse', icon: IconClock },
  ],
  [
    { panel: 'shadows', label: 'Shadows', icon: IconMoon },
    { panel: 'viewshed', label: 'Viewshed', icon: IconEye },
    { panel: 'volume', label: 'Volume', icon: IconCube },
    { panel: 'terrainAnalysis', label: 'Terrain', icon: IconMountain },
    { panel: 'terrainProfile', label: 'Profile', icon: IconChartAreaLine },
    { panel: 'spatialStats', label: 'Statistics', icon: IconChartHistogram },
  ],
];

export const SIMULATE_MENU: ToolMenuItem[][] = [
  [
    { panel: 'weather', label: 'Weather', icon: IconCloud },
    { panel: 'flood', label: 'Flood', icon: IconDroplet },
    { panel: 'wind', label: 'Wind', icon: IconWind },
    { panel: 'lighting', label: 'Lighting', icon: IconSun },
    { panel: 'solar', label: 'Solar', icon: IconSolarPanel },
    { panel: 'traffic', label: 'Traffic', icon: IconCar },
  ],
];

export const TOOLS_MENU: ToolMenuItem[][] = [
  [
    { panel: 'photo', label: 'Photo', icon: IconCamera },
    { panel: 'offline', label: 'Offline', icon: IconDeviceFloppy },
    { panel: 'indoor', label: 'Indoor', icon: IconBuildingBank },
    { panel: 'drone', label: 'Drone', icon: IconDrone },
    { panel: 'accessibility', label: 'A11y', icon: IconAccessible },
    { panel: 'export3d', label: 'Export', icon: IconPackageExport },
    { panel: 'flythrough', label: 'Flythrough', icon: IconMovie },
  ],
  [
    { panel: 'charts', label: 'Charts', icon: IconChartBar },
    { panel: 'dashboards', label: 'Dashboards', icon: IconLayoutDashboard },
    { panel: 'splitView', label: 'Split View', icon: IconLayoutColumns },
    { panel: 'stories', label: 'Stories', icon: IconBook },
    { panel: 'timeline', label: 'Timeline', icon: IconTimeline },
    { panel: 'dataTable', label: 'Data Table', icon: IconTable },
    { panel: 'collaboration', label: 'Collaborate', icon: IconUsers },
    { panel: 'printExport', label: 'Print/Export', icon: IconPrinter },
  ],
];

export const DATA_MENU: ToolMenuItem[][] = [
  [
    { panel: 'portal', label: 'Catalog', icon: IconFolders },
    { panel: 'stacBrowser', label: 'STAC Browser', icon: IconWorldSearch },
  ],
  [
    { panel: 'assets', label: 'Assets', icon: IconPackage },
    {
      panel: 'dataSources',
      label: 'Data Sources',
      icon: IconDatabase,
      keywords: ['ogc', 'wms', 'wmts', 'wfs', 'sql', 'duckdb', 'import'],
    },
    { panel: 'project', label: 'Project', icon: IconDeviceFloppy },
    { panel: 'modelImport', label: 'glTF Models', icon: IconBox },
    { panel: 'trackImport', label: 'Tracks', icon: IconMapRoute },
    { panel: 'vectorTiles', label: 'Vector Tiles', icon: IconVectorTriangle },
    { panel: 'rasterViewer', label: 'Raster Analysis', icon: IconPhoto },
    { panel: 'imageOverlay', label: 'Image Overlay', icon: IconPhotoPlus },
    { panel: 'toolbox', label: 'Geoprocessing', icon: IconTools },
    { panel: 'runHistory', label: 'Run History', icon: IconHistory },
    { panel: 'convert', label: 'Convert', icon: IconTransform },
  ],
  [
    { panel: 'cesiumIon', label: 'Cesium Ion', icon: IconPlanet },
    { panel: 'google3d', label: 'Google 3D', icon: IconBuildingSkyscraper },
    { panel: 'globalTerrain', label: 'Terrain', icon: IconMountain },
  ],
];

export const MORE_MENU: ToolMenuItem[][] = [
  [
    { panel: 'shareLink', label: 'Share Link', icon: IconLink },
    { panel: 'tour', label: 'Tour', icon: IconSchool },
    { panel: 'pluginManager', label: 'Plugin Manager', icon: IconPlug },
  ],
];

/** menus in toolbar order, with the group label the command palette shows */
export const TOOL_MENU_GROUPS: { group: string; sections: ToolMenuItem[][] }[] = [
  { group: 'Actions', sections: ACTIONS_MENU },
  { group: 'Analysis', sections: ANALYSIS_MENU },
  { group: 'Simulate', sections: SIMULATE_MENU },
  { group: 'Tools', sections: TOOLS_MENU },
  { group: 'Data', sections: DATA_MENU },
  { group: 'More', sections: MORE_MENU },
];

export const ALL_TOOL_MENU_ITEMS: ToolMenuItem[] = TOOL_MENU_GROUPS.map(
  (menu) => menu.sections,
).flat(2);

export function visibleToolItems(items: ToolMenuItem[], showPreview: boolean): ToolMenuItem[] {
  return showPreview ? items : items.filter((item) => !item.preview);
}

export function isPreviewPanel(panel: ToolPanel): boolean {
  return ALL_TOOL_MENU_ITEMS.some((item) => item.panel === panel && item.preview);
}
