/**
 * OSM Data Downloader Plugin — Download OpenStreetMap data via Overpass API.
 * Equivalent to: QGIS QuickOSM + OSMDownloader (3.9M combined downloads)
 */

import { useState } from 'react';
import { Paper, Text, Stack, TextInput, Button, Group, Badge, Select, Textarea, Loader, Code } from '@mantine/core';
import { IconDownload, IconMapPin } from '@tabler/icons-react';
import type { PluginDefinition, PluginContext } from '../sdk';
import { requireOnline } from '../../offline/network';

// online only: the query and bbox are the user's own, so nothing repeats
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

const PRESET_QUERIES: Record<string, string> = {
  restaurants: '[out:json];node["amenity"="restaurant"]({{bbox}});out body;',
  hospitals: '[out:json];(node["amenity"="hospital"]({{bbox}});way["amenity"="hospital"]({{bbox}}););out body;>;out skel qt;',
  schools: '[out:json];(node["amenity"="school"]({{bbox}});way["amenity"="school"]({{bbox}}););out body;>;out skel qt;',
  parks: '[out:json];(way["leisure"="park"]({{bbox}});relation["leisure"="park"]({{bbox}}););out body;>;out skel qt;',
  buildings: '[out:json];way["building"]({{bbox}});out body;>;out skel qt;',
  roads: '[out:json];way["highway"]({{bbox}});out body;>;out skel qt;',
  water: '[out:json];(way["natural"="water"]({{bbox}});relation["natural"="water"]({{bbox}}););out body;>;out skel qt;',
  railways: '[out:json];way["railway"]({{bbox}});out body;>;out skel qt;',
  shops: '[out:json];node["shop"]({{bbox}});out body;',
  busStops: '[out:json];node["highway"="bus_stop"]({{bbox}});out body;',
  powerLines: '[out:json];way["power"="line"]({{bbox}});out body;>;out skel qt;',
  cycleways: '[out:json];way["highway"="cycleway"]({{bbox}});out body;>;out skel qt;',
};

function overpassToGeoJSON(data: { elements: Array<Record<string, unknown>> }): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  const nodes = new Map<number, [number, number]>();

  // Index nodes
  for (const el of data.elements) {
    if (el.type === 'node' && typeof el.lat === 'number' && typeof el.lon === 'number') {
      nodes.set(el.id as number, [el.lon, el.lat]);
    }
  }

  for (const el of data.elements) {
    if (el.type === 'node' && el.tags) {
      const coords = nodes.get(el.id as number);
      if (coords) {
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: coords },
          properties: el.tags as Record<string, unknown>,
        });
      }
    } else if (el.type === 'way' && Array.isArray(el.nodes)) {
      const coords = (el.nodes as number[]).map((nid) => nodes.get(nid)).filter(Boolean) as [number, number][];
      if (coords.length > 1) {
        const isClosed = coords.length > 3 && coords[0][0] === coords[coords.length - 1][0] && coords[0][1] === coords[coords.length - 1][1];
        features.push({
          type: 'Feature',
          geometry: isClosed
            ? { type: 'Polygon', coordinates: [coords] }
            : { type: 'LineString', coordinates: coords },
          properties: (el.tags || {}) as Record<string, unknown>,
        });
      }
    }
  }

  return { type: 'FeatureCollection', features };
}

function OsmDownloaderPanel({ ctx }: { ctx: PluginContext }) {
  const [preset, setPreset] = useState<string | null>('restaurants');
  const [customQuery, setCustomQuery] = useState('');
  const [bbox, setBbox] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ count: number; layerId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      requireOnline('the OSM download');
      const bboxStr = bbox || '-0.15,51.49,-0.09,51.53'; // Default: central London
      const [west, south, east, north] = bboxStr.split(',').map(Number);
      const bboxOverpass = `${south},${west},${north},${east}`;

      let query = customQuery || PRESET_QUERIES[preset || 'restaurants'] || '';
      query = query.replace(/\{\{bbox\}\}/g, bboxOverpass);

      const response = await fetch(OVERPASS_URL, {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      if (!response.ok) throw new Error(`Overpass API error: ${response.status}`);

      const data = await response.json();
      const geojson = overpassToGeoJSON(data);

      const layerId = `osm-${preset || 'custom'}-${Date.now()}`;
      ctx.map.addGeoJsonLayer(layerId, geojson, { color: '#e74c3c', lineWidth: 2 });
      ctx.map.fitBounds([west, south, east, north]);

      setResult({ count: geojson.features.length, layerId });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Paper p="md" withBorder style={{ width: 360 }}>
      <Stack gap="sm">
        <Group justify="space-between">
          <Text fw={600} size="lg">OSM Data Downloader</Text>
          <Badge size="sm" color="green">Overpass API</Badge>
        </Group>

        <Select
          label="Preset Query"
          data={Object.keys(PRESET_QUERIES).map((k) => ({ value: k, label: k.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()) }))}
          value={preset}
          onChange={setPreset}
          clearable
        />

        <Textarea
          label="Custom Overpass Query"
          description="Use {{bbox}} for current view bounds"
          placeholder="[out:json];node[&quot;amenity&quot;=&quot;cafe&quot;]({{bbox}});out body;"
          value={customQuery}
          onChange={(e) => setCustomQuery(e.currentTarget.value)}
          minRows={3}
        />

        <TextInput
          label="Bounding Box (west,south,east,north)"
          description="Leave empty to use map view"
          placeholder="-0.15,51.49,-0.09,51.53"
          value={bbox}
          onChange={(e) => setBbox(e.currentTarget.value)}
        />

        <Button
          leftSection={loading ? <Loader size={14} /> : <IconDownload size={14} />}
          onClick={handleDownload}
          disabled={loading}
          fullWidth
        >
          {loading ? 'Downloading...' : 'Download OSM Data'}
        </Button>

        {result && (
          <Code block>
            ✓ Downloaded {result.count} features{'\n'}
            Layer: {result.layerId}
          </Code>
        )}

        {error && <Text size="sm" c="red">{error}</Text>}
      </Stack>
    </Paper>
  );
}

const plugin: PluginDefinition = {
  id: 'osm-downloader',
  name: 'OSM Downloader',
  description: 'Download OpenStreetMap data via Overpass API with preset and custom queries',
  version: '1.0.0',
  author: 'TileTopia-HQ',
  icon: <IconMapPin size={14} />,
  category: 'data',
  Panel: OsmDownloaderPanel,
  settings: [
    { key: 'overpassUrl', label: 'Overpass API URL', type: 'text', defaultValue: 'https://overpass-api.de/api/interpreter' },
    { key: 'defaultColor', label: 'Default Layer Color', type: 'color', defaultValue: '#e74c3c' },
  ],
};

export default plugin;
