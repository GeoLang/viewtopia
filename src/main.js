/**
 * ViewTopia — unified viewer for TileTopia and GeoLang.
 *
 * Entry point: initializes backends, renderers, chat, and UI.
 */
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import './style.css';

import { discoverBackends, startPolling, hasTileTopia, hasGeoLang } from './backends.js';
import { setCesiumViewer, initRendererSelector, switchRenderer } from './renderers.js';
import { initViewerCommands } from './viewer-commands.js';
import { initChat } from './chat.js';
import { initTabs, showTab } from './tabs.js';
import { initSessionsAndUI } from './sessions.js';
import { setAssetViewer, initAssetCatalogue } from './asset-catalogue.js';
import { initMeasurement } from './measurement.js';
import { initAnnotations } from './annotations.js';
import { initFeaturePicker, initStyleEditor } from './feature-picker.js';
import { initTerrainProfile } from './terrain-profile.js';
import { initTimeline } from './timeline.js';
import { initBookmarks } from './bookmarks.js';
import { initDataTable } from './data-table.js';
import { initGeoJSONEditor } from './geojson-editor.js';
import { initPrintExport } from './print-export.js';
import { initSplitView } from './split-view.js';
import { initMinimap } from './minimap.js';
import { initStories } from './stories.js';
import { initPortal } from './portal.js';
import { initDashboards } from './dashboards.js';
import { initCollaboration } from './collaboration.js';
import { initKeyboardShortcuts } from './keyboard-shortcuts.js';
import { initGeocoding } from './geocoding.js';
import { initRouting } from './routing.js';
import { initOGCLayers } from './ogc-layers.js';
import { initThemeToggle } from './theme-toggle.js';
import { initTrackImport } from './track-import.js';
import { initTour } from './tour.js';
import { initDragDrop } from './drag-drop.js';
import { initCoordReadout } from './coord-readout.js';
import { initContextMenu } from './context-menu.js';
import { initLayerManager } from './layer-manager.js';
import { initCesiumIon } from './cesium-ion.js';
import { initCharts } from './charts.js';
import { initShadows } from './shadows.js';
import { initViewshed } from './viewshed.js';
import { initVolumeMeasurement } from './volume.js';
import { initPointCloudCompare } from './point-cloud-compare.js';
import { initPlugins } from './plugins.js';
import { initTerrainAnalysis } from './terrain-analysis.js';
import { initModelImport } from './model-import.js';
import { initClassificationUI } from './classification-ui.js';
import { initVectorTiles } from './vector-tiles.js';
import { initRasterViewer } from './raster-viewer.js';
import { initSpatialStats } from './spatial-stats.js';
import { initOsmBuildings } from './open-data.js';
import { initClippingPlanes } from './clipping-planes.js';
import { initCrossSection } from './cross-section.js';
import { initPhotoViewer } from './photo-viewer.js';
import { initOfflineCache } from './offline-cache.js';
import { initAuth } from './auth.js';
import { initWeather } from './weather.js';
import { initFloodSim } from './flood-sim.js';
import { initWindViz } from './wind-viz.js';
import { initDayLighting } from './day-lighting.js';
import { initNoiseMap } from './noise-map.js';
import { initEnergyHeatmap } from './energy-heatmap.js';
import { initIndoorNav } from './indoor-nav.js';
import { initSolarPlacement } from './solar-placement.js';
import { initTrafficFlow } from './traffic-flow.js';
import { initDronePlanner } from './drone-planner.js';
import { initWebXR } from './webxr.js';
import { initAccessibility } from './accessibility.js';
import { init3DExport } from './3d-export.js';
import { initFlythrough } from './flythrough.js';
import { initHeatmapLayer } from './heatmap-layer.js';
import { initTimelapse } from './timelapse.js';
import { initPanelManager } from './panel-manager.js';
import { initToolbarMenus } from './toolbar-menu.js';
import { initGoogle3DTiles } from './google-3d-tiles.js';
import { initSettings, loadSettings, getSetting } from './settings.js';
import { initGlobalTerrain } from './global-terrain.js';
import { initShareLinks } from './share-links.js';
import { initSpaceTime } from './spacetime/panel.js';
import { createTimeUpdateLayers } from './spacetime/layers.js';
import { getActiveDeck, getCesiumViewer, getMapLibreDeckOverlay, getActiveMapLibre } from './renderers.js';

