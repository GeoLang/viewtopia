import { useEffect, useState } from 'react';
import {
  Text,
  Stack,
  Group,
  SegmentedControl,
  TextInput,
  Button,
  Badge,
  Loader,
} from '@mantine/core';
import { IconCar } from '@tabler/icons-react';
import type { FeatureCollection } from 'geojson';
import { PanelCard, PanelHeader } from '../PanelCard';
import { getActiveMapLibre } from '../../viewer/registry';
import { getViewBounds } from '../../lib/weatherData';
import { requireOnline } from '../../offline/network';

// online only: the bbox follows the view, so no two queries ask the same thing
const OVERPASS = 'https://overpass-api.de/api/interpreter';
const TILE_KEY = 'viewtopia-traffic-tiles';
const DEMO_SOURCE = 'traffic-demo';
const TILE_SOURCE = 'traffic-tiles';

interface OverpassWay {
  id: number;
  geometry?: { lat: number; lon: number }[];
}

// deterministic pseudo-congestion in [0,1] from way id and hour of day.
// rush-hour humps around 08:00 and 17:00 lift congestion, clearly synthetic.
function congestion(wayId: number, hour: number): number {
  const s = Math.sin(wayId * 12.9898 + hour * 78.233) * 43758.5453;
  const base = s - Math.floor(s);
  const rush = Math.exp(-((hour - 8) ** 2) / 6) + Math.exp(-((hour - 17) ** 2) / 6);
  return Math.min(1, base * 0.55 + rush * 0.45);
}

function congestionColor(c: number): string {
  const r = Math.round(255 * Math.min(1, c * 2));
  const g = Math.round(200 * (1 - Math.max(0, c - 0.5) * 2));
  return `rgb(${r},${g},60)`;
}

async function fetchRoads(): Promise<FeatureCollection> {
  requireOnline('the OSM road download');
  const b = getViewBounds();
  const query = `[out:json][timeout:20];way["highway"~"motorway|trunk|primary|secondary"](${b.south.toFixed(
    5,
  )},${b.west.toFixed(5)},${b.north.toFixed(5)},${b.east.toFixed(5)});out geom;`;
  const resp = await fetch(OVERPASS, {
    method: 'POST',
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(30000),
  });
  if (!resp.ok) throw new Error(`overpass ${resp.status}`);
  const data = await resp.json();
  const hour = new Date().getHours();
  const features = (data.elements as OverpassWay[])
    .filter((w) => w.geometry && w.geometry.length > 1)
    .map((w) => {
      const c = congestion(w.id, hour);
      return {
        type: 'Feature' as const,
        properties: { color: congestionColor(c), congestion: c },
        geometry: {
          type: 'LineString' as const,
          coordinates: w.geometry!.map((p) => [p.lon, p.lat]),
        },
      };
    });
  return { type: 'FeatureCollection', features };
}

export function TrafficPanel({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState('demo');
  const [tileUrl, setTileUrl] = useState(() => localStorage.getItem(TILE_KEY) ?? '');
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const removeDemo = (map: ReturnType<typeof getActiveMapLibre>) => {
    if (!map) return;
    if (map.getLayer(`${DEMO_SOURCE}-line`)) map.removeLayer(`${DEMO_SOURCE}-line`);
    if (map.getSource(DEMO_SOURCE)) map.removeSource(DEMO_SOURCE);
  };
  const removeTiles = (map: ReturnType<typeof getActiveMapLibre>) => {
    if (!map) return;
    if (map.getLayer(`${TILE_SOURCE}-raster`)) map.removeLayer(`${TILE_SOURCE}-raster`);
    if (map.getSource(TILE_SOURCE)) map.removeSource(TILE_SOURCE);
  };

  useEffect(() => {
    return () => {
      const map = getActiveMapLibre();
      removeDemo(map);
      removeTiles(map);
    };
  }, []);

  const loadDemo = async () => {
    const map = getActiveMapLibre();
    if (!map) {
      setStatus('Switch renderer to MapLibre first');
      return;
    }
    if (!map.isStyleLoaded()) {
      setStatus('Map still loading, try again');
      return;
    }
    setLoading(true);
    setStatus('Fetching OSM roads…');
    try {
      const geojson = await fetchRoads();
      removeDemo(map);
      map.addSource(DEMO_SOURCE, { type: 'geojson', data: geojson });
      map.addLayer({
        id: `${DEMO_SOURCE}-line`,
        type: 'line',
        source: DEMO_SOURCE,
        paint: { 'line-color': ['get', 'color'], 'line-width': 3 },
      });
      setStatus(`demo data: ${geojson.features.length} roads colored by synthetic congestion`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Overpass failed');
    } finally {
      setLoading(false);
    }
  };

  const addTiles = () => {
    const url = tileUrl.trim();
    if (!url) return;
    const map = getActiveMapLibre();
    if (!map) {
      setStatus('Switch renderer to MapLibre first');
      return;
    }
    if (!map.isStyleLoaded()) {
      setStatus('Map still loading, try again');
      return;
    }
    localStorage.setItem(TILE_KEY, url);
    removeTiles(map);
    map.addSource(TILE_SOURCE, { type: 'raster', tiles: [url], tileSize: 256 });
    map.addLayer({ id: `${TILE_SOURCE}-raster`, type: 'raster', source: TILE_SOURCE });
    setStatus('Traffic tiles added');
  };

  const clearTiles = () => {
    removeTiles(getActiveMapLibre());
    setStatus('Traffic tiles removed');
  };

  const handleClose = () => {
    const map = getActiveMapLibre();
    removeDemo(map);
    removeTiles(map);
    onClose();
  };

  return (
    <PanelCard width={288}>
      <PanelHeader
        icon={<IconCar size={16} />}
        title="Traffic"
        onClose={handleClose}
      />

      <Stack gap="xs">
        <SegmentedControl
          size="xs"
          fullWidth
          value={mode}
          onChange={setMode}
          data={[
            { value: 'demo', label: 'Demo' },
            { value: 'tiles', label: 'Your tiles' },
          ]}
        />

        {mode === 'demo' && (
          <>
            <Group gap={6}>
              <Badge size="xs" color="yellow" variant="light">
                demo data
              </Badge>
              <Text size="xs" c="dimmed">
                synthetic congestion, not live
              </Text>
            </Group>
            <Text size="xs" c="dimmed">
              Colors OSM major roads in view by a deterministic pattern seeded from way id and time of day.
            </Text>
            <Button size="xs" color="violet" onClick={loadDemo} disabled={loading}>
              {loading ? <Loader size="xs" color="white" /> : 'Load demo traffic'}
            </Button>
          </>
        )}

        {mode === 'tiles' && (
          <>
            <Text size="xs" c="dimmed">
              Raster traffic tiles from your own provider (TomTom, HERE, …). Your key stays in the URL, saved
              locally only.
            </Text>
            <TextInput
              size="xs"
              placeholder="https://.../{z}/{x}/{y}.png?key=YOUR_KEY"
              value={tileUrl}
              onChange={(e) => setTileUrl(e.currentTarget.value)}
            />
            <Group gap="xs" grow>
              <Button size="xs" color="violet" onClick={addTiles} disabled={!tileUrl.trim()}>
                Add tiles
              </Button>
              <Button size="xs" variant="subtle" color="gray" onClick={clearTiles}>
                Remove
              </Button>
            </Group>
          </>
        )}

        {status && (
          <Text size="xs" c="dimmed" data-testid="traffic-status">
            {status}
          </Text>
        )}
      </Stack>
    </PanelCard>
  );
}
