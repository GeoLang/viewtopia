/**
 * 3D Annotations — click to place notes in 3D space.
 * Ported from TileTopia's annotations.js for ViewTopia.
 */
import * as Cesium from 'cesium';
import { getCesiumViewer } from './renderers.js';
import { hasTileTopia } from './backends.js';

const API = '/api/v1';
let annotator = null;

export function getAnnotationTool() {
  if (!annotator) {
    const viewer = getCesiumViewer();
    if (viewer) annotator = new AnnotationTool(viewer);
  }
  return annotator;
}

export function initAnnotations() {
  const btn = document.getElementById('annotate-btn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const at = getAnnotationTool();
    if (!at) return;
    if (at.enabled) {
      at.disable();
      btn.classList.remove('active');
    } else {
      at.enable();
      btn.classList.add('active');
    }
  });
}

class AnnotationTool {
  constructor(viewer) {
    this.viewer = viewer;
    this.handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    this.enabled = false;
    this.entities = new Map();
    this.assetId = null;
  }

  setAsset(assetId) { this.assetId = assetId; }

  enable() {
    if (this.enabled) return;
    this.enabled = true;

    this.handler.setInputAction((click) => {
      const ray = this.viewer.camera.getPickRay(click.position);
      const pos = this.viewer.scene.globe.pick(ray, this.viewer.scene);
      if (!Cesium.defined(pos)) return;

      const carto = Cesium.Cartographic.fromCartesian(pos);
      const lon = Cesium.Math.toDegrees(carto.longitude);
      const lat = Cesium.Math.toDegrees(carto.latitude);
      const height = carto.height;

      this._promptAndCreate(lon, lat, height);
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  disable() {
    this.enabled = false;
    this.handler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  getAnnotations() {
    const result = [];
    for (const [id, entity] of this.entities) {
      const carto = Cesium.Cartographic.fromCartesian(entity.position.getValue(Cesium.JulianDate.now()));
      result.push({
        id,
        text: entity.label.text.getValue(Cesium.JulianDate.now()),
        longitude: Cesium.Math.toDegrees(carto.longitude),
        latitude: Cesium.Math.toDegrees(carto.latitude),
        height: carto.height,
      });
    }
    return result;
  }

  loadAnnotations(annotations) {
    for (const ann of annotations) {
      this._addEntity(ann.id, ann.text, ann.longitude, ann.latitude, ann.height);
    }
  }

  async fetchAnnotations() {
    if (!this.assetId || !hasTileTopia()) return;
    try {
      const res = await fetch(`${API}/assets/${this.assetId}/annotations`);
      if (!res.ok) return;
      const annotations = await res.json();
      this.loadAnnotations(annotations);
    } catch (e) {
      console.error('Failed to fetch annotations:', e);
    }
  }

  async removeAnnotation(id) {
    const entity = this.entities.get(id);
    if (entity) {
      this.viewer.entities.remove(entity);
      this.entities.delete(id);
    }
    if (this.assetId && hasTileTopia()) {
      try {
        await fetch(`${API}/assets/${this.assetId}/annotations/${encodeURIComponent(id)}`, { method: 'DELETE' });
      } catch (e) { console.error('Failed to delete annotation:', e); }
    }
  }

  clearAll() {
    for (const entity of this.entities.values()) this.viewer.entities.remove(entity);
    this.entities.clear();
  }

  _promptAndCreate(lon, lat, height) {
    const text = prompt('Enter annotation text:');
    if (!text || !text.trim()) return;
    const id = crypto.randomUUID();
    this._addEntity(id, text.trim(), lon, lat, height);
    this._saveToServer(id, text.trim(), lon, lat, height);
  }

  _addEntity(id, text, lon, lat, height) {
    const position = Cesium.Cartesian3.fromDegrees(lon, lat, height);
    const entity = this.viewer.entities.add({
      position,
      billboard: {
        image: this._pinCanvas(text.charAt(0).toUpperCase()),
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        scale: 0.7,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text, font: '13px sans-serif', fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK, outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -40),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        showBackground: true, backgroundColor: new Cesium.Color(0.1, 0.1, 0.1, 0.8),
      },
      description: `<p>${text}</p><p>Lon: ${lon.toFixed(6)}, Lat: ${lat.toFixed(6)}</p>`,
    });
    this.entities.set(id, entity);
  }

  _pinCanvas(letter) {
    const size = 48;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
    ctx.fillStyle = '#58a6ff';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, size / 2, size / 2);
    return canvas;
  }

  async _saveToServer(id, text, lon, lat, height) {
    if (!this.assetId || !hasTileTopia()) return;
    try {
      await fetch(`${API}/assets/${this.assetId}/annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, text, longitude: lon, latitude: lat, height }),
      });
    } catch (e) { console.error('Failed to save annotation:', e); }
  }
}
