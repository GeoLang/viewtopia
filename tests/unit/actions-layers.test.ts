import { beforeEach, describe, expect, it } from 'vitest';
import '../../src/actions/layers';
import { listViewerLayers } from '../../src/actions/layerIndex';
import { ActionError, runAction } from '../../src/actions/registry';
import { useDeckLayersStore } from '../../src/hooks/deckLayers';
import { useHeatmapStore } from '../../src/lib/mapHeatmap';
import type { PointRecord } from '../../src/lib/pointData';
import { useAgentLayerStore, type AgentLayer } from '../../src/store/agentLayers';
import { useAppStore } from '../../src/store/app';
import { useOgcLayerStore } from '../../src/store/ogcLayers';
import { useTiles3dLayerStore } from '../../src/store/tiles3dLayers';

function point(risk: number, name: string): GeoJSON.Feature {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [7.42 + risk / 100, 43.73] },
    properties: { risk, name },
  };
}

const ROADS: AgentLayer = {
  id: 'agent-roads',
  name: 'Roads',
  geojson: {
    type: 'FeatureCollection',
    features: [point(1, 'north'), point(2, 'east'), point(3, 'south'), point(4, 'west')],
  },
};

const ROAD_WORKS: AgentLayer = {
  id: 'agent-road-works',
  name: 'Road works',
  geojson: { type: 'FeatureCollection', features: [point(9, 'depot')] },
};

/** a layer addGeoJsonLayer put in the app store and the agent store at once */
const SHARED_ID = 'ptolemy-branch-b1';

function seed(): void {
  useAppStore.setState({
    layers: [
      { id: 'map-contours', name: 'Contours', type: 'geojson', visible: true, opacity: 1 },
      { id: SHARED_ID, name: 'Branch main', type: 'geojson', visible: true, opacity: 1 },
    ],
  });
  useAgentLayerStore.setState({
    layers: [
      ROADS,
      ROAD_WORKS,
      { id: SHARED_ID, name: 'Branch main', geojson: { type: 'FeatureCollection', features: [point(1, 'a')] } },
    ],
    rasterLayers: [
      { id: 'raster-plan', name: 'Site plan', url: 'data:,', corners: {} as never, opacity: 0.8, visible: true },
    ],
    markers: [],
    generation: 0,
  });
  useOgcLayerStore.setState({
    layers: [{ id: 'ogc-weather', name: 'Rainfall', type: 'wms', url: 'https://example.test/wms' }],
  });
  useTiles3dLayerStore.setState({
    layers: [{ id: 'tiles-campus', name: 'Campus', url: 'https://example.test/tileset.json', visible: true }],
    loaded: {},
  });
}

describe('the viewer layer list', () => {
  beforeEach(seed);

  it('lists every store once, with the drawing store reporting a shared id', () => {
    const listed = listViewerLayers();
    expect(listed.map((layer) => layer.id)).toEqual([
      'agent-roads',
      'agent-road-works',
      SHARED_ID,
      'raster-plan',
      'ogc-weather',
      'tiles-campus',
      'map-contours',
    ]);
    expect(listed.find((layer) => layer.id === SHARED_ID)?.kind).toBe('agent');
    expect(listed.find((layer) => layer.id === 'raster-plan')?.opacity).toBe(0.8);
  });
});

describe('layers.set_visible', () => {
  beforeEach(seed);

  it('hides the layer a name names', async () => {
    const result = await runAction('layers.set_visible', { layer: 'Rainfall', visible: false });
    expect(useOgcLayerStore.getState().layers[0].visible).toBe(false);
    expect(result.text).toBe('Rainfall is now hidden.');
  });

  it('moves both stores holding one id', async () => {
    await runAction('layers.set_visible', { layer: SHARED_ID, visible: false });
    expect(useAppStore.getState().layers[1].visible).toBe(false);
    expect(useAgentLayerStore.getState().layers[2].visible).toBe(false);
  });

  it('refuses a name several layers carry', async () => {
    await expect(runAction('layers.set_visible', { layer: 'road', visible: false })).rejects.toThrow(
      ActionError,
    );
    expect(useAgentLayerStore.getState().layers[0].visible).toBeUndefined();
  });
});

