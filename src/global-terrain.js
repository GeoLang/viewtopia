/**
 * Global Terrain — load high-res terrain from free open data sources.
 *
 * Provides realistic topography without Cesium Ion. Supports:
 * - Maptiler terrain tiles (free API key, quantized-mesh)
 * - TileTopia custom terrain (from uploaded DEMs)
 * - Ellipsoid fallback (flat earth)
 */
import * as Cesium from 'cesium';
import { getCesiumViewer } from './renderers.js';
import { getSetting } from './settings.js';

let currentProvider = null;
let terrainEnabled = false;

export function initGlobalTerrain() {
  // Add terrain toggle to the Analysis dropdown
  const analysisContent = document.querySelector('#analysis-menu .toolbar-dropdown-content');
  if (analysisContent) {
    const btn = document.createElement('button');
    btn.className = 'map-action-btn';
    btn.id = 'global-terrain-btn';
    btn.title = 'Toggle global terrain';
    btn.textContent = '🏔 Terrain';
    analysisContent.appendChild(btn);

    btn.addEventListener('click', () => toggleTerrain(btn));
  }

  // Auto-enable terrain if TileTopia has terrain available
  autoDetectTerrain();
}

async function autoDetectTerrain() {
  try {
    const res = await fetch('/api/v1/terrain/layer.json', { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      await setTerrainSource('tiletopia');
      const btn = document.getElementById('global-terrain-btn');
      if (btn) btn.classList.add('active');
      terrainEnabled = true;
    }
  } catch {
    // No TileTopia terrain, try Maptiler
    const maptilerKey = getSetting('maptilerKey');
    if (maptilerKey) {
      await setTerrainSource('maptiler', maptilerKey);
      const btn = document.getElementById('global-terrain-btn');
      if (btn) btn.classList.add('active');
      terrainEnabled = true;
    }
  }
}

async function toggleTerrain(btn) {
  const viewer = getCesiumViewer();
  if (!viewer) return;

  if (terrainEnabled) {
    // Disable terrain → flat ellipsoid
    viewer.scene.terrainProvider = new Cesium.EllipsoidTerrainProvider();
    currentProvider = null;
    terrainEnabled = false;
    btn.classList.remove('active');
    return;
  }

  // Show terrain source picker
  showTerrainPicker(btn);
}

function showTerrainPicker(btn) {
  let panel = document.getElementById('terrain-picker-panel');
  if (panel) { panel.remove(); return; }

  const maptilerKey = getSetting('maptilerKey') || '';

  panel = document.createElement('div');
  panel.id = 'terrain-picker-panel';
  panel.className = 'floating-panel';
  panel.innerHTML = `
    <div class="panel-header"><span>🏔 Global Terrain</span><button class="panel-close" id="terrain-picker-close">✕</button></div>
    <div class="panel-body">
      <p style="font-size:0.72rem;color:#94a3b8;margin-bottom:8px">
        Add realistic terrain elevation to the 3D globe. Choose a source:
      </p>

      <button class="map-action-btn" id="terrain-src-tiletopia" style="width:100%;margin-bottom:4px">
        📡 TileTopia Terrain (custom DEMs)
      </button>

      <button class="map-action-btn" id="terrain-src-maptiler" style="width:100%;margin-bottom:4px">
        🗺 Maptiler (free, global coverage)
      </button>

      <div id="maptiler-key-section" style="display:${maptilerKey ? 'none' : 'block'};margin-top:8px">
        <label style="font-size:0.72rem;color:#94a3b8">
          Maptiler API Key (free at <a href="https://cloud.maptiler.com/account/keys/" target="_blank" style="color:#a78bfa">maptiler.com</a>)
          <input type="text" id="terrain-maptiler-key" value="${maptilerKey}" placeholder="Your Maptiler key..." style="width:100%;font-size:0.72rem;padding:4px 6px;background:#0f1117;border:1px solid #2d3148;border-radius:4px;color:#e2e8f0;margin-top:4px">
        </label>
      </div>

      <button class="map-action-btn" id="terrain-src-cesium" style="width:100%;margin-bottom:4px">
        🌐 Cesium Ion World Terrain (needs Ion token)
      </button>

      <div id="terrain-status" style="font-size:0.72rem;margin-top:6px;color:#94a3b8"></div>
    </div>
  `;

  document.getElementById('viz-panel').appendChild(panel);

  document.getElementById('terrain-picker-close').onclick = () => panel.remove();

  document.getElementById('terrain-src-tiletopia').onclick = async () => {
    setTerrainStatus('Loading TileTopia terrain...');
    const ok = await setTerrainSource('tiletopia');
    if (ok) {
      terrainEnabled = true;
      btn.classList.add('active');
      panel.remove();
    } else {
      setTerrainStatus('TileTopia terrain not available. Upload a DEM first.');
    }
  };

  document.getElementById('terrain-src-maptiler').onclick = async () => {
    let key = maptilerKey || document.getElementById('terrain-maptiler-key')?.value?.trim();
    if (!key) {
      document.getElementById('maptiler-key-section').style.display = 'block';
      setTerrainStatus('Enter your free Maptiler API key above');
      return;
    }

    // Save key to settings
    const { setSetting: set } = await import('./settings.js');
    set('maptilerKey', key);

    setTerrainStatus('Loading Maptiler terrain...');
    const ok = await setTerrainSource('maptiler', key);
    if (ok) {
      terrainEnabled = true;
      btn.classList.add('active');
      panel.remove();
    } else {
      setTerrainStatus('Failed to load Maptiler terrain. Check your API key.');
    }
  };

  document.getElementById('terrain-src-cesium').onclick = async () => {
    const ionToken = getSetting('cesiumIonToken');
    if (!ionToken) {
      setTerrainStatus('Add your Cesium Ion token in Settings (⚙) first');
      return;
    }
    setTerrainStatus('Loading Cesium World Terrain...');
    const ok = await setTerrainSource('cesium-ion', ionToken);
    if (ok) {
      terrainEnabled = true;
      btn.classList.add('active');
      panel.remove();
    } else {
      setTerrainStatus('Failed to load Cesium World Terrain');
    }
  };
}

async function setTerrainSource(source, key) {
  const viewer = getCesiumViewer();
  if (!viewer) return false;

  try {
    let provider;

    switch (source) {
      case 'tiletopia': {
        const res = await fetch('/api/v1/terrain/layer.json', { signal: AbortSignal.timeout(3000) });
        if (!res.ok) return false;
        provider = await Cesium.CesiumTerrainProvider.fromUrl('/api/v1/terrain');
        break;
      }

      case 'maptiler': {
        if (!key) return false;
        // Maptiler provides quantized-mesh terrain tiles
        provider = await Cesium.CesiumTerrainProvider.fromUrl(
          `https://api.maptiler.com/tiles/terrain-quantized-mesh-v2/?key=${encodeURIComponent(key)}`,
          {
            requestVertexNormals: true,
            requestWaterMask: false,
            credit: new Cesium.Credit('<a href="https://www.maptiler.com/copyright/" target="_blank">© MapTiler</a> <a href="https://www.openstreetmap.org/copyright" target="_blank">© OpenStreetMap</a>', true),
          }
        );
        break;
      }

      case 'cesium-ion': {
        if (!key) return false;
        Cesium.Ion.defaultAccessToken = key;
        provider = await Cesium.CesiumTerrainProvider.fromIonAssetId(1, {
          requestVertexNormals: true,
          requestWaterMask: true,
        });
        break;
      }

      default:
        return false;
    }

    viewer.scene.terrainProvider = provider;
    viewer.scene.globe.depthTestAgainstTerrain = true;
    currentProvider = provider;
    console.log(`[Terrain] Loaded ${source} terrain`);
    return true;

  } catch (e) {
    console.error(`[Terrain] Failed to load ${source}:`, e);
    return false;
  }
}

function setTerrainStatus(msg) {
  const el = document.getElementById('terrain-status');
  if (el) el.textContent = msg;
}
