/**
 * Shared open-meteo helpers for the Weather and Wind panels: fetch
 * current/hourly weather at a point, and sample a grid of current values
 * across the view. The view bounds those panels import from here now come from
 * lib/viewBounds. open-meteo is a free no-key API (same precedent as
 * open-elevation).
 */
export { getViewBounds, type ViewBounds } from './viewBounds';
import type { ViewBounds } from './viewBounds';

const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';

export interface CurrentWeather {
  temperature: number; // °C
  windSpeed: number; // km/h
  windDirection: number; // degrees
  precipitation: number; // mm
  cloudCover: number; // %
  humidity: number; // %
  weatherCode: number;
}

export interface HourlyPoint {
  time: string;
  temperature: number;
  precipitation: number;
}

export interface GridSample {
  lng: number;
  lat: number;
  temperature: number;
  precipitation: number;
  windSpeed: number;
  windDirection: number;
}

// wmo weather code to a compact icon + label, coarse buckets are enough for a readout
export function weatherCodeInfo(code: number): { icon: string; text: string } {
  if (code === 0) return { icon: '☀', text: 'Clear' };
  if (code <= 2) return { icon: '🌤', text: 'Partly cloudy' };
  if (code === 3) return { icon: '☁', text: 'Overcast' };
  if (code <= 48) return { icon: '🌫', text: 'Fog' };
  if (code <= 57) return { icon: '🌦', text: 'Drizzle' };
  if (code <= 67) return { icon: '🌧', text: 'Rain' };
  if (code <= 77) return { icon: '❄', text: 'Snow' };
  if (code <= 82) return { icon: '🌧', text: 'Rain showers' };
  if (code <= 86) return { icon: '❄', text: 'Snow showers' };
  return { icon: '⛈', text: 'Thunderstorm' };
}

/** Grid of cell-center coordinates across bounds, n per side. */
export function gridCenters(bounds: ViewBounds, n: number): [number, number][] {
  const out: [number, number][] = [];
  const dx = (bounds.east - bounds.west) / n;
  const dy = (bounds.north - bounds.south) / n;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      out.push([bounds.west + dx * (i + 0.5), bounds.south + dy * (j + 0.5)]);
    }
  }
  return out;
}

/** Square polygon ring around a cell center, half-width in degrees. */
export function cellPolygon(lng: number, lat: number, hx: number, hy: number): [number, number][] {
  return [
    [lng - hx, lat - hy],
    [lng + hx, lat - hy],
    [lng + hx, lat + hy],
    [lng - hx, lat + hy],
    [lng - hx, lat - hy],
  ];
}

export async function fetchCurrentWeather(
  lat: number,
  lng: number,
): Promise<{ current: CurrentWeather; hourly: HourlyPoint[] }> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    current:
      'temperature_2m,relative_humidity_2m,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m',
    hourly: 'temperature_2m,precipitation',
    forecast_days: '1',
  });
  const resp = await fetch(`${OPEN_METEO}?${params}`, { signal: AbortSignal.timeout(10000) });
  if (!resp.ok) throw new Error(`open-meteo ${resp.status}`);
  const data = await resp.json();
  const c = data.current;
  const current: CurrentWeather = {
    temperature: c.temperature_2m,
    windSpeed: c.wind_speed_10m,
    windDirection: c.wind_direction_10m,
    precipitation: c.precipitation,
    cloudCover: c.cloud_cover,
    humidity: c.relative_humidity_2m,
    weatherCode: c.weather_code,
  };
  const times: string[] = data.hourly?.time ?? [];
  const temps: number[] = data.hourly?.temperature_2m ?? [];
  const precs: number[] = data.hourly?.precipitation ?? [];
  const hourly: HourlyPoint[] = times.map((t, i) => ({
    time: t,
    temperature: temps[i],
    precipitation: precs[i],
  }));
  return { current, hourly };
}

/** Sample current weather across a grid in one batched open-meteo request. */
export async function fetchWeatherGrid(bounds: ViewBounds, n: number): Promise<GridSample[]> {
  const centers = gridCenters(bounds, n);
  const params = new URLSearchParams({
    latitude: centers.map((c) => c[1].toFixed(4)).join(','),
    longitude: centers.map((c) => c[0].toFixed(4)).join(','),
    current: 'temperature_2m,precipitation,wind_speed_10m,wind_direction_10m',
  });
  const resp = await fetch(`${OPEN_METEO}?${params}`, { signal: AbortSignal.timeout(12000) });
  if (!resp.ok) throw new Error(`open-meteo ${resp.status}`);
  const data = await resp.json();
  const list = Array.isArray(data) ? data : [data];
  return list.map((item, i) => ({
    lng: centers[i][0],
    lat: centers[i][1],
    temperature: item.current.temperature_2m,
    precipitation: item.current.precipitation,
    windSpeed: item.current.wind_speed_10m,
    windDirection: item.current.wind_direction_10m,
  }));
}

/** Blue-to-red ramp for temperature in a typical -10..40 °C band. */
export function tempColor(t: number): [number, number, number] {
  const f = Math.max(0, Math.min(1, (t + 10) / 50));
  return [Math.round(255 * f), Math.round(80 + 60 * (1 - Math.abs(f - 0.5) * 2)), Math.round(255 * (1 - f))];
}

/** White-to-blue ramp for precipitation in mm. */
export function precipColor(p: number): [number, number, number] {
  const f = Math.max(0, Math.min(1, p / 10));
  return [Math.round(220 * (1 - f)), Math.round(230 * (1 - f * 0.4)), 255];
}

/** Green-yellow-red ramp for wind speed in km/h. */
export function windColor(speed: number): [number, number, number] {
  const f = Math.max(0, Math.min(1, speed / 60));
  return [Math.round(255 * Math.min(1, f * 2)), Math.round(200 * (1 - Math.max(0, f - 0.5) * 2)), 60];
}
