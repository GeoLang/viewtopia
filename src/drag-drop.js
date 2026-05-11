/**
 * Drag-and-drop file import — drop files onto the viz area to import.
 */
import * as Cesium from 'cesium';
import { getCesiumViewer } from './renderers.js';

export function initDragDrop() {
  const vizPanel = document.getElementById('viz-panel');
  if (!vizPanel) return;

  // Create overlay
  const overlay = document.createElement('div');
  overlay.id = 'drop-overlay';
  overlay.innerHTML = '<div class="drop-icon">📂</div><div>Drop files to import</div>';
  vizPanel.appendChild(overlay);

  let dragCounter = 0;

  vizPanel.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    overlay.classList.add('visible');
  });

  vizPanel.addEventListener('dragleave', () => {
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      overlay.classList.remove('visible');
    }
  });

  vizPanel.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });

  vizPanel.addEventListener('drop', (e) => {
    e.preventDefault();
    dragCounter = 0;
    overlay.classList.remove('visible');
    const files = Array.from(e.dataTransfer.files);
    if (!files.length) return;
    handleDroppedFiles(files);
  });
}

function handleDroppedFiles(files) {
  for (const file of files) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (['geojson', 'json'].includes(ext)) {
      loadGeoJSON(file);
    } else if (['gpx', 'kml'].includes(ext)) {
      loadTrack(file);
    } else if (['csv'].includes(ext)) {
      loadCSV(file);
    } else if (['las', 'laz', 'e57', 'ply', 'tif', 'tiff', 'gltf', 'glb'].includes(ext)) {
      uploadToTileTopia(file);
    } else {
      console.warn('Unsupported file type:', ext);
    }
  }
}

function loadGeoJSON(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const json = JSON.parse(reader.result);
      const viewer = getCesiumViewer();
      if (viewer) {
        import('cesium').then(Cesium => {
          Cesium.GeoJsonDataSource.load(json, {
            stroke: Cesium.Color.CYAN,
            fill: Cesium.Color.CYAN.withAlpha(0.3),
            strokeWidth: 2,
          }).then(ds => {
            viewer.dataSources.add(ds);
            viewer.flyTo(ds);
          });
        });
      }
    } catch (e) {
      console.error('Invalid GeoJSON:', e);
    }
  };
  reader.readAsText(file);
}

function loadTrack(file) {
  // Delegate to track-import module
  import('./track-import.js').then(mod => {
    if (mod.importTrackFile) {
      mod.importTrackFile(file);
    }
  });
}

function loadCSV(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const lines = reader.result.trim().split('\n');
    if (lines.length < 2) return;
    const headers = lines[0].split(',').map(h => h.trim());
    const latIdx = headers.findIndex(h => /^(lat|latitude)$/i.test(h));
    const lonIdx = headers.findIndex(h => /^(lon|lng|longitude)$/i.test(h));
    if (latIdx < 0 || lonIdx < 0) {
      console.warn('CSV needs lat/lon columns');
      return;
    }
    const viewer = getCesiumViewer();
    if (!viewer) return;
    import('cesium').then(Cesium => {
      for (let i = 1; i < Math.min(lines.length, 5000); i++) {
        const cols = lines[i].split(',');
        const lat = parseFloat(cols[latIdx]);
        const lon = parseFloat(cols[lonIdx]);
        if (isNaN(lat) || isNaN(lon)) continue;
        viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(lon, lat),
          point: { pixelSize: 6, color: Cesium.Color.CYAN },
        });
      }
    });
  };
  reader.readAsText(file);
}

async function uploadToTileTopia(file) {
  const formData = new FormData();
  formData.append('file', file);
  try {
    const res = await fetch('/api/v1/assets/upload', { method: 'POST', body: formData });
    if (res.ok) {
      const data = await res.json();
      console.log('Asset uploaded:', data);
    }
  } catch (e) {
    console.error('Upload failed:', e);
  }
}
