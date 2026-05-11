/**
 * Feature picker + Style editor — click 3D Tiles features to inspect properties,
 * and apply visual styles by property/height/classification.
 * Ported from TileTopia's feature-picker.js for ViewTopia.
 */
import * as Cesium from 'cesium';
import { getCesiumViewer } from './renderers.js';

let picker = null;
let styleEditor = null;

export function getFeaturePicker() {
  if (!picker) {
    const viewer = getCesiumViewer();
    if (viewer) picker = new FeaturePicker(viewer);
  }
  return picker;
}

export function getStyleEditor() {
  return styleEditor;
}

export function initFeaturePicker() {
  const btn = document.getElementById('pick-btn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const fp = getFeaturePicker();
    if (!fp) return;
    if (fp.enabled) {
      fp.disable();
      btn.classList.remove('active');
    } else {
      fp.enable();
      btn.classList.add('active');
    }
  });
}

class FeaturePicker {
  constructor(viewer) {
    this.viewer = viewer;
    this.handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    this.panelEl = null;
    this.enabled = false;
    this.highlighted = null;
    this._originalColor = null;
    this._init();
  }

  _init() {
    this.panelEl = document.createElement('div');
    this.panelEl.id = 'feature-info-panel';
    this.panelEl.className = 'feature-info-panel';
    this.panelEl.style.display = 'none';
    this.panelEl.innerHTML = `
      <div class="fip-header">
        <span>Feature Info</span>
        <button class="fip-close">&times;</button>
      </div>
      <div class="fip-body"></div>`;
    const vizContent = document.getElementById('viz-content') || document.getElementById('main-content') || document.body;
    vizContent.appendChild(this.panelEl);
    this.panelEl.querySelector('.fip-close').addEventListener('click', () => this.hidePanel());
  }

