/**
 * Timeline Correlation — unified cross-entity temporal view.
 *
 * Shows multiple data types (events, calls, movements, alerts)
 * on a single interactive timeline for temporal pattern discovery.
 */

/**
 * @typedef {Object} TimelineItem
 * @property {string} id
 * @property {string} entityId
 * @property {string} entityName
 * @property {string} type - 'event'|'call'|'movement'|'alert'|'fence'|'link'
 * @property {number} timestamp
 * @property {number} [endTimestamp] - For duration events
 * @property {string} label
 * @property {string} color
 * @property {Object} [data] - Original data reference
 */

/**
 * Build timeline items from all available data sources.
 */
export function buildTimeline(tracks, entities, links, alerts, fenceCrossings) {
  const items = [];

  // Track events
  for (const track of (tracks || [])) {
    const entity = entities?.get(track.entityId);
    const name = entity?.name || track.entityId;
    const color = entity?.color || '#60a5fa';

    for (const event of track.events) {
      items.push({
        id: `evt-${track.entityId}-${event.timestamp}`,
        entityId: track.entityId,
        entityName: name,
        type: 'movement',
        timestamp: event.timestamp,
        label: `${name} at (${event.lat.toFixed(3)}, ${event.lng.toFixed(3)})`,
        color,
        data: event,
      });
    }
  }

  // Links (as events at firstSeen time)
  for (const link of (links || [])) {
    const srcName = entities?.get(link.sourceId)?.name || link.sourceId;
    const tgtName = entities?.get(link.targetId)?.name || link.targetId;
    items.push({
      id: `link-${link.id}`,
      entityId: link.sourceId,
      entityName: srcName,
      type: 'link',
      timestamp: link.firstSeen,
      endTimestamp: link.lastSeen !== link.firstSeen ? link.lastSeen : undefined,
      label: `${srcName} ↔ ${tgtName} (${link.kind})`,
      color: '#a78bfa',
      data: link,
    });
  }

  // Alerts
  for (const alert of (alerts || [])) {
    const name = entities?.get(alert.entityId)?.name || alert.entityId;
    items.push({
      id: `alert-${alert.ruleId}-${alert.timestamp}`,
      entityId: alert.entityId,
      entityName: name,
      type: 'alert',
      timestamp: alert.timestamp,
      label: `⚠️ ${alert.message}`,
      color: '#f59e0b',
      data: alert,
    });
  }

  // Fence crossings
  for (const crossing of (fenceCrossings || [])) {
    const name = entities?.get(crossing.entityId)?.name || crossing.entityId;
    items.push({
      id: `fence-${crossing.entityId}-${crossing.timestamp}`,
      entityId: crossing.entityId,
      entityName: name,
      type: 'fence',
      timestamp: crossing.timestamp,
      label: `${crossing.direction === 'enter' ? '🟢' : '🔴'} ${name} ${crossing.direction} ${crossing.fenceName || 'fence'}`,
      color: crossing.direction === 'enter' ? '#10b981' : '#ef4444',
      data: crossing,
    });
  }

  return items.sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Filter timeline items by entity, type, or time range.
 */
export function filterTimeline(items, filters = {}) {
  let result = items;

  if (filters.entityIds) {
    const ids = new Set(filters.entityIds);
    result = result.filter(i => ids.has(i.entityId));
  }
  if (filters.types) {
    const types = new Set(filters.types);
    result = result.filter(i => types.has(i.type));
  }
  if (filters.startTime != null) {
    result = result.filter(i => i.timestamp >= filters.startTime);
  }
  if (filters.endTime != null) {
    result = result.filter(i => i.timestamp <= filters.endTime);
  }
  if (filters.search) {
    const q = filters.search.toLowerCase();
    result = result.filter(i => i.label.toLowerCase().includes(q) || i.entityName.toLowerCase().includes(q));
  }

  return result;
}

/**
 * Group timeline items into time buckets for summary view.
 */
export function bucketTimeline(items, bucketMs = 3600000) {
  const buckets = new Map();
  for (const item of items) {
    const key = Math.floor(item.timestamp / bucketMs) * bucketMs;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(item);
  }
  return buckets;
}

/**
 * Show interactive timeline correlation panel.
 */
export function showTimelinePanel(items, opts = {}) {
  let panel = document.getElementById('timeline-corr-panel');
  if (panel) panel.remove();

  panel = document.createElement('div');
  panel.id = 'timeline-corr-panel';
  panel.className = 'timeline-corr-panel';

  const { onTimeSelect, onItemClick } = opts;

  // Get time bounds
  if (items.length === 0) {
    panel.innerHTML = '<div class="tc-empty">No timeline data</div>';
    document.body.appendChild(panel);
    return;
  }

  const minTime = items[0].timestamp;
  const maxTime = items[items.length - 1].timestamp;

  // Type filter buttons
  const types = [...new Set(items.map(i => i.type))];
  const typeIcons = { movement: '📍', link: '🔗', alert: '⚠️', fence: '🚧', call: '📞', event: '📅' };

  panel.innerHTML = `
    <div class="tc-header">
      <h3>Timeline Correlation</h3>
      <div class="tc-filters">
        ${types.map(t => `<button class="st-btn tc-type-filter" data-type="${t}">${typeIcons[t] || '📋'} ${t}</button>`).join('')}
      </div>
      <button class="tc-close">&times;</button>
    </div>
    <div class="tc-canvas-wrap">
      <canvas class="tc-canvas" width="900" height="200"></canvas>
    </div>
    <div class="tc-detail"></div>
  `;

  panel.querySelector('.tc-close').addEventListener('click', () => panel.remove());

  // Type filters
  const activeTypes = new Set(types);
  panel.querySelectorAll('.tc-type-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type;
      if (activeTypes.has(type)) {
        activeTypes.delete(type);
        btn.style.opacity = '0.4';
      } else {
        activeTypes.add(type);
        btn.style.opacity = '1';
      }
      drawTimeline(canvas, items.filter(i => activeTypes.has(i.type)), minTime, maxTime);
    });
  });

  document.body.appendChild(panel);

  const canvas = panel.querySelector('.tc-canvas');
  drawTimeline(canvas, items, minTime, maxTime);

  // Click on canvas to select time
  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const frac = x / canvas.width;
    const time = minTime + frac * (maxTime - minTime);

    // Find nearest items
    const nearby = items.filter(i => Math.abs(i.timestamp - time) < (maxTime - minTime) * 0.01);
    const detail = panel.querySelector('.tc-detail');
    detail.innerHTML = nearby.slice(0, 10).map(i => `
      <div class="tc-item" style="border-left:3px solid ${i.color}">
        <span class="tc-item-time">${new Date(i.timestamp).toLocaleString()}</span>
        <span class="tc-item-label">${i.label}</span>
      </div>
    `).join('');

    onTimeSelect?.(time);
  });
}

