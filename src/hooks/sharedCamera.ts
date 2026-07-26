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

export function setSharedCamera(c: Partial<SharedCamera>) {
  if (c.longitude !== undefined) state.longitude = c.longitude;
  if (c.latitude !== undefined) state.latitude = c.latitude;
  if (c.zoom !== undefined) state.zoom = c.zoom;
  if (c.pitch !== undefined) state.pitch = c.pitch;
  if (c.bearing !== undefined) state.bearing = c.bearing;

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
