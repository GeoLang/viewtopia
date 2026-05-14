/**
 * Activity Histogram — show event density over time for entities.
 *
 * GeoTime-style timeline with stacked bars per entity showing
 * when/how often events occur.
 */

/**
 * @typedef {Object} HistogramBin
 * @property {number} startMs
 * @property {number} endMs
 * @property {Map<string, number>} entityCounts - entityId -> count
 * @property {number} total
 */

/**
 * Compute histogram bins for tracks.
 *
 * @param {import('./models.js').Track[]} tracks
 * @param {Object} opts
 * @param {number} [opts.bins=50] - Number of bins
 * @param {number} [opts.startMs] - Start time (auto if omitted)
 * @param {number} [opts.endMs] - End time (auto if omitted)
 * @returns {HistogramBin[]}
 */
export function computeHistogram(tracks, opts = {}) {
  const { bins = 50 } = opts;

  let startMs = opts.startMs ?? Infinity;
  let endMs = opts.endMs ?? -Infinity;

  for (const t of tracks) {
    for (const e of t.events) {
      if (e.timestamp < startMs) startMs = e.timestamp;
      if (e.timestamp > endMs) endMs = e.timestamp;
    }
  }

  if (startMs >= endMs) return [];

  const binWidth = (endMs - startMs) / bins;
  const histogram = Array.from({ length: bins }, (_, i) => ({
    startMs: startMs + i * binWidth,
    endMs: startMs + (i + 1) * binWidth,
    entityCounts: new Map(),
    total: 0,
  }));

  for (const track of tracks) {
    for (const ev of track.events) {
      const binIdx = Math.min(bins - 1, Math.floor((ev.timestamp - startMs) / binWidth));
      const bin = histogram[binIdx];
      bin.entityCounts.set(track.entityId, (bin.entityCounts.get(track.entityId) || 0) + 1);
      bin.total++;
    }
  }

  return histogram;
}

// --- Activity Histogram UI ---

let histPanel = null;
let histCanvas = null;

/**
 * Show the activity histogram panel.
 *
 * @param {import('./models.js').Track[]} tracks
 * @param {Map<string, import('./models.js').Entity>} entities
 * @param {Object} opts
 * @param {Function} [opts.onTimeSelect] - Called with (startMs, endMs) when user clicks a bin
 */
export function showActivityHistogram(tracks, entities, opts = {}) {
  const histogram = computeHistogram(tracks, { bins: 60 });
  if (histogram.length === 0) return;

  if (!histPanel) {
    histPanel = document.createElement('div');
    histPanel.id = 'activity-histogram-panel';
    histPanel.className = 'activity-histogram-panel';
    histPanel.innerHTML = `
      <div class="ah-header">
        <span>Activity Timeline</span>
        <button class="st-btn ah-close">✕</button>
      </div>
      <canvas class="ah-canvas" width="700" height="120"></canvas>
    `;
    document.body.appendChild(histPanel);
    histPanel.querySelector('.ah-close').onclick = () => { histPanel.style.display = 'none'; };
    histCanvas = histPanel.querySelector('.ah-canvas');

    histCanvas.addEventListener('click', (e) => {
      if (!opts.onTimeSelect) return;
      const rect = histCanvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const binIdx = Math.floor(x / (700 / histogram.length));
      if (binIdx >= 0 && binIdx < histogram.length) {
        opts.onTimeSelect(histogram[binIdx].startMs, histogram[binIdx].endMs);
      }
    });
  }

  histPanel.style.display = '';
  drawHistogram(histogram, entities);
}

export function hideActivityHistogram() {
  if (histPanel) histPanel.style.display = 'none';
}

function drawHistogram(histogram, entities) {
  const ctx = histCanvas.getContext('2d');
  const W = 700, H = 100, PAD = 10;
  ctx.clearRect(0, 0, W, H + 20);

  const maxTotal = Math.max(1, ...histogram.map(b => b.total));
  const barW = W / histogram.length;

  // Get entity colors
  const entityColors = new Map();
  for (const [id, ent] of entities) entityColors.set(id, ent.color);

  for (let i = 0; i < histogram.length; i++) {
    const bin = histogram[i];
    const x = i * barW;
    let y = H;

    // Stack by entity
    for (const [entityId, count] of bin.entityCounts) {
      const h = (count / maxTotal) * (H - PAD);
      ctx.fillStyle = entityColors.get(entityId) || '#888';
      ctx.fillRect(x + 1, y - h, barW - 2, h);
      y -= h;
    }
  }

  // Time labels
  ctx.fillStyle = '#aaa';
  ctx.font = '9px sans-serif';
  ctx.textAlign = 'center';
  const first = histogram[0].startMs;
  const last = histogram[histogram.length - 1].endMs;
  ctx.fillText(formatTime(first), 30, H + 14);
  ctx.fillText(formatTime(last), W - 30, H + 14);
  ctx.fillText(formatTime((first + last) / 2), W / 2, H + 14);
}

function formatTime(ms) {
  const d = new Date(ms);
  return d.toISOString().slice(0, 16).replace('T', ' ');
}
