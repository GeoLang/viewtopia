import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Cartesian3,
  Cartographic,
  CatmullRomSpline,
  LinearSpline,
  Math as CesiumMath,
} from 'cesium';
import type { Viewer } from 'cesium';

export interface PathPoint {
  longitude: number;
  latitude: number;
  height: number;
}

export interface FlightPlan {
  waypoints: PathPoint[];
  // metres per second along the path
  speed: number;
  smooth?: boolean;
}

export interface CameraPath {
  play(): void;
  pause(): void;
  stop(): void;
}

const EARTH_RADIUS = 6371000;
// two waypoints this close make a zero-length spline segment, which divides by zero
const MIN_SEGMENT = 1;
// fraction of the path used to look ahead for the camera heading
const LOOKAHEAD = 0.01;

function haversine(latA: number, lonA: number, latB: number, lonB: number): number {
  const h =
    Math.sin((latB - latA) / 2) ** 2 +
    Math.cos(latA) * Math.cos(latB) * Math.sin((lonB - lonA) / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(h)));
}

function segmentLength(a: PathPoint, b: PathPoint): number {
  const ground = haversine(
    CesiumMath.toRadians(a.latitude),
    CesiumMath.toRadians(a.longitude),
    CesiumMath.toRadians(b.latitude),
    CesiumMath.toRadians(b.longitude),
  );
  return Math.hypot(ground, b.height - a.height);
}

export function pathLength(waypoints: PathPoint[]): number {
  let total = 0;
  for (let i = 1; i < waypoints.length; i += 1) total += segmentLength(waypoints[i - 1], waypoints[i]);
  return total;
}

export function flightDuration(plan: FlightPlan): number {
  return Math.max(pathLength(plan.waypoints) / Math.max(plan.speed, 0.1), 1) * 1000;
}

function withoutRepeats(waypoints: PathPoint[]): PathPoint[] {
  const kept: PathPoint[] = [];
  for (const w of waypoints) {
    const last = kept.at(-1);
    if (!last || segmentLength(last, w) > MIN_SEGMENT) kept.push(w);
  }
  return kept;
}

function headingBetween(from: Cartographic, to: Cartographic): number {
  const dLon = to.longitude - from.longitude;
  const y = Math.sin(dLon) * Math.cos(to.latitude);
  const x =
    Math.cos(from.latitude) * Math.sin(to.latitude) -
    Math.sin(from.latitude) * Math.cos(to.latitude) * Math.cos(dLon);
  return Math.atan2(y, x);
}

interface PositionSpline {
  evaluate(time: number): Cartesian3;
}

export interface CameraPathOptions extends FlightPlan {
  durationMs: number;
  onProgress?: (fraction: number) => void;
  onDone?: () => void;
}

/**
 * Drives the Cesium camera along a spline through the waypoints. Returns null
 * when the waypoints do not describe a path the camera can fly.
 */
export function createCameraPath(viewer: Viewer, options: CameraPathOptions): CameraPath | null {
  const points = withoutRepeats(options.waypoints);
  const total = pathLength(points);
  if (points.length < 2 || total === 0) return null;

  // arc-length parametrisation, so unevenly spaced waypoints still fly at one speed
  const times = [0];
  let run = 0;
  for (let i = 1; i < points.length; i += 1) {
    run += segmentLength(points[i - 1], points[i]);
    times.push(run / total);
  }
  const cartesians = points.map((p) => Cartesian3.fromDegrees(p.longitude, p.latitude, p.height));
  // catmull-rom lerps internally below three control points, so two waypoints need no special case
  const spline: PositionSpline =
    options.smooth === false
      ? // LinearSpline also takes scalar points, so its evaluate is typed wider than ours can be
        (new LinearSpline({ times, points: cartesians }) as PositionSpline)
      : new CatmullRomSpline({ times, points: cartesians });

  const duration = Math.max(options.durationMs, 250);
  const controller = viewer.scene.screenSpaceCameraController;
  let elapsed = 0;
  let startedAt = 0;
  let frame = 0;

  const apply = (fraction: number) => {
    const base = Math.min(fraction, 1 - LOOKAHEAD);
    const from = Cartographic.fromCartesian(spline.evaluate(base));
    const to = Cartographic.fromCartesian(spline.evaluate(base + LOOKAHEAD));
    const ground = haversine(from.latitude, from.longitude, to.latitude, to.longitude);
    viewer.camera.setView({
      destination: spline.evaluate(fraction),
      orientation: {
        heading: headingBetween(from, to),
        pitch: Math.atan2(to.height - from.height, ground),
        roll: 0,
      },
    });
  };

  const release = () => {
    if (!viewer.isDestroyed()) controller.enableInputs = true;
  };

  const step = (now: number) => {
    if (viewer.isDestroyed()) {
      frame = 0;
      return;
    }
    const fraction = Math.min((elapsed + now - startedAt) / duration, 1);
    apply(fraction);
    options.onProgress?.(fraction);
    if (fraction >= 1) {
      frame = 0;
      elapsed = 0;
      release();
      options.onDone?.();
      return;
    }
    frame = requestAnimationFrame(step);
  };

  return {
    play() {
      if (frame || viewer.isDestroyed()) return;
      // the flight owns the camera while it runs, otherwise a drag fights every frame
      controller.enableInputs = false;
      startedAt = performance.now();
      frame = requestAnimationFrame(step);
    },
    pause() {
      if (!frame) return;
      cancelAnimationFrame(frame);
      frame = 0;
      elapsed += performance.now() - startedAt;
      release();
    },
    stop() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      elapsed = 0;
      release();
      options.onProgress?.(0);
    },
  };
}

/**
 * Playback state for a panel: builds a path on the first play, resumes on the
 * next, and rebuilds whenever the plan changes. Escape stops the flight.
 */
export function useCameraFlight(viewer: Viewer | null) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const current = useRef<{ key: string; path: CameraPath } | null>(null);

  const stop = useCallback(() => {
    current.current?.path.stop();
    current.current = null;
    setPlaying(false);
    setProgress(0);
  }, []);

  const pause = useCallback(() => {
    current.current?.path.pause();
    setPlaying(false);
  }, []);

  const play = useCallback(
    (plan: FlightPlan) => {
      if (!viewer) return;
      const key = JSON.stringify(plan);
      if (current.current && current.current.key !== key) {
        current.current.path.stop();
        current.current = null;
      }
      if (!current.current) {
        const path = createCameraPath(viewer, {
          ...plan,
          durationMs: flightDuration(plan),
          onProgress: (fraction) =>
            // a repaint per frame is wasted work, one per percent is not
            setProgress((prev) =>
              fraction === 0 || fraction === 1 || Math.abs(prev - fraction) >= 0.01 ? fraction : prev,
            ),
          onDone: () => {
            current.current = null;
            setPlaying(false);
          },
        });
        if (!path) return;
        current.current = { key, path };
      }
      current.current.path.play();
      setPlaying(true);
    },
    [viewer],
  );

  useEffect(() => () => current.current?.path.stop(), []);

  useEffect(() => {
    if (!playing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') stop();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playing, stop]);

  return { playing, progress, play, pause, stop };
}
