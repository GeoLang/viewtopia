/**
 * Unified viewer command protocol.
 *
 * Both GeoLang and TileTopia backends can issue commands through this
 * interface. Commands work on whichever renderer/view is active.
 */
import * as Cesium from 'cesium';
import { getCesiumViewer } from './renderers.js';
import { getLeafletMap } from './leaflet-view.js';
import { createHeatmapLayer, createHexagonLayer, createArcLayer, createScatterLayer, createScreenGridLayer } from './deck-layers.js';

const handlers = {};

export function registerCommand(name, fn) {
  handlers[name] = fn;
}

export function executeCommand(cmd) {
  const handler = handlers[cmd.action];
  if (handler) {
    return handler(cmd.params || {});
  }
  console.warn(`Unknown viewer command: ${cmd.action}`);
}

export function initViewerCommands() {
  registerCommand('fly_to', (params) => {
    const { lon, lat, height = 1000, duration = 2 } = params;
    const viewer = getCesiumViewer();
    if (viewer) {
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(lon, lat, height),
        duration,
      });
    }
    const map = getLeafletMap();
    if (map) {
      const zoom = Math.max(2, Math.min(18, Math.round(Math.log2(4e7 / Math.max(height, 1)))));
      map.flyTo([lat, lon], zoom);
    }
  });

  registerCommand('set_view', (params) => {
    const { lon, lat, height = 5000, heading = 0, pitch = -45, roll = 0 } = params;
    const viewer = getCesiumViewer();
    if (viewer) {
      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(lon, lat, height),
        orientation: {
          heading: Cesium.Math.toRadians(heading),
          pitch: Cesium.Math.toRadians(pitch),
          roll: Cesium.Math.toRadians(roll),
        },
      });
    }
  });

  registerCommand('add_marker', (params) => {
    const { lon, lat, label, color = '#ff0000' } = params;
    const viewer = getCesiumViewer();
    if (viewer) {
      viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(lon, lat),
        point: { pixelSize: 10, color: Cesium.Color.fromCssColorString(color) },
        label: label
          ? { text: label, font: '14px sans-serif', verticalOrigin: Cesium.VerticalOrigin.BOTTOM, pixelOffset: new Cesium.Cartesian2(0, -12) }
          : undefined,
      });
    }
    const map = getLeafletMap();
    if (map) {
      const L = window.L;
      if (L) {
        L.circleMarker([lat, lon], {
          radius: 6, fillColor: color, color: '#fff', weight: 1, fillOpacity: 0.9,
        }).addTo(map).bindPopup(label || `${lat.toFixed(4)}, ${lon.toFixed(4)}`);
      }
    }
  });

  registerCommand('clear_entities', () => {
    const viewer = getCesiumViewer();
    if (viewer) viewer.entities.removeAll();
  });

  registerCommand('load_tileset', async (params) => {
    const { url, label } = params;
    const viewer = getCesiumViewer();
    if (!viewer) return;
    try {
      const tileset = await Cesium.Cesium3DTileset.fromUrl(url);
      viewer.scene.primitives.add(tileset);
      viewer.flyTo(tileset);
    } catch (e) {
      console.error('Failed to load tileset:', e);
    }
  });

  registerCommand('classify', (params) => {
    const { attribute = 'Classification' } = params;
    const viewer = getCesiumViewer();
    if (!viewer) return;
    import('./classification-viz.js').then(({ applyClassificationStyle }) => {
      for (const prim of viewer.scene.primitives) {
        if (prim instanceof Cesium.Cesium3DTileset) {
          applyClassificationStyle(prim, attribute);
        }
      }
    });
  });

  registerCommand('add_geojson', async (params) => {
    const { url, color = '#3388ff', label } = params;
    const viewer = getCesiumViewer();
    if (viewer) {
      try {
        const ds = await Cesium.GeoJsonDataSource.load(url, {
          stroke: Cesium.Color.fromCssColorString(color),
          fill: Cesium.Color.fromCssColorString(color).withAlpha(0.3),
          strokeWidth: 2,
        });
        viewer.dataSources.add(ds);
        viewer.flyTo(ds);
      } catch (e) {
        console.error('Failed to load GeoJSON in 3D view:', e);
      }
    }
    // Also add to 2D map if available
    const map = getLeafletMap();
    if (map && window.L) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          const geojson = await res.json();
          window.L.geoJSON(geojson, {
            style: { color, weight: 1.5, fillOpacity: 0.2 },
            pointToLayer: (f, latlng) => window.L.circleMarker(latlng, {
              radius: 5, fillColor: color, color: '#fff', weight: 1, fillOpacity: 0.8,
            }),
          }).addTo(map);
        }
      } catch (e) {
        console.error('Failed to load GeoJSON in 2D view:', e);
      }
    }
  });

  registerCommand('set_time', (params) => {
    const { iso } = params;
    const viewer = getCesiumViewer();
    if (viewer) {
      viewer.clock.currentTime = Cesium.JulianDate.fromIso8601(iso);
    }
  });

  registerCommand('screenshot', () => {
    const viewer = getCesiumViewer();
    if (viewer) {
      viewer.render();
      viewer.canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'viewtopia-screenshot.png';
        a.click();
        URL.revokeObjectURL(url);
      });
    }
  });

  // ─── deck.gl visualization commands ──────────────────────────────────────
  registerCommand('add_heatmap', (params) => {
    const { data, radius, intensity } = params;
    const layer = createHeatmapLayer({ data, radius, intensity });
    addDeckLayer(layer);
  });

  registerCommand('add_hexbin', (params) => {
    const { data, radius, elevationScale, extruded } = params;
    const layer = createHexagonLayer({ data, radius, elevationScale, extruded });
    addDeckLayer(layer);
  });

  registerCommand('add_arcs', (params) => {
    const { data, width } = params;
    const layer = createArcLayer({ data, width });
    addDeckLayer(layer);
  });

  registerCommand('add_scatter', (params) => {
    const { data, radius, color } = params;
    const layer = createScatterLayer({ data, radius, color });
    addDeckLayer(layer);
  });

  registerCommand('add_screengrid', (params) => {
    const { data, cellSize } = params;
    const layer = createScreenGridLayer({ data, cellSize });
    addDeckLayer(layer);
  });

  // ─── New pro-feature commands ────────────────────────────────────────
  registerCommand('measure_distance', () => {
    import('./measurement.js').then(({ getMeasurementTool }) => {
      getMeasurementTool()?.startDistance();
    });
  });

  registerCommand('measure_area', () => {
    import('./measurement.js').then(({ getMeasurementTool }) => {
      getMeasurementTool()?.startArea();
    });
  });

  registerCommand('measure_height', () => {
    import('./measurement.js').then(({ getMeasurementTool }) => {
      getMeasurementTool()?.startHeight();
    });
  });

  registerCommand('annotate', (params) => {
    import('./annotations.js').then(({ getAnnotationTool }) => {
      const at = getAnnotationTool();
      if (at && params.text && params.lon != null && params.lat != null) {
        at._addEntity(crypto.randomUUID(), params.text, params.lon, params.lat, params.height || 0);
      } else if (at) {
        at.enable();
      }
    });
  });

  registerCommand('style_by_height', () => {
    import('./feature-picker.js').then(({ getStyleEditor }) => {
      getStyleEditor()?.setColorByHeight();
    });
  });

  registerCommand('style_by_classification', () => {
    import('./feature-picker.js').then(({ getStyleEditor }) => {
      getStyleEditor()?.setColorByClassification();
    });
  });

  registerCommand('style_by_property', (params) => {
    import('./feature-picker.js').then(({ getStyleEditor }) => {
      if (params.property) getStyleEditor()?.setColorByProperty(params.property);
    });
  });

  registerCommand('terrain_profile', (params) => {
    import('./terrain-profile.js').then(({ showTerrainProfile }) => {
      if (params.start_lon != null && params.start_lat != null && params.end_lon != null && params.end_lat != null) {
        showTerrainProfile(params.start_lon, params.start_lat, params.end_lon, params.end_lat, params.samples || 100);
      }
    });
  });

  registerCommand('show_timeline', (params) => {
    import('./timeline.js').then(({ showTimeline }) => {
      if (params.start && params.end) showTimeline(params.start, params.end);
    });
  });

  registerCommand('save_bookmark', (params) => {
    const name = params.name || 'Saved View';
    // Triggers the bookmark save from current camera
    document.getElementById('bk-name')?.setAttribute('value', name);
    document.getElementById('bk-save')?.click();
  });

  registerCommand('play_story', (params) => {
    import('./stories.js').then(({ getStoryPlayer }) => {
      const sp = getStoryPlayer();
      if (sp && params.story) {
        sp.load(params.story);
        sp.play();
      } else if (sp) {
        sp.showList();
      }
    });
  });

  registerCommand('split_view', () => {
    document.getElementById('split-btn')?.click();
  });

  registerCommand('switch_tab', (params) => {
    import('./tabs.js').then(({ showTab }) => {
      if (params.tab) showTab(params.tab);
    });
  });

  registerCommand('switch_renderer', (params) => {
    import('./renderers.js').then(({ switchRenderer }) => {
      if (params.renderer) switchRenderer(params.renderer);
    });
  });
}

