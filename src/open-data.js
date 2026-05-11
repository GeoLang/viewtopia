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
  // At 500m height, span ~0.005° (~500m); at 5000m, span ~0.03° (~3km)
  let span = Math.min(Math.max(height * 0.00001, 0.002), 0.05);
  console.log(`OSM Buildings: camera at ${centerLat.toFixed(5)},${centerLon.toFixed(5)} h=${height.toFixed(0)}m span=${span.toFixed(5)}°`);

  const south = centerLat - span;
  const north = centerLat + span;
  const west = centerLon - span;
  const east = centerLon + span;

  const bbox = `${south},${west},${north},${east}`;
  const query = `[out:json][timeout:25];way["building"](${bbox});out body;>;out skel qt;`;
  console.log(`OSM Buildings: querying Overpass for bbox ${bbox}`);
  
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: `data=${encodeURIComponent(query)}`,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  
  if (!res.ok) {
    console.error(`OSM Buildings: Overpass returned ${res.status}`);
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

    entities.push(
      viewer.entities.add({
        polygon: {
          hierarchy: Cesium.Cartesian3.fromDegreesArray(coords),
          height: 0,
          extrudedHeight: height,
          material: Cesium.Color.fromCssColorString(way.tags?.['building:colour'] ?? '#c8b896').withAlpha(0.85),
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

  // Disable when not in 3D globe mode
  const rendererSelect = document.getElementById('renderer-choice');
  if (rendererSelect) {
    const updateState = () => {
      const is3D = rendererSelect.value === 'cesium';
      btn.disabled = !is3D;
      btn.style.opacity = is3D ? '1' : '0.4';
      btn.title = is3D ? 'Load OSM buildings in view' : 'OSM Buildings (3D Globe only)';
    };
    rendererSelect.addEventListener('change', updateState);
    updateState();
  }

  btn.addEventListener('click', async () => {
    const viewer = getCesiumViewer();
    if (!viewer) {
      alert('OSM Buildings requires the 3D Globe view');
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
