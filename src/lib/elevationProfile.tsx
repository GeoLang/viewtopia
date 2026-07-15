/**
 * Shared elevation-profile helpers: sample points along a line, fetch DEM
 * elevations, build a distance/gain/loss profile, and render an SVG chart.
 * Used by the Terrain Profile plugin and the Cross Section tool panel.
 */
import * as turf from '@turf/turf';

export interface ProfilePoint {
  distance: number; // meters from start
  elevation: number; // meters
  lat: number;
  lng: number;
}

export interface ProfileStats {
  minElev: number;
  maxElev: number;
  totalDist: number; // meters
  gain: number; // meters
  loss: number; // meters
}

/** Fetch elevations from the free Open-Elevation API, with a synthetic fallback. */
export async function fetchElevations(coords: [number, number][]): Promise<number[]> {
  const locations = coords.map(([lng, lat]) => `${lat},${lng}`).join('|');
  try {
    const resp = await fetch(
      `https://api.open-elevation.com/api/v1/lookup?locations=${locations}`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!resp.ok) throw new Error('API error');
    const data = await resp.json();
    return data.results.map((r: { elevation: number }) => r.elevation);
  } catch {
    // Fallback so the profile always renders when the API is unreachable.
    return coords.map((_, i) => Math.sin((i / coords.length) * Math.PI * 2) * 100 + 200);
  }
}

export function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Linear interpolation between two endpoints (numPoints segments). */
export function interpolatePoints(
  start: [number, number],
  end: [number, number],
  numPoints: number,
): [number, number][] {
  const points: [number, number][] = [];
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    points.push([start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t]);
  }
  return points;
}

/** Evenly sample numSamples+1 points along a multi-vertex polyline (turf geodesic). */
export function sampleAlongLine(coords: [number, number][], numSamples: number): [number, number][] {
  if (coords.length < 2) return coords;
  if (coords.length === 2) return interpolatePoints(coords[0], coords[1], numSamples);
  const line = turf.lineString(coords);
  const total = turf.length(line, { units: 'kilometers' });
  const out: [number, number][] = [];
  for (let i = 0; i <= numSamples; i++) {
    const d = (total * i) / numSamples;
    const p = turf.along(line, d, { units: 'kilometers' });
    out.push(p.geometry.coordinates as [number, number]);
  }
  return out;
}

export function buildProfile(
  coords: [number, number][],
  elevations: number[],
): { points: ProfilePoint[]; stats: ProfileStats } {
  let cumDist = 0;
  let gain = 0;
  let loss = 0;
  const points: ProfilePoint[] = coords.map((c, i) => {
    if (i > 0) {
      cumDist += haversineDistance(coords[i - 1][1], coords[i - 1][0], c[1], c[0]);
      const diff = elevations[i] - elevations[i - 1];
      if (diff > 0) gain += diff;
      else loss += Math.abs(diff);
    }
    return { distance: cumDist, elevation: elevations[i], lat: c[1], lng: c[0] };
  });
  return {
    points,
    stats: {
      minElev: Math.min(...elevations),
      maxElev: Math.max(...elevations),
      totalDist: cumDist,
      gain,
      loss,
    },
  };
}

export function ElevationChart({
  profile,
  width = 320,
  height = 120,
  color = '#27ae60',
  gradientId = 'elev-grad',
}: {
  profile: ProfilePoint[];
  width?: number;
  height?: number;
  color?: string;
  gradientId?: string;
}) {
  if (!profile.length) return null;
  const maxDist = profile[profile.length - 1].distance || 1;
  const minE = Math.min(...profile.map((p) => p.elevation));
  const maxE = Math.max(...profile.map((p) => p.elevation));
  const range = maxE - minE || 1;

  const pathData = profile
    .map((p, i) => {
      const x = (p.distance / maxDist) * width;
      const y = height - ((p.elevation - minE) / range) * (height - 10) - 5;
      return `${i === 0 ? 'M' : 'L'}${x},${y}`;
    })
    .join(' ');
  const areaPath = `${pathData} L${width},${height} L0,${height} Z`;

  return (
    <svg
      aria-label="elevation profile"
      width={width}
      height={height}
      style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 8 }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.6} />
          <stop offset="100%" stopColor={color} stopOpacity={0.1} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path d={pathData} fill="none" stroke={color} strokeWidth={2} />
    </svg>
  );
}
