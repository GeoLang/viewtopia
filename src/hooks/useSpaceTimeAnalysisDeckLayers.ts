import { useEffect } from 'react';
import { PathLayer, ScatterplotLayer } from '@deck.gl/layers';
import { useSpaceTimeStore } from '../features/spacetime/store';
import { timeToElevation } from '../features/spacetime/cube';
import type { AnalysisPath, AnalysisPoint } from '../features/spacetime/analysis/run';
import { useDeckLayersStore } from './deckLayers';

const RING_LINE_WIDTH = 2;

/**
 * Draws whatever the last analysis produced. Every analysis returns the same
 * two kinds of mark, so this builds the same three layers for all of them and
 * never branches on which analysis ran.
 */
export function useSpaceTimeAnalysisDeckLayers() {
  const result = useSpaceTimeStore((s) => s.analysisResult);
  const timeRange = useSpaceTimeStore((s) => s.timeRange);
  const setGroup = useDeckLayersStore((s) => s.setGroup);

  useEffect(() => {
    if (!result) {
      setGroup('spacetime-analysis', []);
      return;
    }

    const rings = result.points.filter((p) => p.ringRadiusM !== null);
    const markers = result.points.filter((p) => p.ringRadiusM === null);
    const layers = [];

    if (result.paths.length > 0) {
      layers.push(
        new PathLayer({
          id: 'spacetime-analysis-paths',
          data: result.paths,
          getPath: (d: AnalysisPath) =>
            d.points.map(
              (p) => [p.lng, p.lat, timeToElevation(p.timestamp, timeRange)] as [number, number, number],
            ),
          getColor: (d: AnalysisPath) => d.color,
          getWidth: (d: AnalysisPath) => d.width,
          widthUnits: 'pixels',
          jointRounded: true,
          capRounded: true,
          pickable: true,
        }),
      );
    }

    if (rings.length > 0) {
      layers.push(
        new ScatterplotLayer({
          id: 'spacetime-analysis-rings',
          data: rings,
          getPosition: (d: AnalysisPoint) =>
            [d.lng, d.lat, timeToElevation(d.timestamp, timeRange)] as [number, number, number],
          getRadius: (d: AnalysisPoint) => d.ringRadiusM ?? 0,
          radiusUnits: 'meters',
          filled: false,
          stroked: true,
          getLineColor: (d: AnalysisPoint) => d.color,
          getLineWidth: RING_LINE_WIDTH,
          lineWidthUnits: 'pixels',
          pickable: true,
        }),
      );
    }

    if (markers.length > 0) {
      layers.push(
        new ScatterplotLayer({
          id: 'spacetime-analysis-points',
          data: markers,
          getPosition: (d: AnalysisPoint) =>
            [d.lng, d.lat, timeToElevation(d.timestamp, timeRange)] as [number, number, number],
          getFillColor: (d: AnalysisPoint) => d.color,
          getRadius: (d: AnalysisPoint) => d.radius,
          radiusUnits: 'pixels',
          stroked: true,
          getLineColor: [15, 15, 20, 200] as [number, number, number, number],
          getLineWidth: 1,
          lineWidthUnits: 'pixels',
          pickable: true,
        }),
      );
    }

    setGroup('spacetime-analysis', layers);
  }, [result, timeRange, setGroup]);
}
