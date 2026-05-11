/**
 * Timeline widget — wraps Cesium's Clock for temporal data.
 * Shows a time slider for animating time-series datasets.
 */
import * as Cesium from 'cesium';
import { getCesiumViewer } from './renderers.js';

let timelineWidget = null;

export function initTimeline() {
  const viewer = getCesiumViewer();
  if (!viewer) return;

  const bar = document.createElement('div');
  bar.id = 'timeline-bar';
  bar.className = 'timeline-bar';
  bar.style.display = 'none';
  bar.innerHTML = `
    <button id="tl-play" class="tl-btn" title="Play/Pause">▶</button>
    <input type="range" id="tl-slider" class="tl-slider" min="0" max="100" value="0">
    <span id="tl-time" class="tl-time"></span>
    <select id="tl-speed" class="tl-speed">
      <option value="1">1×</option>
      <option value="10">10×</option>
      <option value="60" selected>60×</option>
      <option value="600">600×</option>
      <option value="3600">3600×</option>
    </select>
    <button id="tl-close" class="tl-btn" title="Close timeline">✕</button>
  `;
  const vizContent = document.getElementById('viz-content') || document.body;
  vizContent.appendChild(bar);

  const playBtn = bar.querySelector('#tl-play');
  const slider = bar.querySelector('#tl-slider');
  const timeLabel = bar.querySelector('#tl-time');
  const speedSelect = bar.querySelector('#tl-speed');
  const closeBtn = bar.querySelector('#tl-close');

  playBtn.addEventListener('click', () => {
    viewer.clock.shouldAnimate = !viewer.clock.shouldAnimate;
    playBtn.textContent = viewer.clock.shouldAnimate ? '⏸' : '▶';
  });

  speedSelect.addEventListener('change', () => {
    viewer.clock.multiplier = parseFloat(speedSelect.value);
  });

  slider.addEventListener('input', () => {
    const fraction = parseInt(slider.value) / 100;
    const start = viewer.clock.startTime;
    const stop = viewer.clock.stopTime;
    const seconds = Cesium.JulianDate.secondsDifference(stop, start) * fraction;
    viewer.clock.currentTime = Cesium.JulianDate.addSeconds(start, seconds, new Cesium.JulianDate());
  });

  closeBtn.addEventListener('click', () => { bar.style.display = 'none'; });

  // Update slider and label on tick
  viewer.clock.onTick.addEventListener(() => {
    if (bar.style.display === 'none') return;
    const start = viewer.clock.startTime;
    const stop = viewer.clock.stopTime;
    const total = Cesium.JulianDate.secondsDifference(stop, start);
    const elapsed = Cesium.JulianDate.secondsDifference(viewer.clock.currentTime, start);
    if (total > 0) {
      slider.value = Math.round((elapsed / total) * 100);
    }
    const iso = Cesium.JulianDate.toIso8601(viewer.clock.currentTime);
    timeLabel.textContent = iso.replace('T', ' ').slice(0, 19);
  });

  timelineWidget = { bar, show: showTimeline, hide: hideTimeline };
}

export function showTimeline(startISO, endISO) {
  const viewer = getCesiumViewer();
  if (!viewer || !timelineWidget) return;

  const start = Cesium.JulianDate.fromIso8601(startISO);
  const stop = Cesium.JulianDate.fromIso8601(endISO);

  viewer.clock.startTime = start;
  viewer.clock.stopTime = stop;
  viewer.clock.currentTime = Cesium.JulianDate.clone(start);
  viewer.clock.clockRange = Cesium.ClockRange.LOOP_STOP;

  timelineWidget.bar.style.display = 'flex';
}

export function hideTimeline() {
  if (timelineWidget) timelineWidget.bar.style.display = 'none';
}
