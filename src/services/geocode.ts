/**
 * Forward geocoding service.
 *
 * Primary: the platform's own **geokode** service (same-origin via the nginx
 * proxy `/api/geocode/forward?q=`). geokode ships a small address dataset, so we
 * fall back to Nominatim (public OSM) for global place coverage when geokode
 * returns nothing or is unavailable. geokode goes through the offline cache, so
 * a query asked before still answers with no network. The Nominatim fallback
 * never can, so offline it raises rather than reporting an empty result.
 */
import { offlineFetch } from '../offline/cache';
import { requireOnline } from '../offline/network';

export interface GeoHit {
  lat: number;
  lng: number;
  label: string;
  type: string;
}

interface GeokodeAddress {
  house_number?: string | null;
  street?: string | null;
  city?: string | null;
  state?: string | null;
  full?: string;
}

interface GeokodeResult {
  address: GeokodeAddress;
  lat: number;
  lon: number;
  confidence: number;
}

function geokodeLabel(a: GeokodeAddress, fallback: string): string {
  if (a.full) return a.full;
  const parts = [
    [a.house_number, a.street].filter(Boolean).join(' '),
    a.city,
    a.state,
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : fallback;
}

async function geokodeForward(q: string, limit: number): Promise<GeoHit[]> {
  const res = await offlineFetch(`/api/geocode/forward?q=${encodeURIComponent(q)}`);
  if (!res.ok) return [];
  const data = (await res.json()) as { results?: GeokodeResult[] };
  return (data.results ?? [])
    .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon))
    .slice(0, limit)
    .map((r) => ({
      lat: r.lat,
      lng: r.lon,
      label: geokodeLabel(r.address, q),
      type: r.confidence >= 0.8 ? 'address' : 'approx',
    }));
}

async function nominatimForward(q: string, limit: number): Promise<GeoHit[]> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=${limit}`,
    { headers: { 'Accept-Language': 'en' } },
  );
  if (!res.ok) return [];
  const data = (await res.json()) as {
    lat: string;
    lon: string;
    display_name: string;
    type?: string;
  }[];
  return data.map((d) => ({
    lat: parseFloat(d.lat),
    lng: parseFloat(d.lon),
    label: d.display_name,
    type: d.type ?? 'place',
  }));
}

/** Geocode a place name, preferring geokode and falling back to Nominatim. */
export async function geocode(query: string, limit = 1): Promise<GeoHit[]> {
  const q = query.trim();
  if (!q) return [];
  try {
    const hits = await geokodeForward(q, limit);
    if (hits.length) return hits;
  } catch {
    /* geokode unavailable, fall through to Nominatim */
  }
  requireOnline('place search');
  try {
    return await nominatimForward(q, limit);
  } catch {
    return [];
  }
}
