import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import {
  type Viewer,
  Cartesian3,
  Cartesian2,
  Color,
  PolylineDashMaterialProperty,
  VerticalOrigin,
  LabelStyle,
} from 'cesium';
import { useSpaceTimeStore } from '../features/spacetime/store';
import { useAppStore } from '../store/app';

function cssToColor(hex: string): Color {
  try {
    return Color.fromCssColorString(hex);
  } catch {
    return Color.fromCssColorString('#a78bfa');
  }
}

function timeToElevation(
  timestamp: number,
  timeMin: number,
  timeMax: number,
  elevationScale: number,
): number {
  if (timeMax === timeMin) return 0;
  return ((timestamp - timeMin) / (timeMax - timeMin)) * elevationScale;
}

function findClosestEvent(
  events: { timestamp: number; lat: number; lng: number }[],
  target: number,
): { lat: number; lng: number; timestamp: number } | null {
  if (events.length === 0) return null;
  let lo = 0;
  let hi = events.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (events[mid].timestamp < target) lo = mid + 1;
    else hi = mid;
  }
  if (
    lo > 0 &&
    Math.abs(events[lo - 1].timestamp - target) <
      Math.abs(events[lo].timestamp - target)
  ) {
    return events[lo - 1];
  }
  return events[lo];
}

const ELEVATION_SCALE = 50000;

export function useSpaceTimeCesium(
  viewerRef: MutableRefObject<Viewer | null>,
) {
  const tracks = useSpaceTimeStore((s) => s.tracks);
  const entities = useSpaceTimeStore((s) => s.entities);
  const timeRange = useSpaceTimeStore((s) => s.timeRange);
  const currentTime = useSpaceTimeStore((s) => s.currentTime);
  const staticIdsRef = useRef<string[]>([]);
  const markerIdsRef = useRef<string[]>([]);
  // A renderer switch rebuilds the viewer, so redraw onto the new one — the old
  // entities were destroyed with it.
  const renderer = useAppStore((s) => s.renderer);
  const activeTab = useAppStore((s) => s.activeTab);

  // Static geometry: track polylines, drop lines, event dots
  // Only rebuild when tracks/entities/timeRange change
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    for (const eid of staticIdsRef.current) {
      const e = viewer.entities.getById(eid);
      if (e) viewer.entities.remove(e);
    }
    staticIdsRef.current = [];

    // Also clean up dynamic markers when tracks change
    for (const eid of markerIdsRef.current) {
      const e = viewer.entities.getById(eid);
      if (e) viewer.entities.remove(e);
    }
    markerIdsRef.current = [];

    if (tracks.length === 0) return;

    const { min: timeMin, max: timeMax } = timeRange;

    for (const track of tracks) {
      if (track.events.length < 1) continue;
      const entity = entities.get(track.entityId);
      const color = cssToColor(entity?.color ?? '#a78bfa');
      const name = entity?.name ?? track.entityId;

      if (track.events.length >= 2) {
        const positions = track.events.map((e) =>
          Cartesian3.fromDegrees(
            e.lng,
            e.lat,
            timeToElevation(e.timestamp, timeMin, timeMax, ELEVATION_SCALE),
          ),
        );
        const lineId = `st-line-${track.id}`;
        viewer.entities.add({
          id: lineId,
          name,
          polyline: {
            positions,
            width: 3,
            material: color.withAlpha(0.8),
          },
        });
        staticIdsRef.current.push(lineId);

        for (let i = 0; i < track.events.length; i++) {
          const ev = track.events[i];
          const elev = timeToElevation(ev.timestamp, timeMin, timeMax, ELEVATION_SCALE);
          const dropId = `st-drop-${track.id}-${i}`;
          viewer.entities.add({
            id: dropId,
            polyline: {
              positions: [
                Cartesian3.fromDegrees(ev.lng, ev.lat, 0),
                Cartesian3.fromDegrees(ev.lng, ev.lat, elev),
              ],
              width: 1,
              material: new PolylineDashMaterialProperty({
                color: color.withAlpha(0.3),
                dashLength: 8,
              }),
            },
          });
          staticIdsRef.current.push(dropId);
        }
      }

      for (let i = 0; i < track.events.length; i++) {
        const ev = track.events[i];
        const elev = timeToElevation(ev.timestamp, timeMin, timeMax, ELEVATION_SCALE);
        const ptId = `st-pt-${track.id}-${i}`;
        viewer.entities.add({
          id: ptId,
          name: `${name} @ ${new Date(ev.timestamp).toISOString()}`,
          position: Cartesian3.fromDegrees(ev.lng, ev.lat, elev),
          point: {
            pixelSize: 5,
            color,
            outlineColor: Color.WHITE,
            outlineWidth: 1,
          },
        });
        staticIdsRef.current.push(ptId);
      }
    }
  }, [tracks, entities, timeRange, viewerRef, renderer, activeTab]);

  // Dynamic markers: update position when currentTime changes
  // Uses direct Cesium entity position updates to avoid React overhead
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    if (tracks.length === 0) return;

    const { min: timeMin, max: timeMax } = timeRange;

    // Create markers once if they don't exist, then update positions
    for (const track of tracks) {
      if (track.events.length < 1) continue;
      const entity = entities.get(track.entityId);
      const color = cssToColor(entity?.color ?? '#a78bfa');
      const name = entity?.name ?? track.entityId;

      const closest = findClosestEvent(track.events, currentTime);
      if (!closest) continue;

      const elev = timeToElevation(closest.timestamp, timeMin, timeMax, ELEVATION_SCALE);
      const newPos = Cartesian3.fromDegrees(closest.lng, closest.lat, elev);
      const markerId = `st-marker-${track.id}`;

      const existing = viewer.entities.getById(markerId);
      if (existing) {
        // Just update position — much cheaper than remove/add
        (existing.position as any).setValue(newPos);
      } else {
        viewer.entities.add({
          id: markerId,
          name: `${name} (current)`,
          position: newPos as any,
          point: {
            pixelSize: 12,
            color: Color.WHITE,
            outlineColor: color,
            outlineWidth: 3,
          },
          label: {
            text: name,
            font: '12px sans-serif',
            fillColor: Color.WHITE,
            outlineColor: Color.BLACK,
            outlineWidth: 2,
            style: LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: VerticalOrigin.BOTTOM,
            pixelOffset: new Cartesian2(0, -16),
          },
        });
        markerIdsRef.current.push(markerId);
      }
    }
  }, [currentTime, tracks, entities, timeRange, viewerRef, renderer, activeTab]);
}
