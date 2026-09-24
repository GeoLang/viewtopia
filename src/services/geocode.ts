import { offlineFetch } from '../offline/cache';

export interface GeoHit {
  lat: number;
  lng: number;
  label: string;
  type: string;
}

interface GeokodeAddress {
  house_number: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  country: string | null;
  full: string | null;
}

type GeokodeKind = 'address' | 'place' | 'street' | 'poi' | 'boundary';

interface GeokodeResult {
  name: string | null;
  display_name: string;
  address: GeokodeAddress;
  country_code: string | null;
  lat: number;
  lon: number;
  bbox: [number, number, number, number] | null;
  kind: GeokodeKind;
  osm_type: 'node' | 'way' | 'relation' | null;
  osm_id: number | null;
  osm_key: string | null;
  osm_value: string | null;
  admin_level: number | null;
  population: number | null;
  confidence: number;
  match_type: 'exact' | 'prefix' | 'fuzzy';
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
  const res = await offlineFetch(`/api/geocode/forward?q=${encodeURIComponent(q)}&limit=${limit}`);
  if (!res.ok) return [];
  const data = (await res.json()) as { results?: GeokodeResult[] };
  return (data.results ?? [])
    .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon))
    .map((r) => ({
      lat: r.lat,
      lng: r.lon,
      label: r.display_name || geokodeLabel(r.address, q),
      type: r.kind,
    }));
}

export async function geocode(query: string, limit = 1): Promise<GeoHit[]> {
  const q = query.trim();
  if (!q) return [];
  try {
    return await geokodeForward(q, limit);
  } catch {
    return [];
  }
}
