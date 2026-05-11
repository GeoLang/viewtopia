/**
 * Google Photorealistic 3D Tiles integration.
 *
 * Uses Google's Map Tiles API to load photorealistic 3D buildings and terrain.
 * Free tier: 2,500 sessions/month (each session = ~100 tile requests).
 * Requires a Google Cloud API key with Map Tiles API enabled.
 *
 * No Cesium Ion token needed — tiles are loaded directly from Google.
 */
import * as Cesium from 'cesium';
import { getCesiumViewer } from './renderers.js';

let tileset = null;

export function initGoogle3DTiles() {
  const toolbar = document.getElementById('toolbar-actions');
  if (!toolbar) return;

  const btn = document.createElement('button');
  btn.className = 'map-action-btn';
  btn.id = 'google3d-btn';
  btn.title = 'Load Google Photorealistic 3D Tiles';
  btn.textContent = '🏙 Google 3D';
  toolbar.appendChild(btn);

  btn.addEventListener('click', () => {
    btn.classList.toggle('active');
    if (btn.classList.contains('active')) {
      showGoogle3DPanel();
    } else {
      removeGoogle3DTiles();
      document.getElementById('google3d-panel')?.remove();
    }
  });
}

function showGoogle3DPanel() {
  let panel = document.getElementById('google3d-panel');
  if (panel) panel.remove();

  // Check for stored API key
  const storedKey = localStorage.getItem('viewtopia_google_api_key') || '';

  panel = document.createElement('div');
  panel.id = 'google3d-panel';
  panel.className = 'floating-panel';
  panel.innerHTML = `
    <div class="panel-header"><span>🏙 Google 3D Tiles</span><button class="panel-close" id="google3d-close">✕</button></div>
    <div class="panel-body">
      <p style="font-size:0.75rem;color:#94a3b8;margin-bottom:8px">
        Load Google's photorealistic 3D buildings. Requires a
        <a href="https://console.cloud.google.com/apis/library/tile.googleapis.com" target="_blank" style="color:#a78bfa">Google Cloud API key</a>
        with Map Tiles API enabled. Free tier: 2,500 sessions/month.
      </p>
      <label>API Key
        <input type="password" id="google3d-key" value="${storedKey}" placeholder="AIza..." style="width:100%;font-size:0.75rem;padding:4px 6px;background:#1a1d2e;border:1px solid #2d3148;border-radius:4px;color:#e2e8f0;">
      </label>
      <label style="display:flex;align-items:center;gap:6px;margin-top:4px">
        <input type="checkbox" id="google3d-save" ${storedKey ? 'checked' : ''}>
        <span style="font-size:0.72rem">Save key locally</span>
      </label>
      <div style="display:flex;gap:6px;margin-top:8px">
        <button class="map-action-btn" id="google3d-load">Load 3D Tiles</button>
        <button class="map-action-btn" id="google3d-remove">Remove</button>
      </div>
      <div id="google3d-status" style="font-size:0.72rem;margin-top:6px;color:#94a3b8"></div>
    </div>
  `;

  document.getElementById('viz-panel').appendChild(panel);

  document.getElementById('google3d-close').onclick = () => {
    panel.remove();
    document.getElementById('google3d-btn')?.classList.remove('active');
  };

  document.getElementById('google3d-load').onclick = () => loadGoogle3DTiles();
  document.getElementById('google3d-remove').onclick = () => {
    removeGoogle3DTiles();
    setStatus('Removed');
  };
}

async function loadGoogle3DTiles() {
  const viewer = getCesiumViewer();
  if (!viewer) {
    setStatus('No 3D viewer available');
    return;
  }

  const keyInput = document.getElementById('google3d-key');
  const apiKey = keyInput?.value?.trim();
  if (!apiKey) {
    setStatus('Please enter an API key');
    return;
  }

  // Save key if checkbox is checked
  const saveCheck = document.getElementById('google3d-save');
  if (saveCheck?.checked) {
    localStorage.setItem('viewtopia_google_api_key', apiKey);
  } else {
    localStorage.removeItem('viewtopia_google_api_key');
  }

  // Remove existing tileset
  removeGoogle3DTiles();

  setStatus('Loading...');

  try {
    // First, create a session token
    const sessionRes = await fetch(
      `https://tile.googleapis.com/v1/3dtiles/root.json?key=${encodeURIComponent(apiKey)}`
    );

    if (!sessionRes.ok) {
      const err = await sessionRes.text();
      if (sessionRes.status === 403) {
        setStatus('API key invalid or Map Tiles API not enabled');
      } else {
        setStatus(`Error ${sessionRes.status}: ${err.substring(0, 100)}`);
      }
      return;
    }

    // Load the tileset using Cesium's resource system with the API key
    const url = `https://tile.googleapis.com/v1/3dtiles/root.json?key=${encodeURIComponent(apiKey)}`;

    tileset = await Cesium.Cesium3DTileset.fromUrl(url, {
      showCreditsOnScreen: true,
    });

    viewer.scene.primitives.add(tileset);

    // Credits attribution (required by Google ToS)
    tileset.tileLoad.addEventListener((tile) => {
      const content = tile.content;
      if (content) {
        const credits = content.getFeature?.(0)?.getProperty?.('copyright');
        if (credits) {
          viewer.creditDisplay.addStaticCredit(new Cesium.Credit(credits, true));
        }
      }
    });

    setStatus('Loaded! Fly to a city to see photorealistic buildings.');

    // Enable globe depth testing for proper occlusion
    viewer.scene.globe.depthTestAgainstTerrain = true;

  } catch (e) {
    console.error('[Google3D] Failed to load:', e);
    setStatus(`Failed: ${e.message}`);
  }
}

function removeGoogle3DTiles() {
  const viewer = getCesiumViewer();
  if (viewer && tileset) {
    viewer.scene.primitives.remove(tileset);
    tileset = null;
  }
}

function setStatus(msg) {
  const el = document.getElementById('google3d-status');
  if (el) el.textContent = msg;
}
