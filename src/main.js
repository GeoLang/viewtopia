/**
 * ViewTopia — unified viewer for TileTopia and GeoLang.
 *
 * Entry point: initializes backends, renderers, chat, and UI.
 */
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import './style.css';

import { discoverBackends, startPolling, hasTileTopia, hasGeoLang } from './backends.js';
import { setCesiumViewer, initRendererSelector } from './renderers.js';
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
import { initCollaboration } from './collaboration.js';

async function main() {
  // Discover which backends are available
  const backends = await discoverBackends();
  startPolling();

  // Initialize CesiumJS in the globe container
  const viewer = new Cesium.Viewer('globe-container', {
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
    baseLayer: new Cesium.ImageryLayer(
      new Cesium.OpenStreetMapImageryProvider({
        url: 'https://tile.openstreetmap.org/',
      })
    ),
  });

  setCesiumViewer(viewer);
  initRendererSelector();
  initViewerCommands();
  initTabs();
  initChat();
  initSessionsAndUI();
  setAssetViewer(viewer);
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
  initMinimap();
  initStories();
  initCollaboration();

  // If TileTopia is available, try loading open terrain
  if (backends.tiletopia) {
    try {
      const terrainRes = await fetch('/api/v1/terrain/layer.json', { signal: AbortSignal.timeout(2000) });
      if (terrainRes.ok) {
        const provider = await Cesium.CesiumTerrainProvider.fromUrl('/api/v1/terrain');
        viewer.scene.terrainProvider = provider;
      }
    } catch { /* ellipsoid fallback */ }
  }

  // Default view: show 3D globe if TileTopia is connected, otherwise 2D map
  if (!backends.tiletopia && backends.geolang) {
    showTab('map');
  }
}

main().catch(console.error);
