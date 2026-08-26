/**
 * Travel-time bands around one point: itinera draws each band, and the whole
 * set goes on the map as one layer. The Travel Time panel and the chat both
 * call it.
 */

import {
  serviceArea,
  serviceAreaCollection,
  type ServiceArea,
  type TravelPoint,
  type TravelProfile,
} from '../../lib/travelTime';
import { useAgentLayerStore } from '../../store/agentLayers';

export const SERVICE_AREA_LAYER_ID = 'travel-time-service-area';
/** The bands drawn when nobody has said which. */
export const DEFAULT_BAND_MINUTES = '5, 10, 15';

export const SECONDS_PER_MINUTE = 60;

const SERVICE_AREA_COLOR = '#4dabf7';

export interface DrawnServiceAreas {
  areas: ServiceArea[];
  /** what to say about the bands that did not draw, null when they all did */
  failure: string | null;
}

function message(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

/** Minutes from a written list, each one once and smallest first. */
export function parseBandMinutes(text: string): number[] {
  const parsed = text
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((value) => Number.isFinite(value) && value > 0);
  return [...new Set(parsed)].sort((a, b) => a - b);
}

/**
 * Draw one polygon per band around `centre`. A band itinera refuses is left
 * out rather than failing the rest, and the layer is taken off the map when
 * none of them came back.
 */
export async function drawServiceAreaBands(
  centre: TravelPoint,
  bandMinutes: number[],
  profile: TravelProfile,
): Promise<DrawnServiceAreas> {
  const settled = await Promise.allSettled(
    bandMinutes.map((minutes) => serviceArea(centre, minutes * SECONDS_PER_MINUTE, profile)),
  );
  const areas = settled.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
  const failures = settled.flatMap((result) =>
    result.status === 'rejected' ? [message(result.reason)] : [],
  );
  const store = useAgentLayerStore.getState();

  if (areas.length === 0) {
    store.removeLayer(SERVICE_AREA_LAYER_ID);
    return { areas, failure: failures[0] ?? 'no service area came back' };
  }
  store.addLayer({
    id: SERVICE_AREA_LAYER_ID,
    name: `Service area (${profile})`,
    color: SERVICE_AREA_COLOR,
    geojson: serviceAreaCollection(areas),
  });
  return {
    areas,
    failure:
      failures.length > 0 ? `${failures.length} of ${settled.length} bands: ${failures[0]}` : null,
  };
}
