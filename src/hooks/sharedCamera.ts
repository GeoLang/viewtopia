/**
 * Shared camera state so all renderers stay in sync when switching.
 * The active renderer writes to this on every move; a newly-shown
 * renderer reads from it on initialisation.
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

export function getSharedCamera(): SharedCamera {
  return { ...state };
}

export function setSharedCamera(c: Partial<SharedCamera>) {
  if (c.longitude !== undefined) state.longitude = c.longitude;
  if (c.latitude !== undefined) state.latitude = c.latitude;
  if (c.zoom !== undefined) state.zoom = c.zoom;
  if (c.pitch !== undefined) state.pitch = c.pitch;
  if (c.bearing !== undefined) state.bearing = c.bearing;
}
