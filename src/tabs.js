/**
 * Tab/view switching for ViewTopia.
 *
 * Controls which view container is visible:
 * - globe (3D CesiumJS / deck.gl / MapLibre)
 * - map (2D Leaflet)
 * - image
 * - table
 */
import { initLeafletMap, getLeafletMap } from './leaflet-view.js';
import { getCesiumViewer } from './renderers.js';
import { getLayerMeta } from './ui-spec-renderer.js';
import * as Cesium from 'cesium';

const tabContainerMap = {
  globe: 'globe-container',
  map: 'map-container',
  image: 'image-view',
  table: 'table-view',
};

let currentTab = 'globe';

export function getCurrentTab() {
  return currentTab;
}

export function showTab(tab) {
  const prevTab = currentTab;
  currentTab = tab;

  // Update tab buttons
  document.querySelectorAll('.viz-toolbar .tab').forEach((el) => {
    el.classList.toggle('active', el.dataset.tab === tab);
  });

  // Show/hide containers
  for (const [name, containerId] of Object.entries(tabContainerMap)) {
    const el = document.getElementById(containerId);
    if (el) el.classList.toggle('active', name === tab);
  }

  // Initialize leaflet map on first switch to 2D
  if (tab === 'map') {
    const map = initLeafletMap();
    // Leaflet needs a resize nudge when container becomes visible
    setTimeout(() => map.invalidateSize(), 100);
  }

  // Sync layers from 2D→3D when switching to globe
  if (tab === 'globe' && prevTab === 'map') {
    syncLayersToGlobe();
  }

  // Sync camera from 2D→3D
  if (tab === 'globe') {
    const viewer = getCesiumViewer();
    const map = getLeafletMap();
    if (viewer && map) {
      const center = map.getCenter();
      const zoom = map.getZoom();
      const height = 4e7 / Math.pow(2, zoom);
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(center.lng, center.lat, height),
        duration: 0,
      });
    }
    // Cesium needs a resize nudge when container becomes visible
    if (viewer) setTimeout(() => viewer.resize(), 100);
  }

  // Show/hide 3D-specific toolbar actions
  const rendererChoice = document.getElementById('renderer-choice');
  const measureBtn = document.getElementById('measure-btn');
  const annotateBtn = document.getElementById('annotate-btn');
  const pickBtn = document.getElementById('pick-btn');
  const drawBtn = document.getElementById('draw-btn');

  const is3D = tab === 'globe';
  const isMap = tab === 'map';

  if (rendererChoice) rendererChoice.style.display = is3D ? '' : 'none';
  if (measureBtn) measureBtn.style.display = is3D ? '' : 'none';
  if (annotateBtn) annotateBtn.style.display = is3D ? '' : 'none';
  if (pickBtn) pickBtn.style.display = is3D ? '' : 'none';
  if (drawBtn) drawBtn.style.display = isMap ? '' : 'none';

  // Asset panel only visible on 3D Globe tab
  const assetPanel = document.getElementById('asset-panel');
  if (assetPanel) assetPanel.style.display = is3D ? '' : 'none';
}

// Tracks which layers have already been synced to Cesium to avoid duplicates
const syncedLayers = new Set();

async function syncLayersToGlobe() {
  const viewer = getCesiumViewer();
  if (!viewer) return;

  const layers = getLayerMeta();

  for (const lm of layers) {
    if (syncedLayers.has(lm.file)) continue;
    if (!lm.geojsonCache) continue;

    try {
      const ds = await Cesium.GeoJsonDataSource.load(lm.geojsonCache, {
        stroke: Cesium.Color.fromCssColorString(lm.color),
        fill: Cesium.Color.fromCssColorString(lm.color).withAlpha(0.3),
        strokeWidth: 2,
      });
      viewer.dataSources.add(ds);
      syncedLayers.add(lm.file);
    } catch (e) {
      console.warn('Failed to sync layer to globe:', lm.name, e);
    }
  }

  // Fly to the data if we synced something
  if (viewer.dataSources.length > 0) {
    viewer.flyTo(viewer.dataSources.get(viewer.dataSources.length - 1));
  }
}

export function initTabs() {
  document.querySelectorAll('.viz-toolbar .tab').forEach((el) => {
    el.addEventListener('click', () => showTab(el.dataset.tab));
  });
}
