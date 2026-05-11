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
  const maxArea = opts.maxArea ?? 0.5;
  let rect = viewer.camera.computeViewRectangle();

  if (!rect) {
    const carto = viewer.camera.positionCartographic;
    if (!carto) return [];
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

  if ((north - south) * (east - west) > maxArea) {
    console.warn('View too wide for OSM building query — zoom in');
    return [];
  }

  const bbox = `${south},${west},${north},${east}`;
  const query = `[out:json][timeout:15];way["building"](${bbox});out body;>;out skel qt;`;
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: `data=${encodeURIComponent(query)}`,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  if (!res.ok) return [];

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
      osmEntities = await loadOsmBuildings(viewer);
      if (osmEntities.length > 0) {
        btn.textContent = `🏢 ${osmEntities.length}`;
        viewer.flyTo(viewer.entities);
      } else {
        btn.textContent = '🏢 Buildings';
        btn.classList.remove('active');
        alert('No buildings found in current view. Try zooming in closer to a city area.');
      }
    } catch (e) {
      console.error('Failed to load OSM buildings:', e);
      alert(`Failed to load OSM buildings: ${e.message}`);
      btn.textContent = '🏢 Buildings';
      btn.classList.remove('active');
    }
  });
}
