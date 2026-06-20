import { useState } from 'react';
import { TextInput, ActionIcon, Loader } from '@mantine/core';
import { IconPlaneTilt } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useSpaceTimeStore } from '../features/spacetime/store';

/**
 * Always-visible "Fly to place…" box (restores the vanilla map-search box).
 * Accepts a place name (geocoded via Nominatim) or raw "lat, lng" coordinates,
 * and flies the active renderer there via the shared flyTo pipeline.
 */
export function FlyToSearch() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const flyTo = useSpaceTimeStore((s) => s.flyTo);

  const go = async () => {
    const q = query.trim();
    if (!q) return;

    // Direct "lat, lng" (or "lat lng") coordinates.
    const m = q.match(/^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/);
    if (m) {
      const lat = parseFloat(m[1]);
      const lng = parseFloat(m[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
        flyTo(lng, lat, 12);
        return;
      }
    }

    // Otherwise geocode the place name (top result).
    setLoading(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`,
        { headers: { 'Accept-Language': 'en' } },
      );
      const data = await res.json();
      if (data.length > 0) {
        flyTo(parseFloat(data[0].lon), parseFloat(data[0].lat), 12);
      } else {
        notifications.show({ title: 'Not found', message: `No place matching “${q}”`, color: 'yellow' });
      }
    } catch {
      notifications.show({ title: 'Geocoding failed', message: 'Could not reach the geocoder.', color: 'red' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <TextInput
      size="xs"
      w={180}
      aria-label="Fly to place"
      placeholder="Fly to place…"
      value={query}
      onChange={(e) => setQuery(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          go();
        }
      }}
      rightSection={
        loading ? (
          <Loader size={12} color="violet" />
        ) : (
          <ActionIcon size="sm" variant="subtle" color="gray" aria-label="Fly to" onClick={go}>
            <IconPlaneTilt size={14} />
          </ActionIcon>
        )
      }
      styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
    />
  );
}
