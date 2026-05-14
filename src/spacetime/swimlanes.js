/**
 * Entity Timeline Swimlanes — horizontal per-entity event timelines.
 *
 * GeoTime/Palantir-style: each entity gets a horizontal lane showing
 * events as dots along a time axis. Highlights gaps, bursts, and
 * overlapping activity between entities.
 */

let swimlanePanel = null;
let swimCanvas = null;

const LANE_HEIGHT = 28;
const PAD_LEFT = 100;
const PAD_RIGHT = 20;
const PAD_TOP = 30;

/**
 * Show the swimlane timeline for all entities.
 *
 * @param {import('./models.js').Track[]} tracks
 * @param {Map<string, import('./models.js').Entity>} entities
 * @param {Object} opts
 * @param {Function} [opts.onTimeSelect] - Called with timestamp when user clicks
 * @param {number} [opts.currentTime]
 */
export function showSwimlanePanelUI(tracks, entities, opts = {}) {
  if (tracks.length === 0) return;

  const width = 800;
  const height = PAD_TOP + tracks.length * LANE_HEIGHT + 30;

  if (!swimlanePanel) {
    swimlanePanel = document.createElement('div');
    swimlanePanel.id = 'swimlane-panel';
    swimlanePanel.className = 'swimlane-panel';
    swimlanePanel.innerHTML = `
      <div class="sw-header">
        <span>Entity Timeline</span>
        <button class="st-btn sw-close">✕</button>
      </div>
      <canvas class="sw-canvas"></canvas>
    `;
    document.body.appendChild(swimlanePanel);
    swimlanePanel.querySelector('.sw-close').onclick = () => { swimlanePanel.style.display = 'none'; };
    swimCanvas = swimlanePanel.querySelector('.sw-canvas');

    swimCanvas.addEventListener('click', (e) => {
      if (!opts.onTimeSelect) return;
      const rect = swimCanvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const t = xToTime(x, width);
      if (t != null) opts.onTimeSelect(t);
    });
  }

  swimCanvas.width = width;
  swimCanvas.height = height;
  swimlanePanel.style.display = '';

  // Compute global time range
  let tMin = Infinity, tMax = -Infinity;
  for (const track of tracks) {
    for (const ev of track.events) {
      if (ev.timestamp < tMin) tMin = ev.timestamp;
      if (ev.timestamp > tMax) tMax = ev.timestamp;
    }
  }

  const ctx = swimCanvas.getContext('2d');
  const drawWidth = width - PAD_LEFT - PAD_RIGHT;

  // Store for click mapping
  swimCanvas._tMin = tMin;
  swimCanvas._tMax = tMax;
  swimCanvas._drawWidth = drawWidth;

  // Background
  ctx.fillStyle = '#0f1019';
  ctx.fillRect(0, 0, width, height);

  // Time axis labels
  ctx.fillStyle = '#64748b';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  const labelCount = 5;
  for (let i = 0; i <= labelCount; i++) {
    const frac = i / labelCount;
    const t = tMin + frac * (tMax - tMin);
    const x = PAD_LEFT + frac * drawWidth;
    ctx.fillText(formatTimeSW(t), x, PAD_TOP - 8);

    // Grid line
    ctx.strokeStyle = '#1e2035';
    ctx.beginPath();
    ctx.moveTo(x, PAD_TOP);
    ctx.lineTo(x, height - 10);
    ctx.stroke();
  }

  // Draw lanes
  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    const entity = entities.get(track.entityId);
    const y = PAD_TOP + i * LANE_HEIGHT;

    // Entity label
    ctx.fillStyle = entity?.color || '#888';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'right';
    const name = entity?.name || track.entityId;
    ctx.fillText(name.length > 12 ? name.slice(0, 12) + '…' : name, PAD_LEFT - 8, y + LANE_HEIGHT / 2 + 4);

    // Lane background
    ctx.fillStyle = i % 2 === 0 ? '#12141f' : '#0f1019';
    ctx.fillRect(PAD_LEFT, y, drawWidth, LANE_HEIGHT);

    // Events as dots
    for (const ev of track.events) {
      const frac = (ev.timestamp - tMin) / (tMax - tMin || 1);
      const ex = PAD_LEFT + frac * drawWidth;
      ctx.beginPath();
      ctx.arc(ex, y + LANE_HEIGHT / 2, 3, 0, Math.PI * 2);
      ctx.fillStyle = entity?.color || '#a78bfa';
      ctx.fill();
    }

    // Activity bar (dense events get brighter)
    const binCount = Math.max(1, Math.floor(drawWidth / 4));
    const bins = new Uint16Array(binCount);
    for (const ev of track.events) {
      const frac = (ev.timestamp - tMin) / (tMax - tMin || 1);
      const bin = Math.min(binCount - 1, Math.floor(frac * binCount));
      bins[bin]++;
    }
    const maxBin = Math.max(1, ...bins);
    for (let b = 0; b < binCount; b++) {
      if (bins[b] === 0) continue;
      const alpha = 0.1 + 0.4 * (bins[b] / maxBin);
      ctx.fillStyle = (entity?.color || '#a78bfa') + Math.round(alpha * 255).toString(16).padStart(2, '0');
      ctx.fillRect(PAD_LEFT + (b / binCount) * drawWidth, y + 2, drawWidth / binCount, LANE_HEIGHT - 4);
    }
  }

  // Current time indicator
  if (opts.currentTime != null && opts.currentTime >= tMin && opts.currentTime <= tMax) {
    const frac = (opts.currentTime - tMin) / (tMax - tMin);
    const x = PAD_LEFT + frac * drawWidth;
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x, PAD_TOP);
    ctx.lineTo(x, height - 10);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

export function hideSwimlanePanelUI() {
  if (swimlanePanel) swimlanePanel.style.display = 'none';
}

function xToTime(x, width) {
  if (!swimCanvas._tMin) return null;
  const drawWidth = swimCanvas._drawWidth;
  const frac = (x - PAD_LEFT) / drawWidth;
  if (frac < 0 || frac > 1) return null;
  return swimCanvas._tMin + frac * (swimCanvas._tMax - swimCanvas._tMin);
}

function formatTimeSW(ms) {
  const d = new Date(ms);
  return d.toISOString().slice(0, 10);
}
