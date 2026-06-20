import { useEffect } from 'react';
import { PathLayer, ScatterplotLayer } from '@deck.gl/layers';
import { useSpaceTimeStore } from '../features/spacetime/store';
import { useDeckLayersStore } from './deckLayers';

function hexToRgba(hex: string, alpha = 255): [number, number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff, alpha];
}

const ELEVATION_SCALE = 50000;

function timeToElevation(
  timestamp: number,
  timeMin: number,
  timeMax: number,
): number {
  if (timeMax === timeMin) return 0;
  return ((timestamp - timeMin) / (timeMax - timeMin)) * ELEVATION_SCALE;
}

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

export function useSpaceTimeDeckLayers() {
  const tracks = useSpaceTimeStore((s) => s.tracks);
  const entities = useSpaceTimeStore((s) => s.entities);
  const timeRange = useSpaceTimeStore((s) => s.timeRange);
  const currentTime = useSpaceTimeStore((s) => s.currentTime);
  const setGroup = useDeckLayersStore((s) => s.setGroup);

  useEffect(() => {
    if (tracks.length === 0) {
      setGroup('spacetime', []);
      return;
    }

    const { min: timeMin, max: timeMax } = timeRange;

    const pathData: { path: [number, number, number][]; color: [number, number, number, number]; name: string }[] = [];
    const pointData: { position: [number, number, number]; color: [number, number, number, number]; name: string }[] = [];
    const currentData: { position: [number, number, number]; color: [number, number, number, number]; name: string }[] = [];

    for (const track of tracks) {
      if (track.events.length < 1) continue;
      const entity = entities.get(track.entityId);
      const color = hexToRgba(entity?.color ?? '#a78bfa');
      const name = entity?.name ?? track.entityId;

      if (track.events.length >= 2) {
        pathData.push({
          path: track.events.map((e) => [
            e.lng,
            e.lat,
            timeToElevation(e.timestamp, timeMin, timeMax),
          ] as [number, number, number]),
          color,
          name,
        });
      }

      for (const ev of track.events) {
        pointData.push({
          position: [ev.lng, ev.lat, timeToElevation(ev.timestamp, timeMin, timeMax)],
          color,
          name,
        });
      }

      // Current-time marker
      const closest = findClosestEvent(track.events, currentTime);
      if (closest) {
        currentData.push({
          position: [closest.lng, closest.lat, timeToElevation(closest.timestamp, timeMin, timeMax)],
          color: [255, 255, 255, 255],
          name,
        });
      }
    }

    const layers = [];

    if (pathData.length > 0) {
      layers.push(
        new PathLayer({
          id: 'spacetime-paths',
          data: pathData,
          getPath: (d: (typeof pathData)[0]) => d.path,
          getColor: (d: (typeof pathData)[0]) => d.color,
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
          getPosition: (d: (typeof pointData)[0]) => d.position,
          getFillColor: (d: (typeof pointData)[0]) => d.color,
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
          getPosition: (d: (typeof currentData)[0]) => d.position,
          getFillColor: (d: (typeof currentData)[0]) => d.color,
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

    setGroup('spacetime', layers);
  }, [tracks, entities, timeRange, currentTime, setGroup]);
}