async function main() {
  // Load settings early — needed before renderer init
  loadSettings();

  // Discover which backends are available
  const backends = await discoverBackends();
  startPolling(getSetting('probeIntervalSec') * 1000);

  // Read saved preferences
  const savedRenderer = getSetting('defaultRenderer') || 'cesium';
  const savedBasemap = getSetting('defaultBasemap') || 'osm';

  // Initialize CesiumJS in the globe container
  let viewer = null;
  // Build initial basemap imagery from saved preference
  const basemapProviders = {
    osm: () => new Cesium.OpenStreetMapImageryProvider({ url: 'https://tile.openstreetmap.org/' }),
    satellite: () => new Cesium.UrlTemplateImageryProvider({
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      maximumLevel: 19, credit: '© Esri',
    }),
    topo: () => new Cesium.UrlTemplateImageryProvider({
      url: 'https://tile.opentopomap.org/{z}/{x}/{y}.png',
      maximumLevel: 17, credit: '© OpenTopoMap',
    }),
    dark: () => new Cesium.UrlTemplateImageryProvider({
      url: 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
      maximumLevel: 19, credit: '© CARTO',
    }),
  };
  const initialBasemap = (basemapProviders[savedBasemap] || basemapProviders.osm)();

  try {
    viewer = new Cesium.Viewer('globe-container', {
      terrain: undefined,
      baseLayerPicker: false,
      geocoder: true,
      animation: false,
      timeline: false,
      homeButton: true,
      sceneModePicker: true,
      navigationHelpButton: false,
      infoBox: true,
      selectionIndicator: true,
      creditContainer: document.createElement('div'),
      baseLayer: new Cesium.ImageryLayer(initialBasemap),
    });
    setCesiumViewer(viewer);
    setAssetViewer(viewer);

    // Hide the placeholder now that we have a working viewer
    const placeholder = document.getElementById('placeholder');
    if (placeholder) placeholder.style.display = 'none';
  } catch (e) {
    console.warn('CesiumJS failed to initialize (no WebGL?):', e.message);
  }
  initRendererSelector();

  // Apply saved renderer preference
  if (savedRenderer !== 'cesium') {
    switchRenderer(savedRenderer);
    const rendererSelect = document.getElementById('renderer-choice');
    if (rendererSelect) rendererSelect.value = savedRenderer;
  }

  // Sync basemap dropdown with saved preference
  const basemapSelect = document.getElementById('basemap-select');
  if (basemapSelect) basemapSelect.value = savedBasemap;

  initViewerCommands();
  initToolbarMenus();
  initTabs();
  initChat();
  initSessionsAndUI();
  initAssetCatalogue();
  initMeasurement();
  initAnnotations();
  initFeaturePicker();
  initStyleEditor();
  initTerrainProfile();
  initTimeline();
  initBookmarks();
  initDataTable();
  initGeoJSONEditor();
  initPrintExport();
  initSplitView();
  if (getSetting('showMinimap')) initMinimap();
  initStories();
  initPortal();
  initDashboards();
  initCollaboration();
  initKeyboardShortcuts();
  initGeocoding();
  initRouting();
  initOGCLayers();
  initThemeToggle();
  initTrackImport();
  initTour();
  initDragDrop();
  if (getSetting('showCoordReadout')) initCoordReadout();
  initContextMenu();
  initLayerManager();
  initCesiumIon();
  initCharts();
  initShadows();
  initViewshed();
  initVolumeMeasurement();
  initPointCloudCompare();
  initPlugins();
  initTerrainAnalysis();
  initModelImport();
  initClassificationUI();
  initVectorTiles();
  initRasterViewer();
  initSpatialStats();
  initOsmBuildings();
  initClippingPlanes();
  initCrossSection();
  initPhotoViewer();
  initOfflineCache();
  initAuth();
  initWeather();
  initFloodSim();
  initWindViz();
  initDayLighting();
  initNoiseMap();
  initEnergyHeatmap();
  initIndoorNav();
  initSolarPlacement();
  initTrafficFlow();
  initDronePlanner();
  initWebXR();
  initAccessibility();
  init3DExport();
  initFlythrough();
  initHeatmapLayer();
  initTimelapse();
  initPanelManager();
  initGoogle3DTiles();
  initSettings();
  initGlobalTerrain();
  initShareLinks();
  initSpaceTime({
    onLayersUpdate: (layers) => {
      const deck = getActiveDeck();
      if (deck) {
        const existing = deck.props.layers.filter(l => !l.id.startsWith('spacetime-'));
        deck.setProps({ layers: [...existing, ...layers] });
      }
      const overlay = getMapLibreDeckOverlay();
      if (overlay) {
        overlay.setProps({ layers });
      }
    },
    onTimeUpdate: (params) => {
      // Lightweight per-frame update: only rebuild current-position markers
      // and update the filter range on the existing events layer.
      const { currentLayer, filterRange } = createTimeUpdateLayers(params);
      const deck = getActiveDeck();
      if (deck) {
        const layers = deck.props.layers.map(l => {
          if (l.id === 'spacetime-events') {
            return l.clone({ filterRange });
          }
          if (l.id === 'spacetime-current') {
            return currentLayer;
          }
          return l;
        }).filter(Boolean);
        if (currentLayer && !layers.find(l => l.id === 'spacetime-current')) {
          layers.push(currentLayer);
        }
        deck.setProps({ layers });
      }
      const overlay = getMapLibreDeckOverlay();
      if (overlay) {
        const layers = (overlay._props?.layers || []).map(l => {
          if (l.id === 'spacetime-events') return l.clone({ filterRange });
          if (l.id === 'spacetime-current') return currentLayer;
          return l;
        }).filter(Boolean);
        if (currentLayer && !layers.find(l => l.id === 'spacetime-current')) {
          layers.push(currentLayer);
        }
        overlay.setProps({ layers });
      }
    },
    onFlyTo: (bounds) => {
      const cesium = getCesiumViewer();
      if (cesium) {
        cesium.camera.flyTo({
          destination: Cesium.Rectangle.fromDegrees(bounds.west, bounds.south, bounds.east, bounds.north),
          duration: 1.5,
        });
      }
      const deck = getActiveDeck();
      if (deck) {
        const lng = (bounds.west + bounds.east) / 2;
        const lat = (bounds.south + bounds.north) / 2;
        const span = Math.max(bounds.east - bounds.west, bounds.north - bounds.south);
        const zoom = Math.max(1, Math.min(18, Math.log2(360 / span) - 1));
        deck.setProps({ initialViewState: { longitude: lng, latitude: lat, zoom, pitch: 45, bearing: 0, transitionDuration: 1500 } });
      }
      const map = getActiveMapLibre();
      if (map) {
        map.fitBounds([[bounds.west, bounds.south], [bounds.east, bounds.north]], { padding: 50, duration: 1500 });
      }
    },
  });

  // Default view: if user explicitly saved a 3D renderer preference, stay
  // on the globe tab. Only fall back to 2D map if using defaults and
  // TileTopia is disconnected (GeoLang-only mode).
  const hasCustomPrefs = !!localStorage.getItem('viewtopia_settings');
  if (hasCustomPrefs) {
    // User has saved settings — respect their renderer choice
    showTab('globe');
  } else if (!backends.tiletopia && backends.geolang) {
    showTab('map');
  }
}

main().catch(console.error);
