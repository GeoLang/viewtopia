/**
 * Multi-renderer engine for ViewTopia.
 *
 * Supports switching between:
 * - CesiumJS (3D globe, terrain, 3D Tiles)
 * - deck.gl (WebGL2 data visualization, 3D Tiles via loaders.gl)
 * - MapLibre GL JS (vector tiles, 2.5D buildings, terrain)
 *
 * Ported from TileTopia's renderers.js with shared camera state.
 */

import { Deck } from '@deck.gl/core';
import { Tile3DLayer, TileLayer } from '@deck.gl/geo-layers';
import { BitmapLayer } from '@deck.gl/layers';
import { Tiles3DLoader } from '@loaders.gl/3d-tiles';
import { MapboxOverlay } from '@deck.gl/mapbox';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import * as Cesium from 'cesium';

const API = '/api/v1';

let activeRenderer = null;
let cesiumViewer = null;
let sharedCamera = { longitude: -122.4, latitude: 37.8, zoom: 11, pitch: 45, bearing: 0 };
let deckViewState = null;

// Basemap tile templates shared by the deck.gl and MapLibre renderers.
// NOTE: no {s} subdomain token — neither deck.gl TileLayer nor MapLibre raster
// sources expand it. Esri imagery uses {z}/{y}/{x} ordering.
const BASEMAP_TILES = {
  osm: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  topo: 'https://tile.opentopomap.org/{z}/{x}/{y}.png',
  dark: 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
};
// Remember the chosen basemap so a renderer initialized later starts on it.
let currentBasemap = 'osm';

// MapLibre raster paint: darken/desaturate only the plain & dark basemaps so the
// satellite and topo imagery render at their natural colours.
function basemapPaint(name) {
  const stylize = name === 'osm' || name === 'dark';
  return {
    'raster-brightness-max': stylize ? 0.7 : 1,
    'raster-saturation': stylize ? -0.4 : 0,
  };
}

// deck.gl raster basemap as a TileLayer (stable id so it can be swapped in place).
function makeDeckBasemapLayer(name) {
  return new TileLayer({
    id: 'basemap',
    data: BASEMAP_TILES[name] || BASEMAP_TILES.osm,
    minZoom: 0,
    maxZoom: 19,
    tileSize: 256,
    renderSubLayers: (props) => {
      const { boundingBox } = props.tile;
      return new BitmapLayer(props, {
        data: null,
        image: props.data,
        bounds: [boundingBox[0][0], boundingBox[0][1], boundingBox[1][0], boundingBox[1][1]],
      });
    },
  });
}

function captureCamera() {
  if (activeRenderer?.type === 'deckgl') {
    const vs = deckViewState;
    if (vs) {
      sharedCamera = { longitude: vs.longitude, latitude: vs.latitude, zoom: vs.zoom, pitch: vs.pitch ?? 45, bearing: vs.bearing ?? 0 };
    }
  } else if (activeRenderer?.type === 'maplibre' && activeRenderer.map) {
    const c = activeRenderer.map.getCenter();
    sharedCamera = { longitude: c.lng, latitude: c.lat, zoom: activeRenderer.map.getZoom(), pitch: activeRenderer.map.getPitch(), bearing: activeRenderer.map.getBearing() };
  } else if (cesiumViewer) {
    const carto = cesiumViewer.camera.positionCartographic;
    if (carto) {
      sharedCamera = {
        longitude: Cesium.Math.toDegrees(carto.longitude),
        latitude: Cesium.Math.toDegrees(carto.latitude),
        zoom: Math.max(0, Math.log2(4e7 / Math.max(carto.height, 1))),
        pitch: Cesium.Math.toDegrees(-cesiumViewer.camera.pitch) || 45,
        bearing: Cesium.Math.toDegrees(cesiumViewer.camera.heading) || 0,
      };
    }
  }
}

export function setCesiumViewer(viewer) {
  cesiumViewer = viewer;
}

export function getCesiumViewer() {
  return cesiumViewer;
}

export function getSharedCamera() {
  captureCamera();
  return { ...sharedCamera };
}

export function initRendererSelector() {
  const select = document.getElementById('renderer-choice');
  if (!select) return;
  select.addEventListener('change', (e) => {
    switchRenderer(e.target.value);
  });
}

export function switchRenderer(renderer) {
  captureCamera();
  cleanupActiveRenderer();
  const container = document.getElementById('globe-container');

  switch (renderer) {
    case 'cesium':
      showCesium(container);
      break;
    case 'deckgl':
      hideCesium(container);
      initDeckGL(container);
      break;
    case 'maplibre':
      hideCesium(container);
      initMapLibre(container);
      break;
  }
}

export function getRendererInfo() {
  if (activeRenderer) return { type: activeRenderer.type };
  if (cesiumViewer) return { type: 'cesium' };
  return { type: 'none' };
}

export function getActiveDeck() {
  if (activeRenderer?.type === 'deckgl') return activeRenderer.deck;
  return null;
}

export function getActiveMapLibre() {
  if (activeRenderer?.type === 'maplibre') return activeRenderer.map;
  return null;
}

