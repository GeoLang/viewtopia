/**
 * Charts/stats panel — histogram, scatter, time series for attribute data.
 */

let chartPanel;

export function initCharts() {
  chartPanel = document.getElementById('stats-window');
  if (!chartPanel) return;

  // Close button wiring
  document.getElementById('stats-win-close')?.addEventListener('click', () => {
    chartPanel.style.display = 'none';
  });
}

/**
 * Show histogram for an array of numeric values.
 */
export function showHistogram(values, title = 'Histogram') {
  if (!chartPanel) return;
  chartPanel.style.display = 'block';
  document.getElementById('stats-win-title').textContent = title;
  const body = document.getElementById('stats-win-body');
  body.innerHTML = '';

  const canvas = document.createElement('canvas');
  canvas.width = 400;
  canvas.height = 200;
  body.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  // Compute bins
  const min = Math.min(...values);
  const max = Math.max(...values);
  const binCount = Math.min(20, Math.ceil(Math.sqrt(values.length)));
  const binWidth = (max - min) / binCount || 1;
  const bins = new Array(binCount).fill(0);
  for (const v of values) {
    const idx = Math.min(Math.floor((v - min) / binWidth), binCount - 1);
    bins[idx]++;
  }
  const maxBin = Math.max(...bins);

  // Draw
  const barW = canvas.width / binCount;
  ctx.fillStyle = '#7c3aed';
  for (let i = 0; i < binCount; i++) {
    const h = (bins[i] / maxBin) * (canvas.height - 30);
    ctx.fillRect(i * barW + 1, canvas.height - 20 - h, barW - 2, h);
  }
  // Axis labels
  ctx.fillStyle = '#999';
  ctx.font = '10px monospace';
  ctx.fillText(min.toFixed(1), 2, canvas.height - 4);
  ctx.fillText(max.toFixed(1), canvas.width - 50, canvas.height - 4);
  ctx.fillText(`n=${values.length}`, canvas.width - 70, 14);

  // Stats summary
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const statsDiv = document.createElement('div');
  statsDiv.className = 'chart-stats';
  statsDiv.innerHTML = `
    <span>Min: ${min.toFixed(2)}</span>
    <span>Max: ${max.toFixed(2)}</span>
    <span>Mean: ${mean.toFixed(2)}</span>
    <span>Median: ${median.toFixed(2)}</span>
  `;
  body.appendChild(statsDiv);
}

/**
 * Show scatter plot for two arrays of values.
 */
export function showScatter(xVals, yVals, title = 'Scatter') {
  if (!chartPanel) return;
  chartPanel.style.display = 'block';
  document.getElementById('stats-win-title').textContent = title;
  const body = document.getElementById('stats-win-body');
  body.innerHTML = '';

  const canvas = document.createElement('canvas');
  canvas.width = 400;
  canvas.height = 300;
  body.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  const xMin = Math.min(...xVals), xMax = Math.max(...xVals);
  const yMin = Math.min(...yVals), yMax = Math.max(...yVals);
  const pad = 30;
  const w = canvas.width - pad * 2;
  const h = canvas.height - pad * 2;

  ctx.fillStyle = '#7c3aed';
  for (let i = 0; i < xVals.length; i++) {
    const x = pad + ((xVals[i] - xMin) / (xMax - xMin || 1)) * w;
    const y = canvas.height - pad - ((yVals[i] - yMin) / (yMax - yMin || 1)) * h;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Axes
  ctx.strokeStyle = '#666';
  ctx.beginPath();
  ctx.moveTo(pad, pad);
  ctx.lineTo(pad, canvas.height - pad);
  ctx.lineTo(canvas.width - pad, canvas.height - pad);
  ctx.stroke();
}

/**
 * Show time series line chart.
 */
export function showTimeSeries(dates, values, title = 'Time Series') {
  if (!chartPanel) return;
  chartPanel.style.display = 'block';
  document.getElementById('stats-win-title').textContent = title;
  const body = document.getElementById('stats-win-body');
  body.innerHTML = '';

  const canvas = document.createElement('canvas');
  canvas.width = 400;
  canvas.height = 200;
  body.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  const vMin = Math.min(...values), vMax = Math.max(...values);
  const pad = 30;
  const w = canvas.width - pad * 2;
  const h = canvas.height - pad * 2;

  ctx.strokeStyle = '#7c3aed';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < values.length; i++) {
    const x = pad + (i / (values.length - 1 || 1)) * w;
    const y = canvas.height - pad - ((values[i] - vMin) / (vMax - vMin || 1)) * h;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Axis labels
  ctx.fillStyle = '#999';
  ctx.font = '10px monospace';
  if (dates.length > 0) {
    ctx.fillText(dates[0], pad, canvas.height - 4);
    ctx.fillText(dates[dates.length - 1], canvas.width - 100, canvas.height - 4);
  }
}