describe('layers.set_opacity', () => {
  beforeEach(seed);

  it('sets the fill opacity of a vector layer', async () => {
    await runAction('layers.set_opacity', { layer: 'Roads', opacity: 0.25 });
    expect(useAgentLayerStore.getState().layers[0].style?.opacity).toBe(0.25);
  });

  it('sets an image layer opacity', async () => {
    await runAction('layers.set_opacity', { layer: 'Site plan', opacity: 0.5 });
    expect(useAgentLayerStore.getState().rasterLayers[0].opacity).toBe(0.5);
  });

  it('says a 3D Tiles layer has no opacity to set', async () => {
    await expect(runAction('layers.set_opacity', { layer: 'Campus', opacity: 0.5 })).rejects.toThrow(
      'draws at one opacity only',
    );
  });

  it('refuses an opacity outside 0 to 1', async () => {
    await expect(runAction('layers.set_opacity', { layer: 'Roads', opacity: 40 })).rejects.toThrow(
      ActionError,
    );
  });
});

describe('layers.remove', () => {
  beforeEach(seed);

  it('takes the layer out of every store holding it', async () => {
    await runAction('layers.remove', { layer: 'Branch main' });
    expect(useAppStore.getState().layers.map((layer) => layer.id)).toEqual(['map-contours']);
    expect(useAgentLayerStore.getState().layers.map((layer) => layer.id)).toEqual([
      'agent-roads',
      'agent-road-works',
    ]);
  });
});

describe('layers.move', () => {
  beforeEach(seed);

  it('moves a map layer up its list', async () => {
    await runAction('layers.move', { layer: 'Contours', position: 'top' });
    expect(useAppStore.getState().layers.map((layer) => layer.id)).toEqual([
      SHARED_ID,
      'map-contours',
    ]);
  });

  it('moves an image layer, which has its own order', async () => {
    useAgentLayerStore.setState({
      rasterLayers: [
        { id: 'raster-a', name: 'Plan A', url: 'data:,', corners: {} as never, opacity: 1, visible: true },
        { id: 'raster-b', name: 'Plan B', url: 'data:,', corners: {} as never, opacity: 1, visible: true },
      ],
    });
    await runAction('layers.move', { layer: 'Plan B', position: 'down' });
    expect(useAgentLayerStore.getState().rasterLayers.map((layer) => layer.id)).toEqual([
      'raster-b',
      'raster-a',
    ]);
  });

  it('says a service layer has no drawing order', async () => {
    await expect(runAction('layers.move', { layer: 'Rainfall', position: 'top' })).rejects.toThrow(
      'has no drawing order',
    );
  });

  it('refuses a position that is not one of the four', async () => {
    await expect(runAction('layers.move', { layer: 'Contours', position: 'sideways' })).rejects.toThrow(
      'position must be one of',
    );
  });
});

describe('layers.set_color', () => {
  beforeEach(seed);

  it('paints a vector layer', async () => {
    await runAction('layers.set_color', { layer: 'Roads', color: '#ff8800' });
    expect(useAgentLayerStore.getState().layers[0].color).toBe('#ff8800');
  });

  it('refuses a layer with no features', async () => {
    await expect(runAction('layers.set_color', { layer: 'Campus', color: 'teal' })).rejects.toThrow(
      'carries no features',
    );
  });

  it('refuses text the browser does not read as a colour', async () => {
    await expect(runAction('layers.set_color', { layer: 'Roads', color: 'ultraviolet' })).rejects.toThrow(
      'is not a colour',
    );
  });
});

describe('layers.shade_by', () => {
  beforeEach(seed);

  it('shades a vector layer by one of its columns', async () => {
    const result = await runAction('layers.shade_by', { layer: 'Roads', column: 'risk' });
    expect(useAgentLayerStore.getState().layers[0].symbology?.field).toBe('risk');
    expect(result.text).toBe('Roads is shaded by risk.');
  });

  it('names the columns the layer does carry', async () => {
    await expect(runAction('layers.shade_by', { layer: 'Roads', column: 'height' })).rejects.toThrow(
      'It carries: risk, name',
    );
  });
});

