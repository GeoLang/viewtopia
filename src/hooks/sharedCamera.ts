/**
 * Shared camera state so all renderers stay in sync when switching.
 * The active renderer writes to this on every move; a newly-shown
 * renderer reads from it on initialisation.
 *
 * Split view also uses it as the sync hub: each pane subscribes and applies
 * moves the other pane published. Listeners move a camera, which writes back
 * here, so notification is not re-entrant: a write made while listeners run
 * updates the state without starting another round.
 */

export interface SharedCamera {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
}

const state: SharedCamera = {
  longitude: 0,
  latitude: 20,
  zoom: 2,
  pitch: 0,
  bearing: 0,
};

const listeners = new Set<(c: SharedCamera) => void>();

/** true while listeners run, so a camera they move cannot start another round */
let notifying = false;

export function getSharedCamera(): SharedCamera {
  return { ...state };
}

export function sameSharedCamera(a: SharedCamera, b: SharedCamera): boolean {
  return (
    Math.abs(a.longitude - b.longitude) < 1e-6 &&
    Math.abs(a.latitude - b.latitude) < 1e-6 &&
    Math.abs(a.zoom - b.zoom) < 1e-4 &&
    Math.abs(a.pitch - b.pitch) < 1e-3 &&
    Math.abs(a.bearing - b.bearing) < 1e-3
  );
}

export function setSharedCamera(c: Partial<SharedCamera>) {
  const next: SharedCamera = {
    longitude: c.longitude !== undefined ? c.longitude : state.longitude,
    latitude: c.latitude !== undefined ? c.latitude : state.latitude,
    zoom: c.zoom !== undefined ? c.zoom : state.zoom,
    pitch: c.pitch !== undefined ? c.pitch : state.pitch,
    bearing: c.bearing !== undefined ? c.bearing : state.bearing,
  };
  // resize fires move without the center changing
  if (sameSharedCamera(state, next)) return;

  state.longitude = next.longitude;
  state.latitude = next.latitude;
  state.zoom = next.zoom;
  state.pitch = next.pitch;
  state.bearing = next.bearing;

  if (notifying || listeners.size === 0) return;
  notifying = true;
  const snapshot = { ...state };
  try {
    for (const fn of listeners) fn(snapshot);
  } finally {
    notifying = false;
  }
}

export function subscribeSharedCamera(fn: (c: SharedCamera) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
