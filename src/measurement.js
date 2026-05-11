/**
 * 3D Measurement tools — distance, area, and elevation.
 * Ported from TileTopia's measurement.js for ViewTopia.
 */
import * as Cesium from 'cesium';
import { getCesiumViewer } from './renderers.js';

let tool = null;

export function getMeasurementTool() {
  if (!tool) {
    const viewer = getCesiumViewer();
    if (viewer) tool = new MeasurementTool(viewer);
  }
  return tool;
}

export function initMeasurement() {
  const btn = document.getElementById('measure-btn');
  if (!btn) return;

  const menu = document.createElement('div');
  menu.className = 'measure-menu';
  menu.style.display = 'none';
  menu.innerHTML = `
    <button data-mode="distance">📏 Distance</button>
    <button data-mode="area">📐 Area</button>
    <button data-mode="height">⛰ Elevation</button>
    <button data-mode="clear">🗑 Clear</button>
  `;
  btn.parentElement.style.position = 'relative';
  btn.parentElement.appendChild(menu);

  btn.addEventListener('click', () => {
    menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
    btn.classList.toggle('active', menu.style.display !== 'none');
  });

  menu.addEventListener('click', (e) => {
    const mode = e.target.dataset.mode;
    if (!mode) return;
    const mt = getMeasurementTool();
    if (!mt) return;
    if (mode === 'distance') mt.startDistance();
    else if (mode === 'area') mt.startArea();
    else if (mode === 'height') mt.startHeight();
    else if (mode === 'clear') mt.clear();
    menu.style.display = 'none';
    btn.classList.remove('active');
  });

  // Close menu on outside click
  document.addEventListener('click', (e) => {
    if (!btn.contains(e.target) && !menu.contains(e.target)) {
      menu.style.display = 'none';
      btn.classList.remove('active');
    }
  });
}

class MeasurementTool {
  constructor(viewer) {
    this.viewer = viewer;
    this.handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    this.activeMode = null;
    this.positions = [];
    this.entities = [];
  }

  startDistance() {
    this.clear();
    this.activeMode = 'distance';
    this.positions = [];
    this._setStatus('Click first point');

    this.handler.setInputAction((click) => {
      const ray = this.viewer.camera.getPickRay(click.position);
      const pos = this.viewer.scene.globe.pick(ray, this.viewer.scene);
      if (!Cesium.defined(pos)) return;

      this.positions.push(pos);
      this._addPoint(pos);

      if (this.positions.length === 1) {
        this._setStatus('Click second point');
      } else if (this.positions.length === 2) {
        const dist = Cesium.Cartesian3.distance(this.positions[0], this.positions[1]);
        this._drawLine(this.positions[0], this.positions[1]);
        this._addLabel(
          Cesium.Cartesian3.midpoint(this.positions[0], this.positions[1], new Cesium.Cartesian3()),
          this._fmtDist(dist)
        );
        this._setStatus(`Distance: ${this._fmtDist(dist)}`);
        this._stopInput();
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  startArea() {
    this.clear();
    this.activeMode = 'area';
    this.positions = [];
    this._setStatus('Click polygon points (double-click to finish)');

    this.handler.setInputAction((click) => {
      const ray = this.viewer.camera.getPickRay(click.position);
      const pos = this.viewer.scene.globe.pick(ray, this.viewer.scene);
      if (!Cesium.defined(pos)) return;

      this.positions.push(pos);
      this._addPoint(pos);
      if (this.positions.length > 1)
        this._drawLine(this.positions[this.positions.length - 2], pos);
      this._setStatus(`${this.positions.length} points — double-click to finish`);
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    this.handler.setInputAction(() => {
      if (this.positions.length < 3) { this._setStatus('Need at least 3 points'); return; }
      this._drawLine(this.positions[this.positions.length - 1], this.positions[0]);
      this._drawPolygon(this.positions);
      const area = this._computeArea(this.positions);
      const centroid = this._centroid(this.positions);
      this._addLabel(centroid, this._fmtArea(area));
      this._setStatus(`Area: ${this._fmtArea(area)}`);
      this._stopInput();
    }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
  }

  startHeight() {
    this.clear();
    this.activeMode = 'height';
    this._setStatus('Click a point to measure elevation');

    this.handler.setInputAction((click) => {
      const ray = this.viewer.camera.getPickRay(click.position);
      const pos = this.viewer.scene.globe.pick(ray, this.viewer.scene);
      if (!Cesium.defined(pos)) return;

      const carto = Cesium.Cartographic.fromCartesian(pos);
      const h = carto.height;
      this._addPoint(pos);
      const ground = Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, 0);
      this._drawLine(ground, pos, Cesium.Color.CYAN);
      this._addLabel(pos, `Elevation: ${h.toFixed(2)} m`);
      this._setStatus(`Elevation: ${h.toFixed(2)} m`);
      this._stopInput();
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  clear() {
    for (const e of this.entities) this.viewer.entities.remove(e);
    this.entities = [];
    this.positions = [];
    this.activeMode = null;
    this._stopInput();
    this._setStatus('');
  }

  _stopInput() {
    this.handler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_CLICK);
    this.handler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
  }

  _addPoint(position) {
    const e = this.viewer.entities.add({
      position,
      point: { pixelSize: 8, color: Cesium.Color.YELLOW, outlineColor: Cesium.Color.BLACK, outlineWidth: 1, disableDepthTestDistance: Number.POSITIVE_INFINITY },
    });
    this.entities.push(e);
  }

  _drawLine(a, b, color = Cesium.Color.YELLOW) {
    const e = this.viewer.entities.add({
      polyline: { positions: [a, b], width: 2, material: color, clampToGround: true, depthFailMaterial: color.withAlpha(0.4) },
    });
    this.entities.push(e);
  }

  _drawPolygon(positions) {
    const e = this.viewer.entities.add({
      polygon: { hierarchy: new Cesium.PolygonHierarchy(positions), material: Cesium.Color.YELLOW.withAlpha(0.2), outline: true, outlineColor: Cesium.Color.YELLOW, perPositionHeight: true },
    });
    this.entities.push(e);
  }

  _addLabel(position, text) {
    const e = this.viewer.entities.add({
      position,
      label: {
        text, font: '14px sans-serif', fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK, outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -12),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        showBackground: true, backgroundColor: new Cesium.Color(0, 0, 0, 0.7),
      },
    });
    this.entities.push(e);
  }

  _computeArea(positions) {
    const tangentPlane = Cesium.EllipsoidTangentPlane.fromPoints(positions, Cesium.Ellipsoid.WGS84);
    const projected = tangentPlane.projectPointsOntoPlane(positions);
    let area = 0;
    for (let i = 0; i < projected.length; i++) {
      const j = (i + 1) % projected.length;
      area += projected[i].x * projected[j].y;
      area -= projected[j].x * projected[i].y;
    }
    return Math.abs(area) / 2;
  }

  _centroid(positions) {
    const r = new Cesium.Cartesian3();
    for (const p of positions) Cesium.Cartesian3.add(r, p, r);
    Cesium.Cartesian3.divideByScalar(r, positions.length, r);
    return r;
  }

  _fmtDist(m) { return m >= 1000 ? `${(m / 1000).toFixed(3)} km` : `${m.toFixed(2)} m`; }
  _fmtArea(s) { return s >= 1e6 ? `${(s / 1e6).toFixed(4)} km²` : `${s.toFixed(2)} m²`; }

  _setStatus(text) {
    const el = document.getElementById('measure-status');
    if (el) el.textContent = text;
  }
}
