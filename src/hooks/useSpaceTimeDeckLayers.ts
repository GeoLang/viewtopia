import { useEffect } from 'react';
import { PathLayer, PolygonLayer, ScatterplotLayer } from '@deck.gl/layers';
import { useSpaceTimeStore } from '../features/spacetime/store';
import {
  eventsInWindow,
  sweepPlanePolygon,
  timeToElevation,
  tracksBounds,
} from '../features/spacetime/cube';
import { useDeckLayersStore } from './deckLayers';

function hexToRgba(hex: string, alpha = 255): [number, number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff, alpha];
}

const SHADOW_DIM = 0.45;
const SHADOW_ALPHA = 110;

function shadowColor(color: [number, number, number, number]): [number, number, number, number] {
  return [
    Math.round(color[0] * SHADOW_DIM),
    Math.round(color[1] * SHADOW_DIM),
    Math.round(color[2] * SHADOW_DIM),
    SHADOW_ALPHA,
  ];
}

const SWEEP_PLANE_FILL: [number, number, number, number] = [120, 190, 255, 40];
const SWEEP_PLANE_LINE: [number, number, number, number] = [150, 210, 255, 160];

function findClosestEvent(
  events: { timestamp: number; lat: number; lng: number }[],
  target: number,
) {
  if (events.length === 0) return null;
  let lo = 0;
  let hi = events.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (events[mid].timestamp < target) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(events[lo - 1].timestamp - target) < Math.abs(events[lo].timestamp - target)) {
    return events[lo - 1];
  }
  return events[lo];
}

interface PathDatum {
  path: [number, number, number][];
  color: [number, number, number, number];
  name: string;
}

interface PointDatum {
  position: [number, number, number];
  color: [number, number, number, number];
  name: string;
}

export function useSpaceTimeDeckLayers() {
  const tracks = useSpaceTimeStore((s) => s.tracks);
  const entities = useSpaceTimeStore((s) => s.entities);
  const timeRange = useSpaceTimeStore((s) => s.timeRange);
  const currentTime = useSpaceTimeStore((s) => s.currentTime);
  const trailDuration = useSpaceTimeStore((s) => s.trailDuration);
  const cubeView = useSpaceTimeStore((s) => s.cubeView);
  const setGroup = useDeckLayersStore((s) => s.setGroup);

  useEffect(() => {
    if (tracks.length === 0) {
      setGroup('spacetime', []);
      return;
    }

    const pathData: PathDatum[] = [];
    const shadowData: PathDatum[] = [];
    const pointData: PointDatum[] = [];
    const currentData: PointDatum[] = [];

    for (const track of tracks) {
      if (track.events.length < 1) continue;
      const entity = entities.get(track.entityId);
      const color = hexToRgba(entity?.color ?? '#a78bfa');
      const name = entity?.name ?? track.entityId;

      const windowed = eventsInWindow(track.events, currentTime, trailDuration);

      if (windowed.length >= 2) {
        pathData.push({
          path: windowed.map(
            (e) => [e.lng, e.lat, timeToElevation(e.timestamp, timeRange)] as [number, number, number],
          ),
          color,
          name,
        });
        if (cubeView) {
          shadowData.push({
            path: windowed.map((e) => [e.lng, e.lat, 0] as [number, number, number]),
            color: shadowColor(color),
            name,
          });
        }
      }

      for (const ev of windowed) {
        pointData.push({
          position: [ev.lng, ev.lat, timeToElevation(ev.timestamp, timeRange)],
          color,
          name,
        });
      }

      // Current-time marker: always the whole track, it marks "now" rather than the window
      const closest = findClosestEvent(track.events, currentTime);
      if (closest) {
        currentData.push({
          position: [closest.lng, closest.lat, timeToElevation(closest.timestamp, timeRange)],
          color: [255, 255, 255, 255],
          name,
        });
      }
    }

    const layers = [];

    if (shadowData.length > 0) {
      layers.push(
        new PathLayer({
          id: 'spacetime-shadows',
          data: shadowData,
          getPath: (d: PathDatum) => d.path,
          getColor: (d: PathDatum) => d.color,
          getWidth: 2,
          widthUnits: 'pixels',
          jointRounded: true,
          capRounded: true,
          pickable: false,
        }),
      );
    }

    if (pathData.length > 0) {
      layers.push(
        new PathLayer({
          id: 'spacetime-paths',
          data: pathData,
          getPath: (d: PathDatum) => d.path,
          getColor: (d: PathDatum) => d.color,
          getWidth: 3,
          widthUnits: 'pixels',
          jointRounded: true,
          capRounded: true,
          pickable: true,
        }),
      );
    }

    if (pointData.length > 0) {
      layers.push(
        new ScatterplotLayer({
          id: 'spacetime-points',
          data: pointData,
          getPosition: (d: PointDatum) => d.position,
          getFillColor: (d: PointDatum) => d.color,
          getRadius: 4,
          radiusUnits: 'pixels',
          pickable: true,
        }),
      );
    }

    if (currentData.length > 0) {
      layers.push(
        new ScatterplotLayer({
          id: 'spacetime-current',
          data: currentData,
          getPosition: (d: PointDatum) => d.position,
          getFillColor: (d: PointDatum) => d.color,
          getRadius: 8,
          radiusUnits: 'pixels',
          stroked: true,
          getLineColor: [255, 200, 0, 255] as [number, number, number, number],
          getLineWidth: 2,
          lineWidthUnits: 'pixels',
          pickable: true,
        }),
      );
    }

    const bounds = cubeView ? tracksBounds(tracks) : null;
    if (bounds) {
      const plane = sweepPlanePolygon(bounds, timeToElevation(currentTime, timeRange));
      layers.push(
        new PolygonLayer({
          id: 'spacetime-sweep-plane',
          data: [{ polygon: plane }],
          getPolygon: (d: { polygon: [number, number, number][] }) => d.polygon,
          getFillColor: SWEEP_PLANE_FILL,
          getLineColor: SWEEP_PLANE_LINE,
          getLineWidth: 1,
          lineWidthUnits: 'pixels',
          filled: true,
          stroked: true,
          extruded: false,
          pickable: false,
        }),
      );
    }

    setGroup('spacetime', layers);
  }, [tracks, entities, timeRange, currentTime, trailDuration, cubeView, setGroup]);
}
