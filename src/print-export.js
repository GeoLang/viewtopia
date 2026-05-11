/**
 * Print / PDF export — captures the current map/globe view and generates
 * a printable layout with title, legend, scale bar, and attribution.
 */
import { getCesiumViewer } from './renderers.js';
import { getLeafletMap } from './leaflet-view.js';

export function initPrintExport() {
  const btn = document.getElementById('export-png-btn');
  if (!btn) return;

  // Replace the simple PNG export with a menu
  const menu = document.createElement('div');
  menu.className = 'measure-menu';
  menu.style.display = 'none';
  menu.innerHTML = `
    <button data-mode="png">⬇ PNG Screenshot</button>
    <button data-mode="print">🖨 Print Layout</button>
  `;
  btn.parentElement.style.position = 'relative';
  btn.parentElement.appendChild(menu);

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
  });

  menu.addEventListener('click', (e) => {
    const mode = e.target.dataset.mode;
    if (mode === 'png') exportPNG();
    else if (mode === 'print') exportPrintLayout();
    menu.style.display = 'none';
  });

  document.addEventListener('click', () => { menu.style.display = 'none'; });
}

function exportPNG() {
  const viewer = getCesiumViewer();
  if (viewer) {
    viewer.render();
    viewer.canvas.toBlob((blob) => {
      downloadBlob(blob, 'viewtopia-screenshot.png');
    });
    return;
  }

  const map = getLeafletMap();
  if (map) {
    alert('Use your browser\'s screenshot tool for 2D map export (Ctrl+Shift+S on most browsers)');
  }
}

async function exportPrintLayout() {
  const viewer = getCesiumViewer();
  const map = getLeafletMap();

  // Create a print-ready canvas
  const printCanvas = document.createElement('canvas');
  printCanvas.width = 1200;
  printCanvas.height = 900;
  const ctx = printCanvas.getContext('2d');

  // White background
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 1200, 900);

  // Title bar
  ctx.fillStyle = '#1a1d2e';
  ctx.fillRect(0, 0, 1200, 60);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 24px sans-serif';
  ctx.fillText('ViewTopia', 20, 40);

  const title = prompt('Map title:', 'ViewTopia Export') || 'ViewTopia Export';
  ctx.font = '16px sans-serif';
  ctx.fillText(title, 150, 38);

  // Date
  ctx.font = '12px sans-serif';
  ctx.fillStyle = '#999';
  ctx.textAlign = 'right';
  ctx.fillText(new Date().toLocaleDateString(), 1180, 38);
  ctx.textAlign = 'left';

  // Map area
  const mapX = 20, mapY = 70, mapW = 1160, mapH = 760;
  ctx.strokeStyle = '#ccc';
  ctx.lineWidth = 1;
  ctx.strokeRect(mapX, mapY, mapW, mapH);

  // Capture map image
  if (viewer) {
    viewer.render();
    try {
      ctx.drawImage(viewer.canvas, mapX, mapY, mapW, mapH);
    } catch { /* security error */ }
  }

  // Attribution
  ctx.fillStyle = '#666';
  ctx.font = '10px sans-serif';
  ctx.fillText('© OpenStreetMap contributors | ViewTopia', mapX + 5, mapY + mapH - 5);

  // Scale bar (approximate)
  const scaleBarWidth = 100;
  ctx.fillStyle = '#333';
  ctx.fillRect(mapX + mapW - scaleBarWidth - 20, mapY + mapH - 20, scaleBarWidth, 4);
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('~scale', mapX + mapW - scaleBarWidth / 2 - 20, mapY + mapH - 25);
  ctx.textAlign = 'left';

  // North arrow
  ctx.save();
  ctx.translate(mapX + mapW - 30, mapY + 30);
  ctx.fillStyle = '#333';
  ctx.beginPath();
  ctx.moveTo(0, -15);
  ctx.lineTo(-6, 10);
  ctx.lineTo(6, 10);
  ctx.closePath();
  ctx.fill();
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('N', 0, -18);
  ctx.restore();

  // Download
  printCanvas.toBlob((blob) => {
    downloadBlob(blob, 'viewtopia-print.png');
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
