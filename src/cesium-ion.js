/**
 * Cesium Ion integration — load assets from a Cesium Ion account.
 */
import * as Cesium from 'cesium';
import { getCesiumViewer } from './renderers.js';

let ionToken = '';

export function initCesiumIon() {
  // Check for stored token
  ionToken = localStorage.getItem('vt-ion-token') || '';

  // Add Ion button to toolbar
  const toolbar = document.getElementById('toolbar-actions');
  if (!toolbar) return;

  const btn = document.createElement('button');
  btn.className = 'map-action-btn';
  btn.id = 'ion-btn';
  btn.title = 'Cesium Ion';
  btn.textContent = '🌐 Ion';
  toolbar.appendChild(btn);

  btn.addEventListener('click', toggleIonPanel);

  // Create panel
  const panel = document.createElement('div');
  panel.id = 'ion-panel';
  panel.style.display = 'none';
  panel.innerHTML = `
    <div class="ion-header">
      <span>🌐 Cesium Ion Assets</span>
      <button id="ion-close" title="Close">×</button>
    </div>
    <div class="ion-token-row">
      <input type="text" id="ion-token-input" placeholder="Paste Ion access token…" value="${ionToken}" />
      <button id="ion-connect-btn">Connect</button>
    </div>
    <div id="ion-assets-list"></div>
  `;
  document.getElementById('viz-content').appendChild(panel);

  document.getElementById('ion-close').addEventListener('click', () => panel.style.display = 'none');
  document.getElementById('ion-connect-btn').addEventListener('click', connectIon);
}

function toggleIonPanel() {
  const panel = document.getElementById('ion-panel');
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

async function connectIon() {
  const input = document.getElementById('ion-token-input');
  ionToken = input.value.trim();
  if (!ionToken) return;
  localStorage.setItem('vt-ion-token', ionToken);

  // Set default token for Cesium
  const Cesium = await import('cesium');
  Cesium.Ion.defaultAccessToken = ionToken;

  // Fetch assets
  try {
    const res = await fetch('https://api.cesium.com/v1/assets', {
      headers: { Authorization: `Bearer ${ionToken}` },
    });
    if (!res.ok) throw new Error('Auth failed');
    const data = await res.json();
    renderAssetList(data.items || []);
  } catch (e) {
    document.getElementById('ion-assets-list').innerHTML = `<div class="ion-error">Failed to connect: ${e.message}</div>`;
  }
}

function renderAssetList(assets) {
  const list = document.getElementById('ion-assets-list');
  if (assets.length === 0) {
    list.innerHTML = '<div class="ion-empty">No assets found</div>';
    return;
  }
  list.innerHTML = '';
  for (const asset of assets) {
    const row = document.createElement('div');
    row.className = 'ion-asset-row';
    row.innerHTML = `
      <span class="ion-asset-name">${asset.name}</span>
      <span class="ion-asset-type">${asset.type}</span>
      <button class="ion-load-btn" data-id="${asset.id}" data-type="${asset.type}">Load</button>
    `;
    row.querySelector('.ion-load-btn').addEventListener('click', () => loadIonAsset(asset.id, asset.type, asset.name));
    list.appendChild(row);
  }
}

async function loadIonAsset(assetId, type, name) {
  const viewer = getCesiumViewer();
  if (!viewer) return;
  const Cesium = await import('cesium');

  try {
    if (type === '3DTILES') {
      const tileset = await Cesium.Cesium3DTileset.fromIonAssetId(assetId);
      viewer.scene.primitives.add(tileset);
      viewer.flyTo(tileset);
    } else if (type === 'TERRAIN') {
      const provider = await Cesium.CesiumTerrainProvider.fromIonAssetId(assetId);
      viewer.scene.terrainProvider = provider;
    } else if (type === 'IMAGERY') {
      const provider = await Cesium.IonImageryProvider.fromAssetId(assetId);
      viewer.imageryLayers.addImageryProvider(provider);
    } else {
      console.warn('Unsupported Ion asset type:', type);
    }
    console.log(`Loaded Ion asset: ${name} (${assetId})`);
  } catch (e) {
    console.error('Failed to load Ion asset:', e);
  }
}
