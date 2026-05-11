/**
 * Open Data Sources — zero-config replacements for Cesium Ion.
 *
 * Provides OSM buildings from Overpass API, entirely client-side.
 */
import * as Cesium from 'cesium';
import { getCesiumViewer } from './renderers.js';

// ─── OSM Buildings (Overpass API, client-side) ──────────────────────────────

/**
 * Fetch OSM buildings from Overpass API for the current view and create
 * extruded Cesium entities.  Works entirely client-side — no server needed.
 */
export async function loadOsmBuildings(viewer, opts = {}) {
  // Always use camera center + height-based span to avoid the
  // computeViewRectangle() issue in 3D (returns entire hemisphere)
  const carto = viewer.camera.positionCartographic;
  if (!carto) { console.warn('OSM Buildings: no camera position'); return []; }

  const centerLon = Cesium.Math.toDegrees(carto.longitude);
  const centerLat = Cesium.Math.toDegrees(carto.latitude);
  const height = carto.height;

  // Calculate span based on camera height — lower = smaller area = more detail
  // At 500m height, span ~0.005° (~500m); at 5000m, span ~0.02° (~2km)
  let span = Math.min(Math.max(height * 0.000005, 0.002), 0.02);
  console.log(`OSM Buildings: camera at ${centerLat.toFixed(5)},${centerLon.toFixed(5)} h=${height.toFixed(0)}m span=${span.toFixed(5)}°`);

  const south = centerLat - span;
  const north = centerLat + span;
  const west = centerLon - span;
  const east = centerLon + span;

  const bbox = `${south},${west},${north},${east}`;
  const query = `[out:json][timeout:25];way["building"](${bbox});out body;>;out skel qt;`;
  console.log(`OSM Buildings: querying Overpass for bbox ${bbox}`);
  
  // Try multiple Overpass endpoints (primary can be overloaded)
  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  ];
  
  let res = null;
  for (const endpoint of endpoints) {
    try {
      console.log(`OSM Buildings: trying ${endpoint}...`);
      res = await fetch(endpoint, {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: AbortSignal.timeout(20000),
      });
      if (res.ok) {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('json')) {
          console.log(`OSM Buildings: got response from ${endpoint}`);
          break;
        } else {
          console.warn(`OSM Buildings: ${endpoint} returned non-JSON (server busy), trying next...`);
          res = null;
        }
      } else {
        console.warn(`OSM Buildings: ${endpoint} returned ${res.status}, trying next...`);
        res = null;
      }
    } catch (e) {
      console.warn(`OSM Buildings: ${endpoint} failed: ${e.message}, trying next...`);
      res = null;
    }
  }
  
  if (!res) {
    console.error('OSM Buildings: all Overpass endpoints failed');
    return [];
  }

  const data = await res.json();
  const nodes = new Map();
  const ways = [];
  for (const el of data.elements) {
    if (el.type === 'node') nodes.set(el.id, el);
    else if (el.type === 'way') ways.push(el);
  }
  console.log(`OSM: fetched ${nodes.size} nodes, ${ways.length} ways for bbox ${bbox}`);

  const entities = [];
  for (const way of ways) {
    const coords = way.nodes
      .map((id) => nodes.get(id))
      .filter(Boolean)
      .flatMap((n) => [n.lon, n.lat]);
    if (coords.length < 6) continue;

    const levels = parseInt(way.tags?.['building:levels'] ?? '3', 10);
    const height = parseFloat(way.tags?.['height'] ?? String(levels * 3.2));

    let material;
    try {
      material = Cesium.Color.fromCssColorString(way.tags?.['building:colour'] || '#c8b896').withAlpha(0.85);
    } catch { material = Cesium.Color.fromCssColorString('#c8b896').withAlpha(0.85); }
    if (!material) material = Cesium.Color.fromCssColorString('#c8b896').withAlpha(0.85);

    entities.push(
      viewer.entities.add({
        polygon: {
          hierarchy: Cesium.Cartesian3.fromDegreesArray(coords),
          height: 0,
          extrudedHeight: height,
          material,
          outline: true,
          outlineColor: Cesium.Color.BLACK.withAlpha(0.3),
        },
        properties: way.tags,
      }),
    );
  }
  return entities;
}

// ─── Toolbar integration ────────────────────────────────────────────────────

let osmEntities = [];

export function initOsmBuildings() {
  const btn = document.getElementById('osm-buildings-btn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    // Check if we're in 3D globe tab
    const activeTab = document.querySelector('.viz-toolbar .tab.active');
    if (activeTab && activeTab.dataset.tab !== 'globe') {
      alert('OSM Buildings only works in 3D Globe view.\nSwitch to the "3D Globe" tab first.');
      return;
    }

    const viewer = getCesiumViewer();
    if (!viewer) {
      alert('OSM Buildings requires the 3D Globe view.\nCesium viewer not initialized.');
      return;
    }

    // Toggle off — remove existing buildings
    if (osmEntities.length > 0) {
      for (const e of osmEntities) viewer.entities.remove(e);
      osmEntities = [];
      btn.classList.remove('active');
      btn.textContent = '🏢 Buildings';
      return;
    }

    btn.classList.add('active');
    btn.textContent = '⏳ Loading…';
    try {
      console.log('OSM Buildings: button clicked, starting load...');
      osmEntities = await loadOsmBuildings(viewer);
      console.log(`OSM Buildings: got ${osmEntities.length} entities`);
      if (osmEntities.length > 0) {
        btn.textContent = `🏢 ${osmEntities.length}`;
        viewer.flyTo(viewer.entities);
      } else {
        btn.textContent = '🏢 Buildings';
        btn.classList.remove('active');
        alert('No buildings found in current view.\n\nTry zooming in closer to a city/town area.\nThe view is clamped to ~0.1° (~11km) around center.');
      }
    } catch (e) {
      console.error('Failed to load OSM buildings:', e);
      alert(`Failed to load OSM buildings: ${e.message}`);
      btn.textContent = '🏢 Buildings';
      btn.classList.remove('active');
    }
  });
}
