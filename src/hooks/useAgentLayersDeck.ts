import { useEffect } from 'react';
import { GeoJsonLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import { useAgentLayerStore } from '../store/agentLayers';
import { useDeckLayersStore } from './deckLayers';

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return Number.isNaN(n)
    ? [59, 130, 246]
    : [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/**
 * Contributes the agent's ui_spec layers to the map's deck overlay. Cesium and
 * MapLibre have their own hooks reading the same store; framing the new spec is
 * the map's job, so this one only builds layers.
 */
export function useAgentLayersDeck() {
  const layers = useAgentLayerStore((s) => s.layers);
  const markers = useAgentLayerStore((s) => s.markers);
  const setGroup = useDeckLayersStore((s) => s.setGroup);

  useEffect(() => {
    setGroup(
      'agent-layers',
      layers.map((layer) => {
        const rgb = hexToRgb(layer.color);
        return new GeoJsonLayer({
          id: `agent-layer-${layer.id}`,
          data: layer.geojson,
          pickable: true,
          stroked: true,
          filled: true,
          pointType: 'circle',
          getFillColor: [...rgb, 77],
          getLineColor: rgb,
          getLineWidth: 2,
          lineWidthUnits: 'pixels',
          getPointRadius: 5,
          pointRadiusUnits: 'pixels',
        });
      }),
    );
  }, [layers, setGroup]);

  useEffect(() => {
    const dots = new ScatterplotLayer({
      id: 'agent-markers',
      data: markers,
      getPosition: (m) => [m.lon, m.lat],
      getFillColor: (m) => hexToRgb(m.color),
      getRadius: 5,
      radiusUnits: 'pixels',
      stroked: true,
      getLineColor: [255, 255, 255],
      getLineWidth: 1,
      lineWidthUnits: 'pixels',
    });
    const labels = new TextLayer({
      id: 'agent-marker-labels',
      data: markers.filter((m) => m.label),
      getPosition: (m) => [m.lon, m.lat],
      getText: (m) => m.label!,
      getSize: 14,
      getColor: [255, 255, 255],
      getPixelOffset: [0, -14],
      outlineWidth: 2,
      outlineColor: [0, 0, 0],
      fontSettings: { sdf: true },
    });
    setGroup('agent-markers', markers.length ? [dots, labels] : []);
  }, [markers, setGroup]);
}
