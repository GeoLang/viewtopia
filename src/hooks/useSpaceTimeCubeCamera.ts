import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import type maplibregl from 'maplibre-gl';
import { useSpaceTimeStore } from '../features/spacetime/store';

/** Pitch cube view tilts to, so the time axis reads as height. */
export const CUBE_VIEW_PITCH = 60;

const CUBE_CAMERA_EASE_MS = 600;

/**
 * Tilts the MapLibre camera while cube view is on and puts the pitch back when
 * it goes off. Bearing is left alone, so a rotation made inside cube view survives.
 */
export function useSpaceTimeCubeCamera(mapRef: MutableRefObject<maplibregl.Map | null>) {
  const cubeView = useSpaceTimeStore((s) => s.cubeView);
  const pitchBeforeCube = useRef<number | null>(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (cubeView) {
      pitchBeforeCube.current = map.getPitch();
      map.easeTo({ pitch: CUBE_VIEW_PITCH, duration: CUBE_CAMERA_EASE_MS });
      return;
    }

    const previousPitch = pitchBeforeCube.current;
    if (previousPitch === null) return;
    pitchBeforeCube.current = null;
    map.easeTo({ pitch: previousPitch, duration: CUBE_CAMERA_EASE_MS });
  }, [cubeView, mapRef]);
}