describe('the layer visualizations', () => {
  /** a layer that carries features but no coordinates to draw */
  const EMPTY_GEOMETRY: AgentLayer = {
    id: 'agent-plans',
    name: 'Plans',
    geojson: {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: null, properties: { name: 'unplaced' } }],
    },
  };

  /** points carrying the weight property a heatmap reads, one of them without it */
  const READINGS: AgentLayer = {
    id: 'agent-readings',
    name: 'Readings',
    geojson: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [7.4, 43.7] },
          properties: { weight: 6 },
        },
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [7.5, 43.7] },
          properties: {},
        },
      ],
    },
  };

  const roadPositions = ROADS.geojson.features.map(
    (feature) => (feature.geometry as GeoJSON.Point).coordinates,
  );

  /** the deck layer the last command registered, since the group accumulates */
  function lastDeckLayer(): { props: Record<string, unknown> } {
    const group = useDeckLayersStore.getState().groups.agent ?? [];
    return group[group.length - 1] as unknown as { props: Record<string, unknown> };
  }

  function drawnPositions(): unknown[] {
    return (lastDeckLayer().props.data as PointRecord[]).map((record) => record.position);
  }

  beforeEach(() => {
    seed();
    useAgentLayerStore.setState({
      layers: [...useAgentLayerStore.getState().layers, EMPTY_GEOMETRY, READINGS],
    });
    useAppStore.setState({ renderer: 'cesium', activeTab: 'map' });
    useHeatmapStore.setState({ heatmaps: [] });
    useDeckLayersStore.setState({ groups: {} });
  });

  it('draws a heatmap from the points of the named layer', async () => {
    const result = await runAction('layers.add_heatmap', {
      layer: 'Roads',
      radius: 45,
      intensity: 2,
    });

    const heatmaps = useHeatmapStore.getState().heatmaps;
    expect(heatmaps).toHaveLength(1);
    expect(heatmaps[0]).toMatchObject({ radius: 45, intensity: 2 });
    expect(heatmaps[0].points.map((point) => point.position)).toEqual(roadPositions);
    expect(useAppStore.getState().renderer).toBe('maplibre');
    expect(result.text).toBe(
      'Drew 4 points of Roads as a heatmap. The map is now on the maplibre renderer, which is what draws it.',
    );
  });

  it('weighs a heatmap point by its own weight property, as the panel does', async () => {
    await runAction('layers.add_heatmap', { layer: 'Readings' });

    expect(useHeatmapStore.getState().heatmaps[0].points).toEqual([
      { position: [7.4, 43.7], weight: 6 },
      { position: [7.5, 43.7], weight: 1 },
    ]);
  });

  it('bins the points of the named layer into hexagons', async () => {
    const result = await runAction('layers.add_hexbin', {
      layer: 'Roads',
      radius: 300,
      elevation_scale: 5,
    });

    expect(drawnPositions()).toEqual(roadPositions);
    expect(lastDeckLayer().props.radius).toBe(300);
    expect(lastDeckLayer().props.elevationScale).toBe(5);
    expect(useAppStore.getState().renderer).toBe('maplibre');
    expect(result.text).toBe(
      'Binned 4 points of Roads into hexagons. The map is now on the maplibre renderer, which is what draws it.',
    );
  });

  it('draws the points of the named layer as circles', async () => {
    const result = await runAction('layers.add_scatter', { layer: 'Road works', radius: 25 });

    const works = ROAD_WORKS.geojson.features.map(
      (feature) => (feature.geometry as GeoJSON.Point).coordinates,
    );
    expect(drawnPositions()).toEqual(works);
    // deck reads a scatter radius per record, so the handler passes it as getRadius
    expect(lastDeckLayer().props.getRadius).toBe(25);
    expect(useAppStore.getState().renderer).toBe('maplibre');
    expect(result.text).toBe(
      'Drew 1 point of Road works as circles. The map is now on the maplibre renderer, which is what draws it.',
    );
  });

  it('refuses a layer name none of them carries', async () => {
    for (const name of ['layers.add_heatmap', 'layers.add_hexbin', 'layers.add_scatter']) {
      await expect(runAction(name, { layer: 'nowhere' })).rejects.toThrow(
        'no layer matches "nowhere"',
      );
    }
    expect(useHeatmapStore.getState().heatmaps).toEqual([]);
    expect(useDeckLayersStore.getState().groups.agent ?? []).toEqual([]);
  });

  it('refuses a layer that carries no features', async () => {
    for (const name of ['layers.add_heatmap', 'layers.add_hexbin', 'layers.add_scatter']) {
      await expect(runAction(name, { layer: 'Campus' })).rejects.toThrow('carries no features');
    }
  });

  it('refuses a layer whose features hold no points', async () => {
    for (const name of ['layers.add_heatmap', 'layers.add_hexbin', 'layers.add_scatter']) {
      await expect(runAction(name, { layer: 'Plans' })).rejects.toThrow(
        'Plans has no points to draw',
      );
    }
    expect(useAppStore.getState().renderer).toBe('cesium');
  });
});
