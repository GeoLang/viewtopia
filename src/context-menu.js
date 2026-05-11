/**
 * Right-click context menu — quick actions at the clicked location.
 */
import { getCesiumViewer } from './renderers.js';
import { getLeafletMap } from './leaflet-view.js';

let menuEl;
let clickLat = 0;
let clickLon = 0;

const ACTIONS = [
  { label: '📏 Measure from here', action: 'measure' },
  { label: '📌 Add annotation', action: 'annotate' },
  { label: '🧭 Route from here', action: 'route-from' },
  { label: '🧭 Route to here', action: 'route-to' },
  { label: '⏱ Isochrone from here', action: 'isochrone' },
  { label: '📋 Copy coordinates', action: 'copy-coords' },
  { label: '🔎 What\'s here?', action: 'whats-here' },
];

export function initContextMenu() {
  menuEl = document.createElement('div');
  menuEl.id = 'context-menu';
  menuEl.style.display = 'none';
  document.body.appendChild(menuEl);

  for (const item of ACTIONS) {
    const row = document.createElement('div');
    row.className = 'ctx-item';
    row.textContent = item.label;
    row.addEventListener('click', () => handleAction(item.action));
    menuEl.appendChild(row);
  }

  document.addEventListener('click', () => hideMenu());
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideMenu(); });

  // Cesium right-click
  const viewer = getCesiumViewer();
  if (viewer) {
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((click) => {
      const cart = viewer.scene.globe.pick(viewer.camera.getPickRay(click.position), viewer.scene);
      if (cart) {
        const carto = Cesium.Cartographic.fromCartesian(cart);
        clickLat = Cesium.Math.toDegrees(carto.latitude);
        clickLon = Cesium.Math.toDegrees(carto.longitude);
        showMenu(click.position.x, click.position.y + viewer.scene.canvas.getBoundingClientRect().top);
      }
    }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
  }

  // Leaflet right-click
  const map = getLeafletMap();
  if (map) {
    map.on('contextmenu', (e) => {
      clickLat = e.latlng.lat;
      clickLon = e.latlng.lng;
      const rect = map.getContainer().getBoundingClientRect();
      showMenu(e.containerPoint.x + rect.left, e.containerPoint.y + rect.top);
    });
  }
}

function showMenu(x, y) {
  menuEl.style.left = x + 'px';
  menuEl.style.top = y + 'px';
  menuEl.style.display = 'block';
}

function hideMenu() {
  if (menuEl) menuEl.style.display = 'none';
}

function handleAction(action) {
  hideMenu();
  switch (action) {
    case 'copy-coords':
      navigator.clipboard.writeText(`${clickLat.toFixed(6)}, ${clickLon.toFixed(6)}`);
      break;
    case 'whats-here':
      fetch(`https://nominatim.openstreetmap.org/reverse?lat=${clickLat}&lon=${clickLon}&format=json`)
        .then(r => r.json())
        .then(d => alert(d.display_name || 'No result'));
      break;
    case 'annotate':
      import('./annotations.js').then(m => m.addAnnotationAt && m.addAnnotationAt(clickLon, clickLat));
      break;
    case 'isochrone':
      import('./routing.js').then(m => m.computeIsochrone && m.computeIsochrone(clickLon, clickLat));
      break;
    default:
      console.log(`Context action "${action}" at ${clickLat}, ${clickLon}`);
  }
}
