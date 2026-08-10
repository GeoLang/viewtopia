import { describe, it, expect, beforeEach } from 'vitest';
import { asColor } from '../../src/lib/color';
import {
  DEFAULT_LAYER_COLOR,
  useAgentLayerStore,
  type AgentLayer,
} from '../../src/store/agentLayers';

/**
 * Colours arrive from the agent and from files. Every renderer parses them
 * itself, and Cesium answers undefined for one it cannot read, so a layer whose
 * colour is not a colour would stop the draw of the layers after it.
 */

const layer = (color: string): AgentLayer => ({
  id: 'risk',
  name: 'risk',
  color,
  geojson: {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [12, 45] } },
    ],
  },
});

beforeEach(() => {
  useAgentLayerStore.setState({ layers: [], rasterLayers: [], markers: [], generation: 0 });
});

describe('asColor', () => {
  it('keeps what the browser reads as a colour', () => {
    expect(asColor('#ff0000', '#000')).toBe('#ff0000');
    expect(asColor('rebeccapurple', '#000')).toBe('rebeccapurple');
    expect(asColor('rgba(1, 2, 3, 0.5)', '#000')).toBe('rgba(1, 2, 3, 0.5)');
  });

  it('drops a value that carries more than a colour', () => {
    expect(asColor('red;background-image:url(https://attacker.example/leak)', '#000')).toBe('#000');
    expect(asColor('url(https://attacker.example/leak)', '#000')).toBe('#000');
  });

  it('drops a keyword that names no colour', () => {
    expect(asColor('inherit', '#000')).toBe('#000');
    expect(asColor('', '#000')).toBe('#000');
    expect(asColor(undefined, '#000')).toBe('#000');
  });
});

describe('agent layer colours', () => {
  it('replaces an unreadable layer colour with the default', () => {
    useAgentLayerStore.getState().addLayer(layer('not a colour'));
    expect(useAgentLayerStore.getState().layers[0].color).toBe(DEFAULT_LAYER_COLOR);

    useAgentLayerStore.getState().setLayerColor('risk', 'javascript:alert(1)');
    expect(useAgentLayerStore.getState().layers[0].color).toBe(DEFAULT_LAYER_COLOR);

    useAgentLayerStore.getState().setLayerColor('risk', '#00ff00');
    expect(useAgentLayerStore.getState().layers[0].color).toBe('#00ff00');
  });

  it('replaces an unreadable marker colour, added or restored', () => {
    useAgentLayerStore.getState().addMarker({ lon: 12, lat: 45, color: 'red;position:fixed' });
    expect(useAgentLayerStore.getState().markers[0].color).toBe(DEFAULT_LAYER_COLOR);

    useAgentLayerStore
      .getState()
      .setMarkers([{ id: 'saved', lon: 12, lat: 45, color: 'expression(evil)' }]);
    const [marker] = useAgentLayerStore.getState().markers;
    expect(marker.id).toBe('saved');
    expect(marker.color).toBe(DEFAULT_LAYER_COLOR);
  });
});
