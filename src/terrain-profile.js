/**
 * Terrain profile tool — shows elevation profile along a line.
 * Uses Cesium's sampleTerrainMostDetailed to query heights.
 */
import * as Cesium from 'cesium';
import { getCesiumViewer } from './renderers.js';

let profilePanel = null;

export function initTerrainProfile() {
  const viewer = getCesiumViewer();
  if (!viewer) return;

  // Create the profile panel
  profilePanel = document.createElement('div');
  profilePanel.id = 'terrain-profile';
  profilePanel.className = 'terrain-profile';
  profilePanel.style.display = 'none';
  profilePanel.innerHTML = `
    <div class="tp-header">
      <span>⛰ Terrain Profile</span>
      <button class="tp-close">&times;</button>
    </div>
    <canvas id="tp-canvas" width="400" height="120"></canvas>
    <div class="tp-info" id="tp-info"></div>
  `;
  const vizContent = document.getElementById('viz-content') || document.body;
  vizContent.appendChild(profilePanel);
  profilePanel.querySelector('.tp-close').addEventListener('click', () => { profilePanel.style.display = 'none'; });

  // Register command
  window._terrainProfile = showTerrainProfile;
}

export async function showTerrainProfile(startLon, startLat, endLon, endLat, numSamples = 100) {
  const viewer = getCesiumViewer();
  if (!viewer || !profilePanel) return;

  const positions = [];
  for (let i = 0; i <= numSamples; i++) {
    const t = i / numSamples;
    positions.push(Cesium.Cartographic.fromDegrees(
      startLon + t * (endLon - startLon),
      startLat + t * (endLat - startLat)
    ));
  }

  try {
    const sampled = await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, positions);
    const heights = sampled.map(c => c.height);
    const totalDist = Cesium.Cartesian3.distance(
      Cesium.Cartesian3.fromDegrees(startLon, startLat),
      Cesium.Cartesian3.fromDegrees(endLon, endLat)
    );

    drawProfile(heights, totalDist);
    profilePanel.style.display = 'block';
  } catch (e) {
    console.error('Terrain profile failed:', e);
  }
}

function drawProfile(heights, totalDist) {
  const canvas = document.getElementById('tp-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const pad = { top: 10, right: 10, bottom: 25, left: 45 };
  const pw = w - pad.left - pad.right;
  const ph = h - pad.top - pad.bottom;

  const minH = Math.min(...heights);
  const maxH = Math.max(...heights);
  const range = maxH - minH || 1;

  ctx.clearRect(0, 0, w, h);

  // Background
  ctx.fillStyle = 'rgba(15,17,23,0.95)';
  ctx.fillRect(0, 0, w, h);

  // Grid lines
  ctx.strokeStyle = '#2d3148';
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (ph * i) / 4;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
  }

  // Y-axis labels
  ctx.fillStyle = '#64748b';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (ph * i) / 4;
    const val = maxH - (range * i) / 4;
    ctx.fillText(`${val.toFixed(0)}m`, pad.left - 4, y + 3);
  }

  // X-axis labels
  ctx.textAlign = 'center';
  const distLabel = totalDist >= 1000 ? `${(totalDist / 1000).toFixed(1)} km` : `${totalDist.toFixed(0)} m`;
  ctx.fillText('0', pad.left, h - 5);
  ctx.fillText(distLabel, w - pad.right, h - 5);

  // Profile fill
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top + ph);
  for (let i = 0; i < heights.length; i++) {
    const x = pad.left + (pw * i) / (heights.length - 1);
    const y = pad.top + ph - ((heights[i] - minH) / range) * ph;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(pad.left + pw, pad.top + ph);
  ctx.closePath();
  ctx.fillStyle = 'rgba(124,58,237,0.3)';
  ctx.fill();

  // Profile line
  ctx.beginPath();
  for (let i = 0; i < heights.length; i++) {
    const x = pad.left + (pw * i) / (heights.length - 1);
    const y = pad.top + ph - ((heights[i] - minH) / range) * ph;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = '#a78bfa';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Info
  const info = document.getElementById('tp-info');
  if (info) {
    info.textContent = `Min: ${minH.toFixed(1)}m  Max: ${maxH.toFixed(1)}m  Gain: ${(maxH - minH).toFixed(1)}m  Dist: ${distLabel}`;
  }
}
