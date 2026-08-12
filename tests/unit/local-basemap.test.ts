import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';
import L from 'leaflet';
import type { StyleSpecification } from 'maplibre-gl';
import {
  localBasemapStyle,
  localBasemapSelectGroup,
  maplibreStyle,
  rasterTiles,
  type LocalBasemap,
} from '../../src/hooks/basemapTiles';
import { cesiumImageryProvider } from '../../src/hooks/useCesium';
import { useLeaflet } from '../../src/hooks/useLeaflet';
import { useAppStore } from '../../src/store/app';
import { serializeProject, applyProject, parseProject } from '../../src/features/project/projectFile';

const ARCHIVE = 'planet.pmtiles';
const loaded: LocalBasemap = { name: ARCHIVE, status: 'loaded', kind: 'vector' };

const asStyle = (s: StyleSpecification | string): StyleSpecification => {
  expect(typeof s).toBe('object');
  return s as StyleSpecification;
};

describe('a basemap read from a .pmtiles on disk', () => {
  it('styles a vector archive off the pmtiles protocol, with app-served fonts', () => {
    const style = asStyle(maplibreStyle('local', '', null, loaded));
    expect(style.sources.protomaps).toMatchObject({
      type: 'vector',
      url: `pmtiles://${ARCHIVE}`,
    });
    expect(style.glyphs).toBe('/basemaps-assets/fonts/{fontstack}/{range}.pbf');
    expect(style.layers.length).toBeGreaterThan(10);
  });

  it('styles a raster archive as one raster source over the same protocol', () => {
    const style = localBasemapStyle({ name: 'hillshade.pmtiles', status: 'loaded', kind: 'raster' });
    expect(style.sources.basemap).toMatchObject({
      type: 'raster',
      url: 'pmtiles://hillshade.pmtiles',
    });
    expect(style.layers).toEqual([{ id: 'basemap', type: 'raster', source: 'basemap' }]);
  });

  it('draws nothing when the file is gone, rather than another basemap', () => {
    const style = asStyle(maplibreStyle('local', '', null, { name: ARCHIVE, status: 'needs-file' }));
    expect(style.layers).toEqual([]);
    expect(style.sources).toEqual({});
    expect(asStyle(maplibreStyle('local')).layers).toEqual([]);
  });

  it('names the archive in the picker', () => {
    expect(localBasemapSelectGroup(loaded)).toEqual({
      group: 'Local file (MapLibre only)',
      items: [{ value: 'local', label: ARCHIVE }],
    });
  });
});

describe('picking a local basemap', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({ basemap: 'dark', localBasemap: null });
  });

  it('selects it as the basemap', () => {
    useAppStore.getState().setLocalBasemap(loaded);
    expect(useAppStore.getState().basemap).toBe('local');
    expect(maplibreStyle('local', '', null, useAppStore.getState().localBasemap)).toMatchObject({
      sources: { protomaps: { url: `pmtiles://${ARCHIVE}` } },
    });
  });

  it('comes back after a reload knowing only which file to ask for', () => {
    useAppStore.getState().setLocalBasemap(loaded);
    const saved = JSON.parse(localStorage.getItem('viewtopia-app') ?? '{}');
    expect(saved.state.basemap).toBe('local');
    expect(saved.state.localBasemap).toEqual({ name: ARCHIVE, status: 'needs-file' });
  });

  it('travels in a project file by name only, and asks the opener for the file', () => {
    useAppStore.getState().setLocalBasemap(loaded);
    const project = parseProject(JSON.stringify(serializeProject('work')));
    expect(project.localBasemap).toEqual({ name: ARCHIVE });

    useAppStore.setState({ basemap: 'dark', localBasemap: null });
    applyProject(project);
    expect(useAppStore.getState().localBasemap).toEqual({ name: ARCHIVE, status: 'needs-file' });
    expect(asStyle(maplibreStyle('local', '', null, useAppStore.getState().localBasemap)).layers)
      .toEqual([]);
  });
});

describe('renderers that cannot read a local archive', () => {
  const CONTAINER_ID = 'leaflet-container';

  function makeContainer() {
    const div = document.createElement('div');
    div.id = CONTAINER_ID;
    for (const [prop, value] of [
      ['clientWidth', 800],
      ['clientHeight', 600],
      ['offsetWidth', 800],
      ['offsetHeight', 600],
    ] as const) {
      Object.defineProperty(div, prop, { value, configurable: true });
    }
    document.body.appendChild(div);
    return div;
  }

  const tileLayers = (map: L.Map) => {
    let count = 0;
    map.eachLayer((layer) => {
      if (layer instanceof L.TileLayer) count += 1;
    });
    return count;
  };

  beforeEach(() => {
    makeContainer();
    useAppStore.setState({ activeTab: 'map' });
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
    useAppStore.setState({ activeTab: 'globe', basemap: 'dark', localBasemap: null });
  });

  it('have no raster to stand in for it', () => {
    expect(rasterTiles('local')).toBeNull();
    expect(rasterTiles('dark')).not.toBeNull();
  });

  it('leaves leaflet with no tile layer at all', () => {
    useAppStore.setState({ basemap: 'osm' });
    const withRaster = renderHook(() => useLeaflet({ containerId: CONTAINER_ID }));
    expect(tileLayers(withRaster.result.current.current as L.Map)).toBe(1);
    withRaster.unmount();

    useAppStore.setState({ basemap: 'local', localBasemap: loaded });
    const withArchive = renderHook(() => useLeaflet({ containerId: CONTAINER_ID }));
    expect(tileLayers(withArchive.result.current.current as L.Map)).toBe(0);
  });

  it('leaves cesium with no imagery provider', () => {
    expect(cesiumImageryProvider('local')).toBeNull();
    expect(cesiumImageryProvider('dark')).not.toBeNull();
  });
});
