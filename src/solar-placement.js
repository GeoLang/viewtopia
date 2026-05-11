/**
 * Solar Panel Placement — estimate roof area and annual irradiance.
 */
import * as Cesium from 'cesium';
import { getCesiumViewer } from './renderers.js';

let solarActive = false;
let solarEntities = [];

export function initSolarPlacement() {
  const btn = document.getElementById('solar-btn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    solarActive = !solarActive;
    btn.classList.toggle('active', solarActive);

    if (solarActive) {
      showSolarPanel();
    } else {
      clearSolar();
      document.getElementById('solar-panel')?.remove();
    }
  });
}

function showSolarPanel() {
  let panel = document.getElementById('solar-panel');
  if (panel) panel.remove();

  panel = document.createElement('div');
  panel.id = 'solar-panel';
  panel.className = 'floating-panel';
  panel.innerHTML = `
    <div class="panel-header"><span>☀ Solar Panel Planner</span><button class="panel-close" id="solar-close">✕</button></div>
    <div class="panel-body">
      <label>Latitude (for irradiance calc)
        <input type="number" id="solar-lat" value="51.5" step="0.1" style="width:80px;">
      </label>
      <label>Panel efficiency (%)
        <input type="range" id="solar-eff" min="15" max="25" value="20">
        <span id="solar-eff-val">20%</span>
      </label>
      <label>Roof tilt (°)
        <input type="range" id="solar-tilt" min="0" max="60" value="30">
        <span id="solar-tilt-val">30°</span>
      </label>
      <label>Roof azimuth
        <select id="solar-azimuth">
          <option value="180">South</option>
          <option value="135">South-East</option>
          <option value="225">South-West</option>
          <option value="90">East</option>
          <option value="270">West</option>
          <option value="0">North</option>
        </select>
      </label>
      <div style="display:flex;gap:6px;margin-top:8px;">
        <button class="map-action-btn" id="solar-draw">Draw Roof Area</button>
        <button class="map-action-btn" id="solar-demo">Demo Analysis</button>
        <button class="map-action-btn" id="solar-clear">Clear</button>
      </div>
      <div id="solar-results" style="margin-top:8px;padding:8px;background:#1a1a2e;border-radius:4px;display:none;">
        <div style="font-weight:600;color:#f0c000;margin-bottom:4px;">☀ Solar Estimate</div>
        <div id="solar-area"></div>
        <div id="solar-irradiance"></div>
        <div id="solar-power"></div>
        <div id="solar-annual"></div>
        <div id="solar-savings"></div>
        <div id="solar-co2"></div>
      </div>
    </div>
  `;

  document.getElementById('viz-panel').appendChild(panel);

  document.getElementById('solar-close').onclick = () => {
    panel.remove();
    solarActive = false;
    document.getElementById('solar-btn')?.classList.remove('active');
    clearSolar();
  };

  document.getElementById('solar-eff').oninput = (e) => {
    document.getElementById('solar-eff-val').textContent = `${e.target.value}%`;
  };
  document.getElementById('solar-tilt').oninput = (e) => {
    document.getElementById('solar-tilt-val').textContent = `${e.target.value}°`;
  };

  document.getElementById('solar-draw').onclick = () => startRoofDraw();
  document.getElementById('solar-demo').onclick = () => demoSolarAnalysis();
  document.getElementById('solar-clear').onclick = () => clearSolar();
}

let roofPoints = [];