/**
 * Hide timeline panel.
 */
export function hideTimelinePanel() {
  const panel = document.getElementById('timeline-corr-panel');
  if (panel) panel.remove();
}

function drawTimeline(canvas, items, minTime, maxTime) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const range = maxTime - minTime || 1;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#0f1019';
  ctx.fillRect(0, 0, w, h);

  // Time axis
  ctx.strokeStyle = '#3d4166';
  ctx.beginPath();
  ctx.moveTo(0, h - 20);
  ctx.lineTo(w, h - 20);
  ctx.stroke();

  // Time labels
  ctx.fillStyle = '#64748b';
  ctx.font = '10px sans-serif';
  for (let i = 0; i <= 5; i++) {
    const t = minTime + (i / 5) * range;
    const x = (i / 5) * w;
    ctx.fillText(new Date(t).toLocaleDateString(), x + 2, h - 6);
  }

  // Entity lanes
  const entityIds = [...new Set(items.map(i => i.entityId))];
  const laneH = Math.min(30, (h - 30) / (entityIds.length || 1));

  // Draw items
  for (const item of items) {
    const x = ((item.timestamp - minTime) / range) * w;
    const lane = entityIds.indexOf(item.entityId);
    const y = 10 + lane * laneH + laneH / 2;

    ctx.fillStyle = item.color;
    ctx.globalAlpha = 0.8;

    if (item.endTimestamp) {
      // Duration bar
      const x2 = ((item.endTimestamp - minTime) / range) * w;
      ctx.fillRect(x, y - 3, Math.max(x2 - x, 2), 6);
    } else {
      // Point
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}
