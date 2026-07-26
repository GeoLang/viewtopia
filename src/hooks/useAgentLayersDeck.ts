import { useEffect, useRef } from 'react';
import { GeoJsonLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import { useAgentLayerStore } from '../store/agentLayers';
import { useAppStore } from '../store/app';
import { useDeckLayersStore } from './deckLayers';
import { agentLayersBounds } from './agentLayerBounds';

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return Number.isNaN(n)
    ? [59, 130, 246]
    : [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/**
 * Draws the agent's ui_spec layers on the standalone Deck, so switching to
 * deck.gl keeps them. Cesium and MapLibre have their own hooks reading the same
 * store.
 */
export function useAgentLayersDeck(
  fitBounds: (bounds: [number, number, number, number]) => void,
) {
  const layers = useAgentLayerStore((s) => s.layers);
  const markers = useAgentLayerStore((s) => s.markers);
  const generation = useAgentLayerStore((s) => s.generation);
  const renderer = useAppStore((s) => s.renderer);
  const activeTab = useAppStore((s) => s.activeTab);
  const setGroup = useDeckLayersStore((s) => s.setGroup);
  const framedRef = useRef(-1);

  const isActive = activeTab === 'globe' && renderer === 'deckgl';

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

  // Frame once per spec, and only while deck is the live renderer — the Deck is
  // destroyed when it isn't, so framing then would be dropped and never retried.
  useEffect(() => {
    if (!isActive || framedRef.current === generation) return;
    const bounds = agentLayersBounds(layers);
    if (!bounds) return;
    framedRef.current = generation;
    fitBounds(bounds);
  }, [layers, generation, isActive, fitBounds]);
}