  enable() {
    if (this.enabled) return;
    this.enabled = true;

    this.handler.setInputAction((click) => {
      this._clearHighlight();
      const picked = this.viewer.scene.pick(click.position);
      if (Cesium.defined(picked) && picked instanceof Cesium.Cesium3DTileFeature) {
        this._showFeatureInfo(picked);
        this._highlight(picked);
      } else {
        this.hidePanel();
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  disable() {
    this.enabled = false;
    this.handler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_CLICK);
    this._clearHighlight();
    this.hidePanel();
  }

  hidePanel() {
    if (this.panelEl) this.panelEl.style.display = 'none';
  }

  _showFeatureInfo(feature) {
    const propertyIds = feature.getPropertyIds();
    if (propertyIds.length === 0) {
      this.panelEl.querySelector('.fip-body').innerHTML = '<p class="fip-empty">No properties</p>';
    } else {
      const rows = propertyIds.map((id) => {
        const val = feature.getProperty(id);
        const display = typeof val === 'object' ? JSON.stringify(val) : String(val);
        return `<tr><td class="fip-key">${this._esc(id)}</td><td class="fip-val">${this._esc(display)}</td></tr>`;
      }).join('');
      this.panelEl.querySelector('.fip-body').innerHTML = `<table class="fip-table">${rows}</table>`;
    }
    this.panelEl.style.display = 'block';
  }

  _highlight(feature) {
    this._originalColor = feature.color ? Cesium.Color.clone(feature.color) : null;
    feature.color = Cesium.Color.YELLOW.withAlpha(0.6);
    this.highlighted = feature;
  }

  _clearHighlight() {
    if (this.highlighted) {
      this.highlighted.color = this._originalColor || Cesium.Color.WHITE;
      this.highlighted = null;
      this._originalColor = null;
    }
  }

  _esc(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}

/** Style editor — colour 3D Tiles by property, height, or classification. */
export class StyleEditor {
  constructor(viewer) {
    this.viewer = viewer;
    this.tileset = null;
    this.panelEl = null;
    this._init();
    styleEditor = this;
  }

  _init() {
    this.panelEl = document.createElement('div');
    this.panelEl.id = 'style-editor-panel';
    this.panelEl.className = 'style-editor-panel';
    this.panelEl.style.display = 'none';
    this.panelEl.innerHTML = `
      <div class="sep-header"><span>🎨 Style Editor</span><button class="sep-close">&times;</button></div>
      <div class="sep-body">
        <div class="sep-section">
          <label>Color by Property</label>
          <input type="text" id="sep-prop-name" placeholder="Property name" class="sep-input">
          <button class="sep-btn" id="sep-apply-prop">Apply</button>
        </div>
        <div class="sep-section">
          <button class="sep-btn" id="sep-color-height">Color by Height</button>
          <button class="sep-btn" id="sep-color-class">Color by Classification</button>
          <button class="sep-btn sep-btn-reset" id="sep-reset">Reset Style</button>
        </div>
        <div class="sep-section">
          <label>Opacity</label>
          <input type="range" id="sep-opacity" min="0" max="1" step="0.05" value="1" class="sep-slider">
          <label>Point Size</label>
          <input type="range" id="sep-point-size" min="1" max="20" step="1" value="3" class="sep-slider">
        </div>
      </div>`;
    const vizContent = document.getElementById('viz-content') || document.body;
    vizContent.appendChild(this.panelEl);

    this.panelEl.querySelector('.sep-close').addEventListener('click', () => this.hide());
    this.panelEl.querySelector('#sep-apply-prop').addEventListener('click', () => {
      const prop = this.panelEl.querySelector('#sep-prop-name').value.trim();
      if (prop) this.setColorByProperty(prop);
    });
    this.panelEl.querySelector('#sep-color-height').addEventListener('click', () => this.setColorByHeight());
    this.panelEl.querySelector('#sep-color-class').addEventListener('click', () => this.setColorByClassification());
    this.panelEl.querySelector('#sep-reset').addEventListener('click', () => this.resetStyle());
    this.panelEl.querySelector('#sep-opacity').addEventListener('input', (e) => this.setOpacity(parseFloat(e.target.value)));
    this.panelEl.querySelector('#sep-point-size').addEventListener('input', (e) => this.setPointSize(parseInt(e.target.value)));
  }

  show() { if (this.panelEl) this.panelEl.style.display = 'block'; }
  hide() { if (this.panelEl) this.panelEl.style.display = 'none'; }

  setTileset(tileset) { this.tileset = tileset; }

  setColorByProperty(propertyName) {
    if (!this.tileset) return;
    this.tileset.style = new Cesium.Cesium3DTileStyle({
      color: {
        conditions: [
          [`\${${propertyName}} === undefined`, 'color("gray")'],
          ['true', `color("hsl(" + (\${${propertyName}} * 137.508 % 360) + ", 70%, 55%)")`],
        ],
      },
    });
  }

  setColorByHeight() {
    if (!this.tileset) return;
    this.tileset.style = new Cesium.Cesium3DTileStyle({
      color: {
        conditions: [
          ['${height} > 200', 'color("#d73027")'],
          ['${height} > 150', 'color("#fc8d59")'],
          ['${height} > 100', 'color("#fee08b")'],
          ['${height} > 50', 'color("#d9ef8b")'],
          ['${height} > 20', 'color("#91cf60")'],
          ['${height} > 0', 'color("#1a9850")'],
          ['true', 'color("gray")'],
        ],
      },
    });
  }

  setColorByClassification() {
    if (!this.tileset) return;
    this.tileset.style = new Cesium.Cesium3DTileStyle({
      color: {
        conditions: [
          ['${classification} === 2', 'color("#8B4513")'],
          ['${classification} === 3', 'color("#228B22")'],
          ['${classification} === 4', 'color("#006400")'],
          ['${classification} === 5', 'color("#013220")'],
          ['${classification} === 6', 'color("#FF4500")'],
          ['${classification} === 9', 'color("#1E90FF")'],
          ['true', 'color("gray")'],
        ],
      },
    });
  }

  resetStyle() {
    if (!this.tileset) return;
    this.tileset.style = undefined;
  }

  setOpacity(opacity) {
    if (!this.tileset) return;
    this.tileset.style = new Cesium.Cesium3DTileStyle({
      color: `color("white", ${opacity})`,
    });
  }

  setPointSize(size) {
    if (!this.tileset) return;
    this.tileset.style = new Cesium.Cesium3DTileStyle({
      pointSize: `${size}`,
    });
  }
}

export function initStyleEditor() {
  const viewer = getCesiumViewer();
  if (viewer) new StyleEditor(viewer);
}
