/**
 * GeoJSON editor — draw, edit, and modify GeoJSON features on the 2D Leaflet map.
 * Supports vertex editing, property editing, and drag-move.
 */
import { getLeafletMap } from './leaflet-view.js';

let editLayer = null;
let editMode = false;
let selectedFeature = null;
let propPanel = null;

export function initGeoJSONEditor() {
  createPropertyPanel();
}

function createPropertyPanel() {
  propPanel = document.createElement('div');
  propPanel.id = 'geojson-prop-panel';
  propPanel.className = 'geojson-prop-panel';
  propPanel.style.display = 'none';
  propPanel.innerHTML = `
    <div class="gj-header">
      <span>Feature Properties</span>
      <button class="gj-close">&times;</button>
    </div>
    <div id="gj-props" class="gj-props"></div>
    <div class="gj-actions">
      <button id="gj-add-prop" class="sep-btn">+ Add Property</button>
      <button id="gj-delete-feature" class="sep-btn sep-btn-reset">Delete Feature</button>
    </div>
  `;
  document.body.appendChild(propPanel);

  propPanel.querySelector('.gj-close').addEventListener('click', () => { propPanel.style.display = 'none'; });
  propPanel.querySelector('#gj-add-prop').addEventListener('click', addProperty);
  propPanel.querySelector('#gj-delete-feature').addEventListener('click', deleteSelectedFeature);
}

export function enableEditing(geojsonLayer) {
  editLayer = geojsonLayer;
  editMode = true;

  const map = getLeafletMap();
  if (!map || !editLayer) return;

  editLayer.eachLayer((layer) => {
    if (layer.editing) layer.editing.enable();
    if (layer.dragging) layer.dragging.enable();

    layer.on('click', () => {
      selectedFeature = layer;
      showProperties(layer);
    });

    layer.on('edit', () => {
      updateGeoJSON();
    });
  });
}

export function disableEditing() {
  if (!editLayer) return;
  editMode = false;

  editLayer.eachLayer((layer) => {
    if (layer.editing) layer.editing.disable();
    if (layer.dragging) layer.dragging.disable();
  });

  if (propPanel) propPanel.style.display = 'none';
  selectedFeature = null;
}

export function getEditedGeoJSON() {
  if (!editLayer) return null;
  return editLayer.toGeoJSON();
}

function showProperties(layer) {
  if (!propPanel) return;
  const props = layer.feature?.properties || {};
  const container = propPanel.querySelector('#gj-props');

  container.innerHTML = Object.entries(props).map(([key, val]) => `
    <div class="gj-prop-row">
      <input type="text" class="gj-key" value="${escapeAttr(key)}" data-orig="${escapeAttr(key)}" />
      <input type="text" class="gj-val" value="${escapeAttr(String(val))}" data-key="${escapeAttr(key)}" />
      <button class="gj-remove-prop" data-key="${escapeAttr(key)}">&times;</button>
    </div>
  `).join('') || '<div class="bk-empty">No properties</div>';

  // Wire up property editing
  container.querySelectorAll('.gj-val').forEach(input => {
    input.addEventListener('change', () => {
      const key = input.dataset.key;
      if (layer.feature?.properties) {
        layer.feature.properties[key] = input.value;
        updateGeoJSON();
      }
    });
  });

  container.querySelectorAll('.gj-key').forEach(input => {
    input.addEventListener('change', () => {
      const orig = input.dataset.orig;
      const newKey = input.value.trim();
      if (!newKey || !layer.feature?.properties) return;
      const val = layer.feature.properties[orig];
      delete layer.feature.properties[orig];
      layer.feature.properties[newKey] = val;
      input.dataset.orig = newKey;
      updateGeoJSON();
      showProperties(layer);
    });
  });

  container.querySelectorAll('.gj-remove-prop').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      if (layer.feature?.properties) {
        delete layer.feature.properties[key];
        updateGeoJSON();
        showProperties(layer);
      }
    });
  });

  propPanel.style.display = 'block';
}

function addProperty() {
  if (!selectedFeature?.feature) return;
  const key = prompt('Property name:');
  if (!key?.trim()) return;
  const val = prompt('Value:') || '';
  if (!selectedFeature.feature.properties) selectedFeature.feature.properties = {};
  selectedFeature.feature.properties[key.trim()] = val;
  updateGeoJSON();
  showProperties(selectedFeature);
}

function deleteSelectedFeature() {
  if (!selectedFeature || !editLayer) return;
  editLayer.removeLayer(selectedFeature);
  selectedFeature = null;
  propPanel.style.display = 'none';
  updateGeoJSON();
}

function updateGeoJSON() {
  // Dispatch event so other modules can react
  document.dispatchEvent(new CustomEvent('geojson-edited', { detail: getEditedGeoJSON() }));
}

function escapeAttr(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
