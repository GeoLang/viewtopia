/**
 * One longitude and latitude rule for every action that takes a point, so the
 * reading back and the refusal are worded the same wherever they come from.
 */

import { ActionError } from './registry';

const MAX_LONGITUDE = 180;
const MAX_LATITUDE = 90;
/** enough to place a point on a street, short enough to read back */
const COORDINATE_DECIMALS = 4;

export function place(longitude: number, latitude: number): string {
  return `${longitude.toFixed(COORDINATE_DECIMALS)}, ${latitude.toFixed(COORDINATE_DECIMALS)}`;
}

export function checkOnTheGlobe(longitude: number, latitude: number): [number, number] {
  if (Math.abs(longitude) > MAX_LONGITUDE || Math.abs(latitude) > MAX_LATITUDE) {
    throw new ActionError(`${place(longitude, latitude)} is not a longitude and latitude`);
  }
  return [longitude, latitude];
}
