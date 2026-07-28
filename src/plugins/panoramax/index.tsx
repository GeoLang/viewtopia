/**
 * Panoramax Plugin — open street-level imagery, no API key needed.
 * Photos come from the federated catalog (api.panoramax.xyz) under CC-BY-SA;
 * author + license are shown per picture as required by the license.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Paper, Text, Stack, Button, Group, Badge, Anchor } from '@mantine/core';
import { IconPanoramaHorizontal, IconCamera } from '@tabler/icons-react';
import type { PluginDefinition, PluginContext } from '../sdk';
import '@panoramax/web-viewer';

interface PhotoViewerElement extends HTMLElement {
  select: (seqId: string | null, picId: string | null, force?: boolean) => void;
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'pnx-photo-viewer': React.DetailedHTMLProps<React.HTMLAttributes<PhotoViewerElement>, PhotoViewerElement> & {
        endpoint?: string;
        'url-parameters'?: string;
      };
    }
  }
}

interface StacItem {
  id: string;
  collection: string;
  geometry: { coordinates: [number, number] };
  properties: { datetime?: string; license?: string };
  providers?: Array<{ name: string }>;
  assets?: Record<string, { href?: string }>;
}

const SEARCH_RADIUS_DEG = 0.005; // ~500m

function PanoramaxPanel({ ctx }: { ctx: PluginContext }) {
  const endpoint = String(ctx.settings.get('endpoint', 'https://api.panoramax.xyz/api'));
  const viewerRef = useRef<PhotoViewerElement>(null);
  const [status, setStatus] = useState('Click "Pick from Map", then click a spot on the map.');
  const [selected, setSelected] = useState<StacItem | null>(null);
  const [picking, setPicking] = useState(false);

  const searchAt = useCallback(async (lng: number, lat: number) => {
    setStatus(`Searching around ${lat.toFixed(4)}, ${lng.toFixed(4)}…`);
    try {
      const bbox = [
        lng - SEARCH_RADIUS_DEG, lat - SEARCH_RADIUS_DEG,
        lng + SEARCH_RADIUS_DEG, lat + SEARCH_RADIUS_DEG,
      ].join(',');
      const res = await fetch(`${endpoint}/search?bbox=${bbox}&limit=50`);
      if (!res.ok) throw new Error(`search failed: ${res.status}`);
      const items: StacItem[] = (await res.json()).features ?? [];
      if (items.length === 0) {
        setStatus('No photos within ~500m. Try a covered area (coverage is strongest in France).');
        setSelected(null);
        return;
      }
      const dist = (f: StacItem) =>
        (f.geometry.coordinates[0] - lng) ** 2 + (f.geometry.coordinates[1] - lat) ** 2;
      const sorted = items.slice().sort((a, b) => dist(a) - dist(b));
      // images live on origin instances, which can be down independently of
      // the federated catalog (bit us with panoramax.openstreetmap.fr), so
      // probe each distinct host once and pick the nearest photo on a live one
      const assetUrl = (f: StacItem) => f.assets?.sd?.href ?? f.assets?.thumb?.href;
      const hostSamples = new Map<string, string>();
      for (const item of sorted) {
        const url = assetUrl(item);
        if (url) {
          const host = new URL(url).host;
          if (!hostSamples.has(host)) hostSamples.set(host, url);
        }
      }
      const liveHosts = new Set<string>();
      await Promise.all(
        [...hostSamples].map(async ([host, url]) => {
          try {
            const probe = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(4000) });
            if (probe.ok) liveHosts.add(host);
          } catch {
            // host unreachable
          }
        }),
      );
      const chosen =
        sorted.find((f) => {
          const url = assetUrl(f);
          return url && liveHosts.has(new URL(url).host);
        }) ?? null;
      ctx.map.addGeoJsonLayer('panoramax-photos', {
        type: 'FeatureCollection',
        features: items.map((f) => ({
          type: 'Feature',
          geometry: f.geometry,
          properties: { name: 'Panoramax photo' },
        })),
      }, { color: '#e6533c' });
      if (!chosen) {
        setSelected(null);
        setStatus(`${items.length} photos nearby, but their host instance is unreachable right now.`);
        return;
      }
      viewerRef.current?.select(chosen.collection, chosen.id);
      setSelected(chosen);
      setStatus(
        liveHosts.size < hostSamples.size
          ? `${items.length} photos nearby (a host instance is down, showing nearest reachable).`
          : `${items.length} photo${items.length > 1 ? 's' : ''} nearby.`,
      );
    } catch (e) {
      setStatus(`Search failed: ${e instanceof Error ? e.message : e}`);
    }
  }, [endpoint, ctx.map]);

  useEffect(() => {
    if (!picking) return;
    return ctx.map.onMapClick((c) => {
      setPicking(false);
      void searchAt(c.lng, c.lat);
    });
  }, [picking, ctx.map, searchAt]);

  const handleShowOnMap = () => {
    if (!selected) return;
    const [lng, lat] = selected.geometry.coordinates;
    ctx.map.flyTo(lng, lat, 17);
  };

  return (
    <Paper p="md" withBorder style={{ width: 440 }}>
      <Stack gap="sm">
        <Group justify="space-between">
          <Text fw={600} size="lg">Panoramax</Text>
          <Badge size="sm" color="teal">no key needed</Badge>
        </Group>

        <Group gap="xs">
          <Button
            size="xs"
            variant={picking ? 'filled' : 'light'}
            leftSection={<IconCamera size={14} />}
            onClick={() => setPicking((p) => !p)}
          >
            {picking ? 'Click the map…' : 'Pick from Map'}
          </Button>
          <Button size="xs" variant="light" onClick={handleShowOnMap} disabled={!selected}>
            Show on Map
          </Button>
        </Group>

        <Text size="sm" c="dimmed">{status}</Text>

        {/* contain traps the viewer's position:fixed bottom drawer, which
            otherwise anchors to the viewport and blacks out the page bottom */}
        <div style={{ width: '100%', height: 300, borderRadius: 8, overflow: 'hidden', position: 'relative', contain: 'layout paint' }}>
          <pnx-photo-viewer
            ref={viewerRef}
            endpoint={endpoint}
            url-parameters="false"
            style={{ width: '100%', height: '100%', display: 'block' }}
          />
        </div>

        {selected && (
          <Text size="xs" c="dimmed">
            {selected.providers?.map((p) => p.name).join(', ') || 'Unknown author'}
            {' · '}
            <Anchor size="xs" href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank">
              {selected.properties.license ?? 'CC-BY-SA-4.0'}
            </Anchor>
            {selected.properties.datetime && ` · ${selected.properties.datetime.slice(0, 10)}`}
          </Text>
        )}
      </Stack>
    </Paper>
  );
}

const plugin: PluginDefinition = {
  id: 'panoramax',
  name: 'Panoramax',
  description: 'Open street-level imagery from the Panoramax federation, keyless',
  version: '1.0.0',
  author: 'TileTopia-HQ',
  icon: <IconPanoramaHorizontal size={14} />,
  category: 'tools',
  Panel: PanoramaxPanel,
  settings: [
    {
      key: 'endpoint',
      label: 'API Endpoint',
      type: 'text',
      defaultValue: 'https://api.panoramax.xyz/api',
      description: 'Any Panoramax/STAC instance API root',
    },
  ],
};

export default plugin;
