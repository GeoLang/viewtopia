/**
 * One rule for every action that only works on the Cesium globe, so the refusal
 * names the renderer to switch to wherever it comes from.
 */

import type { Viewer } from 'cesium';
import { getActiveCesiumViewer } from '../viewer/registry';
import { ActionError } from './registry';

export const NO_CESIUM_GLOBE =
  'there is no Cesium globe on screen, so set the renderer to cesium first';

export function cesiumViewer(): Viewer {
  const viewer = getActiveCesiumViewer();
  if (!viewer) {
    throw new ActionError(NO_CESIUM_GLOBE);
  }
  return viewer;
}