export function getMapLibreDeckOverlay() {
  if (activeRenderer?.type === 'maplibre') return activeRenderer.deckOverlay;
  return null;
}

function showCesium(container) {
  const overlay = container.querySelector('.renderer-overlay');
  if (overlay) overlay.remove();
  container.querySelectorAll('.cesium-widget').forEach(el => el.style.display = '');
  if (cesiumViewer) {
    cesiumViewer.resize();
    const height = 4e7 / Math.pow(2, sharedCamera.zoom);
    cesiumViewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(sharedCamera.longitude, sharedCamera.latitude, height),
      orientation: {
        heading: Cesium.Math.toRadians(sharedCamera.bearing),
        pitch: Cesium.Math.toRadians(-sharedCamera.pitch),
        roll: 0,
      },
      duration: 0,
    });
  }
}

function hideCesium(container) {
  container.querySelectorAll('.cesium-widget').forEach(el => el.style.display = 'none');
}

function cleanupActiveRenderer() {
  if (activeRenderer) {
    if (activeRenderer.type === 'deckgl' && activeRenderer.deck) {
      activeRenderer.deck.finalize();
    }
    if (activeRenderer.type === 'maplibre' && activeRenderer.map) {
      activeRenderer.map.remove();
    }
    const overlay = document.querySelector('.renderer-overlay');
    if (overlay) overlay.remove();
    activeRenderer = null;
  }
}

function initDeckGL(container) {
  const overlay = document.createElement('div');
  overlay.className = 'renderer-overlay';
  overlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;z-index:10;';
  container.appendChild(overlay);

  const initState = {
    longitude: sharedCamera.longitude,
    latitude: sharedCamera.latitude,
    zoom: sharedCamera.zoom,
    pitch: sharedCamera.pitch,
    bearing: sharedCamera.bearing,
  };
  deckViewState = initState;

  const deck = new Deck({
    parent: overlay,
    initialViewState: initState,
    controller: true,
    onViewStateChange: ({ viewState }) => {
      deckViewState = viewState;
    },
    layers: [makeDeckBasemapLayer(currentBasemap)],
    getTooltip: ({ object }) => object && JSON.stringify(object.properties),
  });

  activeRenderer = { type: 'deckgl', deck };
}

function initMapLibre(container) {
  const overlay = document.createElement('div');
  overlay.className = 'renderer-overlay';
  overlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;z-index:10;';
  container.appendChild(overlay);

  const map = new maplibregl.Map({
    container: overlay,
    style: {
      version: 8,
      name: 'ViewTopia Basemap',
      sources: {
        basemap: {
          type: 'raster',
          tiles: [BASEMAP_TILES[currentBasemap] || BASEMAP_TILES.osm],
          tileSize: 256,
          attribution: '&copy; OpenStreetMap, Esri, OpenTopoMap, CARTO',
        },
      },
      layers: [{
        id: 'basemap-layer',
        type: 'raster',
        // Only stylize the plain/dark basemaps; show satellite/topo imagery as-is.
        paint: basemapPaint(currentBasemap),
        source: 'basemap',
      }],
    },
    center: [sharedCamera.longitude, sharedCamera.latitude],
    zoom: sharedCamera.zoom,
    pitch: sharedCamera.pitch,
    bearing: sharedCamera.bearing,
    maxPitch: 85,
  });

  map.addControl(new maplibregl.NavigationControl(), 'top-right');

  // deck.gl overlay for rendering deck layers on MapLibre
  const deckOverlay = new MapboxOverlay({ layers: [] });
  map.addControl(deckOverlay);

  // MapLibre needs a resize after the container is in the DOM and visible
  map.on('load', () => map.resize());
  setTimeout(() => map.resize(), 200);

  activeRenderer = { type: 'maplibre', map, deckOverlay };
}

// Swap the deck.gl basemap in place, preserving any data layers on top of it.
function switchDeckBasemap(name) {
  const deck = activeRenderer?.deck;
  if (!deck) return;
  const others = (deck.props.layers || []).filter((l) => l && l.id !== 'basemap');
  deck.setProps({ layers: [makeDeckBasemapLayer(name), ...others] });
}

// Swap the MapLibre raster basemap source + paint in place.
function switchMapLibreBasemap(name) {
  const map = activeRenderer?.map;
  if (!map) return;
  const apply = () => {
    const src = map.getSource('basemap');
    if (src && typeof src.setTiles === 'function') {
      src.setTiles([BASEMAP_TILES[name] || BASEMAP_TILES.osm]);
    }
    const paint = basemapPaint(name);
    for (const [prop, val] of Object.entries(paint)) {
      map.setPaintProperty('basemap-layer', prop, val);
    }
  };
  if (map.isStyleLoaded()) apply();
  else map.once('idle', apply);
}

// Apply a basemap to whichever of the deck.gl / MapLibre renderers is active.
// (Cesium and Leaflet have their own switchers; this fills the gap for the other two.)
export function switchRendererBasemap(name) {
  currentBasemap = name;
  if (activeRenderer?.type === 'deckgl') switchDeckBasemap(name);
  else if (activeRenderer?.type === 'maplibre') switchMapLibreBasemap(name);
}
