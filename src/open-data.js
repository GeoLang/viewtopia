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
  const maxArea = opts.maxArea ?? 2.0;
  let rect = viewer.camera.computeViewRectangle();

  if (!rect) {
    const carto = viewer.camera.positionCartographic;
    if (!carto) { console.warn('OSM Buildings: no camera position'); return []; }
    const span = 0.005;
    rect = new Cesium.Rectangle(
      carto.longitude - span,
      carto.latitude - span,
      carto.longitude + span,
      carto.latitude + span,
    );
  }

  const south = Cesium.Math.toDegrees(rect.south);
  const west = Cesium.Math.toDegrees(rect.west);
  const north = Cesium.Math.toDegrees(rect.north);
  const east = Cesium.Math.toDegrees(rect.east);

  const area = (north - south) * (east - west);
  console.log(`OSM Buildings: bbox ${south.toFixed(4)},${west.toFixed(4)},${north.toFixed(4)},${east.toFixed(4)} area=${area.toFixed(4)} deg²`);

  if (area > maxArea) {
    console.warn(`View too wide (${area.toFixed(2)} deg²) for OSM building query — zoom in more`);
    return [];
  }

  // Clamp bbox to reasonable size for Overpass (max ~0.1 deg span if very large)
  const clampedSouth = Math.max(south, (south + north) / 2 - 0.05);
  const clampedNorth = Math.min(north, (south + north) / 2 + 0.05);
  const clampedWest = Math.max(west, (east + west) / 2 - 0.05);
  const clampedEast = Math.min(east, (east + west) / 2 + 0.05);

  const bbox = `${clampedSouth},${clampedWest},${clampedNorth},${clampedEast}`;
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
