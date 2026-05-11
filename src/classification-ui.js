/**
 * Point cloud classification UI — trigger TileTopia's ML classifier from the viewer.
 * Shows progress and allows viewing classification results.
 */
import { getCesiumViewer } from './renderers.js';
import { hasTileTopia } from './backends.js';

let panel;

export function initClassificationUI() {
  if (!hasTileTopia()) return;

  const toolbar = document.getElementById('toolbar-actions');
  if (!toolbar) return;

  const btn = document.createElement('button');
  btn.className = 'map-action-btn';
  btn.id = 'classify-btn';
  btn.title = 'Point cloud classification';
  btn.textContent = '🧠 Classify';
  toolbar.appendChild(btn);

  panel = document.createElement('div');
  panel.id = 'classify-panel';
  panel.style.display = 'none';
  panel.innerHTML = `
    <div class="clf-header">
      <span>🧠 Point Cloud Classification</span>
      <button id="clf-close">×</button>
    </div>
    <div class="clf-body">
      <div id="clf-asset-select-wrap">
        <label>Select asset:
          <select id="clf-asset-select"><option value="">Loading…</option></select>
        </label>
      </div>
      <div class="clf-options">
        <label>Model:
          <select id="clf-model">
            <option value="pointnet2">PointNet++</option>
            <option value="randla">RandLA-Net</option>
            <option value="kpconv">KPConv</option>
          </select>
        </label>
        <label>Classes:
          <select id="clf-classes">
            <option value="default">Default (ground/building/vegetation/other)</option>
            <option value="asprs">ASPRS full (20 classes)</option>
            <option value="custom">Custom</option>
          </select>
        </label>
      </div>
      <div class="clf-actions">
        <button id="clf-run" class="map-action-btn">▶ Run Classification</button>
        <button id="clf-view" class="map-action-btn">👁 View Results</button>
      </div>
      <div id="clf-progress" class="clf-progress" style="display:none">
        <div class="clf-progress-bar"><div class="clf-progress-fill" id="clf-fill"></div></div>
        <span id="clf-progress-text">0%</span>
      </div>
      <div id="clf-status"></div>
    </div>
  `;
  document.getElementById('viz-content')?.appendChild(panel);

  btn.addEventListener('click', () => {
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    if (panel.style.display === 'block') loadAssets();
  });
  document.getElementById('clf-close').addEventListener('click', () => panel.style.display = 'none');
  document.getElementById('clf-run').addEventListener('click', runClassification);
  document.getElementById('clf-view').addEventListener('click', viewClassification);
}

async function loadAssets() {
  try {
    const res = await fetch('/api/v1/assets');
    if (!res.ok) return;
    const data = await res.json();
    const select = document.getElementById('clf-asset-select');
    select.innerHTML = '<option value="">Select…</option>';
    for (const asset of (data.assets || data)) {
      const opt = document.createElement('option');
      opt.value = asset.id || asset.name;
      opt.textContent = asset.name || asset.id;
      select.appendChild(opt);
    }
  } catch (e) {
    document.getElementById('clf-status').textContent = 'Failed to load assets';
  }
}

async function runClassification() {
  const assetId = document.getElementById('clf-asset-select').value;
  if (!assetId) {
    document.getElementById('clf-status').textContent = 'Select an asset first';
    return;
  }

  const model = document.getElementById('clf-model').value;
  const classes = document.getElementById('clf-classes').value;
  const status = document.getElementById('clf-status');
  const progress = document.getElementById('clf-progress');
  const fill = document.getElementById('clf-fill');
  const text = document.getElementById('clf-progress-text');

  progress.style.display = 'flex';
  fill.style.width = '0%';
  text.textContent = '0%';
  status.textContent = 'Starting classification…';

  try {
    const res = await fetch(`/api/v1/assets/${encodeURIComponent(assetId)}/classify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, classes }),
    });

    if (!res.ok) throw new Error('Classification failed');

    // Poll for progress
    const data = await res.json();
    const jobId = data.job_id || data.id;

    if (jobId) {
      pollProgress(assetId, jobId);
    } else {
      fill.style.width = '100%';
      text.textContent = '100%';
      status.textContent = 'Classification complete!';
    }
  } catch (e) {
    status.textContent = 'Error: ' + e.message;
  }
}

async function pollProgress(assetId, jobId) {
  const fill = document.getElementById('clf-fill');
  const text = document.getElementById('clf-progress-text');
  const status = document.getElementById('clf-status');

  const poll = async () => {
    try {
      const res = await fetch(`/api/v1/assets/${encodeURIComponent(assetId)}/classify/${encodeURIComponent(jobId)}`);
      if (!res.ok) return;
      const data = await res.json();
      const pct = data.progress || 0;
      fill.style.width = pct + '%';
      text.textContent = pct + '%';
      status.textContent = data.status || 'Processing…';

      if (pct < 100 && data.status !== 'complete') {
        setTimeout(poll, 2000);
      } else {
        status.textContent = 'Classification complete! Click "View Results" to see.';
      }
    } catch {
      status.textContent = 'Poll error';
    }
  };
  poll();
}

async function viewClassification() {
  const assetId = document.getElementById('clf-asset-select').value;
  if (!assetId) return;

  const viewer = getCesiumViewer();
  if (!viewer) return;

  // Load the classified tileset with classification styling
  try {
    const tileset = await Cesium.Cesium3DTileset.fromUrl(`/api/v1/tilesets/${encodeURIComponent(assetId)}/tileset.json`);
    tileset.style = new Cesium.Cesium3DTileStyle({
      color: {
        conditions: [
          ['${Classification} === 2', 'color("#8B4513")'],  // Ground
          ['${Classification} === 6', 'color("#228B22")'],  // Building
          ['${Classification} === 3', 'color("#32CD32")'],  // Low vegetation
          ['${Classification} === 4', 'color("#006400")'],  // Medium vegetation
          ['${Classification} === 5', 'color("#004d00")'],  // High vegetation
          ['${Classification} === 9', 'color("#0000FF")'],  // Water
          ['true', 'color("#CCCCCC")'],                     // Unclassified
        ],
      },
    });
    viewer.scene.primitives.add(tileset);
    viewer.flyTo(tileset);
    document.getElementById('clf-status').textContent = 'Showing classified point cloud';
  } catch (e) {
    document.getElementById('clf-status').textContent = 'Error loading: ' + e.message;
  }
}
