/**
 * Drawing one ptolemy branch as a map layer, at its head or at a past moment.
 * The Scenario panel draws two of these side by side and the chat draws one.
 */

import {
  branchFeatureCollection,
  branchLayerId,
  fetchBranchFeatures,
  fetchBranchFeaturesAt,
} from '../../lib/branchFeatures';
import { addGeoJsonLayer } from '../../lib/mapLayers';
import type { LayerOptions } from '../../plugins/sdk';

export const BRANCH_STYLE: LayerOptions = {
  color: '#4dabf7',
  opacity: 0.4,
  lineWidth: 2,
  filled: true,
  stroked: true,
};

/** The second branch of a comparison, so the two sides read apart. */
export const SCENARIO_BRANCH_STYLE: LayerOptions = { ...BRANCH_STYLE, color: '#f06595' };

/**
 * Draw a branch's features as a layer, at the RFC 3339 moment or at the head
 * when `at` is null. Answers how many features it drew.
 */
export async function drawBranchLayer(
  branchId: string,
  at: string | null,
  style: LayerOptions = BRANCH_STYLE,
): Promise<number> {
  const features = at
    ? await fetchBranchFeaturesAt(branchId, at)
    : await fetchBranchFeatures(branchId);
  const collection = branchFeatureCollection(features);
  addGeoJsonLayer(branchLayerId(branchId), collection, style);
  return collection.features.length;
}