/** Add a deck.gl layer — switches to deck.gl renderer if needed */
function addDeckLayer(layer) {
  // Import dynamically to avoid circular dependency
  import('./renderers.js').then(({ switchRenderer, getRendererInfo }) => {
    const info = getRendererInfo();
    if (info.type !== 'deckgl') {
      switchRenderer('deckgl');
      // After switch, set layer on the new deck instance
      setTimeout(() => setDeckLayers([layer]), 300);
    } else {
      setDeckLayers([layer]);
    }
  });
}

/** Set layers on the active deck.gl instance */
function setDeckLayers(layers) {
  import('./renderers.js').then(({ getActiveDeck }) => {
    const deck = getActiveDeck?.();
    if (deck) {
      const existing = deck.props.layers || [];
      deck.setProps({ layers: [...existing, ...layers] });
    }
  });
}

// ── New commands: terrain analysis, volume, model, classify ──
function registerNewCommands() {
  registerCommand('slope_map', () => {
    import('./terrain-analysis.js').then(m => {
      const btn = document.getElementById('terrain-analysis-btn');
      if (btn) btn.click();
      document.getElementById('ta-slope')?.click();
    });
  });

  registerCommand('aspect_map', () => {
    import('./terrain-analysis.js').then(m => {
      document.getElementById('ta-aspect')?.click();
    });
  });

  registerCommand('contour_lines', () => {
    import('./terrain-analysis.js').then(m => {
      document.getElementById('ta-contour')?.click();
    });
  });

  registerCommand('volume', () => {
    document.getElementById('volume-btn')?.click();
  });

  registerCommand('shadow_analysis', () => {
    document.getElementById('shadow-btn')?.click();
  });

  registerCommand('viewshed', () => {
    document.getElementById('viewshed-btn')?.click();
  });

  registerCommand('import_model', (params) => {
    document.getElementById('model-import-btn')?.click();
    if (params?.url) {
      const urlInput = document.getElementById('mi-url');
      if (urlInput) urlInput.value = params.url;
      if (params.lon) document.getElementById('mi-lon').value = params.lon;
      if (params.lat) document.getElementById('mi-lat').value = params.lat;
      if (params.height) document.getElementById('mi-height').value = params.height;
      document.getElementById('mi-load-url')?.click();
    }
  });

  registerCommand('classify_pointcloud', (params) => {
    document.getElementById('classify-btn')?.click();
    if (params?.asset) {
      setTimeout(() => {
        const sel = document.getElementById('clf-asset-select');
        if (sel) sel.value = params.asset;
        document.getElementById('clf-run')?.click();
      }, 500);
    }
  });

  registerCommand('compare_pointclouds', (params) => {
    document.getElementById('pc-compare-btn')?.click();
    if (params?.scanA) document.getElementById('pcc-scan-a').value = params.scanA;
    if (params?.scanB) document.getElementById('pcc-scan-b').value = params.scanB;
    if (params?.scanA && params?.scanB) document.getElementById('pcc-load')?.click();
  });
}

registerNewCommands();
