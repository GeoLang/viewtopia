/**
 * Where the sun is and how the globe shadows under it. The Shadows panel and
 * the chat both set the same Cesium lighting, shadow map and clock state.
 */

import { JulianDate } from 'cesium';

/** Pixels a side of the shadow map, when nobody has picked one. */
export const DEFAULT_SHADOW_MAP_SIZE = 2048;
export const DEFAULT_SHADOW_DARKNESS = 0.3;
export const MIN_SHADOW_DARKNESS = 0;
export const MAX_SHADOW_DARKNESS = 1;
export const MIN_HOUR = 0;
export const MAX_HOUR = 24;
/** Midday, the hour a shadow study starts from. */
export const NOON_HOUR = 12;

const MINUTES_PER_HOUR = 60;
const FIRST_MONTH = 1;
const FIRST_DAY_OF_MONTH = 1;

export interface SunSettings {
  enabled: boolean;
  /** yyyy-mm-dd, read as a local date */
  date: string;
  /** hour of the local day, fractional */
  hour: number;
  darkness: number;
  softShadows: boolean;
  shadowMapSize: number;
}

/** As much of a Cesium viewer as the sun and its shadows are set on. */
export interface ShadowViewer {
  shadows: boolean;
  shadowMap: { darkness: number; softShadows: boolean; size: number };
  clock: { shouldAnimate: boolean; currentTime: JulianDate };
  scene: { globe: { enableLighting: boolean } };
}

function hourAndMinute(hour: number): { hour: number; minute: number } {
  return {
    hour: Math.floor(hour),
    minute: Math.round((hour % 1) * MINUTES_PER_HOUR),
  };
}

/** The clock time a yyyy-mm-dd date at a fractional local hour stands for. */
export function sunTime(date: string, hour: number): JulianDate {
  const [year, month, day] = date.split('-').map(Number);
  const time = hourAndMinute(hour);
  return JulianDate.fromDate(
    new Date(year, (month || FIRST_MONTH) - 1, day || FIRST_DAY_OF_MONTH, time.hour, time.minute),
  );
}

/** The hour as a clock reads it: 13.5 is 13:30. */
export function formatTimeOfDay(hour: number): string {
  const time = hourAndMinute(hour);
  return `${time.hour}:${String(time.minute).padStart(2, '0')}`;
}

export function applySunAndShadows(viewer: ShadowViewer, settings: SunSettings): void {
  viewer.shadows = settings.enabled;
  viewer.scene.globe.enableLighting = settings.enabled;
  viewer.shadowMap.darkness = settings.darkness;
  viewer.shadowMap.softShadows = settings.softShadows;
  viewer.shadowMap.size = settings.shadowMapSize;
  viewer.clock.shouldAnimate = false;
  viewer.clock.currentTime = sunTime(settings.date, settings.hour);
}