function startRoofDraw() {
  const viewer = getCesiumViewer();
  if (!viewer) return;

  roofPoints = [];
  viewer.canvas.style.cursor = 'crosshair';

  const handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);

  handler.setInputAction((click) => {
    const ray = viewer.camera.getPickRay(click.position);
    const pos = viewer.scene.globe.pick(ray, viewer.scene);
    if (!pos) return;

    roofPoints.push(pos);
    viewer.entities.add({
      position: pos,
      point: { pixelSize: 6, color: Cesium.Color.YELLOW },
    });
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  handler.setInputAction(() => {
    handler.destroy();
    viewer.canvas.style.cursor = '';
    if (roofPoints.length >= 3) {
      drawRoofAndCalculate(viewer);
    }
  }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
}

function drawRoofAndCalculate(viewer) {
  const entity = viewer.entities.add({
    polygon: {
      hierarchy: roofPoints,
      material: Cesium.Color.GOLD.withAlpha(0.4),
      outline: true,
      outlineColor: Cesium.Color.GOLD,
      height: 10,
    },
  });
  solarEntities.push(entity);

  // Calculate area from polygon points
  const area = calculatePolygonArea(roofPoints);
  calculateSolar(area);
}

function demoSolarAnalysis() {
  const viewer = getCesiumViewer();
  if (!viewer) return;

  clearSolar();

  const carto = viewer.camera.positionCartographic;
  const lon = Cesium.Math.toDegrees(carto.longitude);
  const lat = Cesium.Math.toDegrees(carto.latitude);

  // Update latitude input
  const latInput = document.getElementById('solar-lat');
  if (latInput) latInput.value = lat.toFixed(1);

  // Create a demo roof polygon
  const size = 0.0001; // ~11m
  const positions = Cesium.Cartesian3.fromDegreesArray([
    lon - size, lat - size * 0.7,
    lon + size, lat - size * 0.7,
    lon + size, lat + size * 0.7,
    lon - size, lat + size * 0.7,
  ]);

  const entity = viewer.entities.add({
    polygon: {
      hierarchy: positions,
      material: Cesium.Color.GOLD.withAlpha(0.5),
      outline: true,
      outlineColor: Cesium.Color.GOLD,
      height: 10,
      extrudedHeight: 10.1,
    },
  });
  solarEntities.push(entity);

  // ~22m x 15m demo roof = ~330 m²
  // Usable area is typically 60-70% of roof
  calculateSolar(330 * 0.65);
  viewer.flyTo(entity, { offset: new Cesium.HeadingPitchRange(0, -0.6, 100) });
}

function calculateSolar(roofAreaM2) {
  const lat = parseFloat(document.getElementById('solar-lat')?.value || '51.5');
  const efficiency = parseInt(document.getElementById('solar-eff')?.value || '20') / 100;
  const tilt = parseInt(document.getElementById('solar-tilt')?.value || '30');
  const azimuth = parseInt(document.getElementById('solar-azimuth')?.value || '180');

  // Estimate Global Horizontal Irradiance (GHI) based on latitude
  // Simplified model: ~1000-2200 kWh/m²/year depending on latitude
  const ghi = estimateGHI(lat);

  // Tilt and azimuth correction factor
  const tiltFactor = 1 + 0.005 * tilt * Math.cos(Math.abs(azimuth - 180) * Math.PI / 180);
  const annualIrradiance = ghi * Math.min(tiltFactor, 1.3);

  // Panel calculations
  const panelArea = roofAreaM2 * 0.85; // 85% packing factor
  const peakPower = panelArea * efficiency * 1; // 1 kW/m² at STC
  const annualEnergy = panelArea * efficiency * annualIrradiance;
  const electricityPrice = 0.30; // €/kWh average EU
  const annualSavings = annualEnergy * electricityPrice;
  const co2Saved = annualEnergy * 0.4; // kg CO₂/kWh grid average

  // Display results
  const results = document.getElementById('solar-results');
  if (results) results.style.display = 'block';

  setEl('solar-area', `📐 Roof area: ${roofAreaM2.toFixed(0)} m² (usable: ${panelArea.toFixed(0)} m²)`);
  setEl('solar-irradiance', `🌞 Annual irradiance: ${annualIrradiance.toFixed(0)} kWh/m²/yr (lat ${lat.toFixed(1)}°)`);
  setEl('solar-power', `⚡ Peak capacity: ${peakPower.toFixed(1)} kWp (~${Math.floor(panelArea / 1.7)} panels)`);
  setEl('solar-annual', `📊 Annual generation: ${(annualEnergy / 1000).toFixed(1)} MWh/yr`);
  setEl('solar-savings', `💰 Annual savings: €${annualSavings.toFixed(0)}/yr`);
  setEl('solar-co2', `🌱 CO₂ saved: ${(co2Saved / 1000).toFixed(1)} tonnes/yr`);
}

function estimateGHI(lat) {
  // Simplified GHI model (kWh/m²/year)
  const absLat = Math.abs(lat);
  if (absLat < 10) return 2100;
  if (absLat < 20) return 1900;
  if (absLat < 30) return 1700;
  if (absLat < 40) return 1500;
  if (absLat < 50) return 1200;
  if (absLat < 60) return 1000;
  return 800;
}

function calculatePolygonArea(positions) {
  // Approximate area by projecting to 2D
  if (positions.length < 3) return 0;

  const cartos = positions.map(p => Cesium.Cartographic.fromCartesian(p));
  let area = 0;

  for (let i = 0; i < cartos.length; i++) {
    const j = (i + 1) % cartos.length;
    const xi = Cesium.Math.toDegrees(cartos[i].longitude) * 111320 * Math.cos(cartos[i].latitude);
    const yi = Cesium.Math.toDegrees(cartos[i].latitude) * 110540;
    const xj = Cesium.Math.toDegrees(cartos[j].longitude) * 111320 * Math.cos(cartos[j].latitude);
    const yj = Cesium.Math.toDegrees(cartos[j].latitude) * 110540;
    area += xi * yj - xj * yi;
  }

  return Math.abs(area) / 2;
}

function setEl(id, text) {
  const el = document.getElementById(id);
  if (el) { el.textContent = text; el.style.fontSize = '12px'; el.style.color = '#ccc'; el.style.marginBottom = '2px'; }
}

function clearSolar() {
  const viewer = getCesiumViewer();
  if (!viewer) return;
  for (const e of solarEntities) viewer.entities.remove(e);
  solarEntities = [];
  roofPoints = [];
  const results = document.getElementById('solar-results');
  if (results) results.style.display = 'none';
}
