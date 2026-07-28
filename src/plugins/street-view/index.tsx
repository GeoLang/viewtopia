/**
 * Street View Plugin — Integrated Google/Mapillary street-level imagery.
 * Equivalent to: QGIS Street View plugin (901K downloads)
 */

import { useCallback, useEffect, useState, useRef } from 'react';
import { Paper, Text, Stack, Button, Group, Badge, SegmentedControl, TextInput, Switch } from '@mantine/core';
import { IconEye, IconCamera } from '@tabler/icons-react';
import { Viewer } from 'mapillary-js';
import 'mapillary-js/dist/mapillary.css';
import type { PluginDefinition, PluginContext } from '../sdk';

type Provider = 'google' | 'mapillary';

const MLY_SEARCH_RADIUS_DEG = 0.002; // ~200m; graph api caps bbox at 0.01 deg²

interface MlyImage {
  id: string;
  computed_geometry?: { coordinates: [number, number] };
  geometry?: { coordinates: [number, number] };
}

function StreetViewPanel({ ctx }: { ctx: PluginContext }) {
  const [provider, setProvider] = useState<Provider>(
    () => ctx.settings.get('defaultProvider', 'mapillary') as Provider
  );
  const [lat, setLat] = useState('51.5074');
  const [lng, setLng] = useState('-0.1278');
  const [heading, setHeading] = useState(0);
  const [pitch, setPitch] = useState(0);
  const [fov, setFov] = useState(90);
  const [autoSync, setAutoSync] = useState(true);
  const [mapillaryToken, setMapillaryToken] = useState(
    () => String(ctx.settings.get('mapillaryToken', '') ?? '')
  );
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const mlyContainer = useRef<HTMLDivElement>(null);
  const mlyViewer = useRef<Viewer | null>(null);
  const [mlyReady, setMlyReady] = useState(false);
  const [mlyStatus, setMlyStatus] = useState('Pick a location to load imagery.');

  // the google embed answers 401 without a key, so the panel asks for one in
  // plugin settings instead of loading the iframe
  const googleKey = String(ctx.settings.get('googleApiKey', '') ?? '').trim();
  const needsKey = provider === 'google' && !googleKey;
  const token = mapillaryToken.trim();

  const [picking, setPicking] = useState(false);
  useEffect(() => {
    if (!picking) return;
    return ctx.map.onMapClick((coords) => {
      setPicking(false);
      setLat(coords.lat.toFixed(6));
      setLng(coords.lng.toFixed(6));
    });
  }, [picking, ctx.map]);

  const saveToken = useCallback((value: string) => {
    setMapillaryToken(value);
    ctx.settings.set('mapillaryToken', value);
  }, [ctx.settings]);

  // MapillaryJS viewer lifecycle. Debounced so typing a token doesn't create
  // a viewer per keystroke.
  useEffect(() => {
    if (provider !== 'mapillary' || !token) return;
    const timer = setTimeout(() => {
      if (!mlyContainer.current) return;
      mlyViewer.current = new Viewer({ accessToken: token, container: mlyContainer.current });
      setMlyReady(true);
    }, 400);
    return () => {
      clearTimeout(timer);
      setMlyReady(false);
      mlyViewer.current?.remove();
      mlyViewer.current = null;
    };
  }, [provider, token]);

  // find the nearest image via the graph api and jump the viewer to it
  useEffect(() => {
    if (provider !== 'mapillary' || !token || !mlyReady) return;
    const la = Number.parseFloat(lat);
    const ln = Number.parseFloat(lng);
    if (!Number.isFinite(la) || !Number.isFinite(ln)) return;
    const timer = setTimeout(async () => {
      setMlyStatus('Searching imagery…');
      try {
        const d = MLY_SEARCH_RADIUS_DEG;
        const bbox = `${ln - d},${la - d},${ln + d},${la + d}`;
        const res = await fetch(
          `https://graph.mapillary.com/images?access_token=${encodeURIComponent(token)}&fields=id,computed_geometry,geometry&bbox=${bbox}&limit=20`,
        );
        if (!res.ok) throw new Error(`Mapillary API: ${res.status}`);
        const images: MlyImage[] = (await res.json()).data ?? [];
        const coordsOf = (i: MlyImage) => i.computed_geometry?.coordinates ?? i.geometry?.coordinates;
        const usable = images.filter((i) => coordsOf(i));
        if (usable.length === 0) {
          setMlyStatus('No Mapillary imagery within ~200m.');
          return;
        }
        const nearest = usable.reduce((a, b) => {
          const dist = (i: MlyImage) => {
            const c = coordsOf(i) as [number, number];
            return (c[0] - ln) ** 2 + (c[1] - la) ** 2;
          };
          return dist(b) < dist(a) ? b : a;
        });
        await mlyViewer.current?.moveTo(nearest.id);
        setMlyStatus(`${usable.length} image${usable.length > 1 ? 's' : ''} nearby.`);
      } catch (e) {
        setMlyStatus(`Search failed: ${e instanceof Error ? e.message : e}`);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [provider, token, mlyReady, lat, lng]);

  const getEmbedUrl = (): string =>
    `https://www.google.com/maps/embed/v1/streetview?key=${googleKey}&location=${lat},${lng}&heading=${heading}&pitch=${pitch}&fov=${fov}`;

  const handleOpen = () => {
    if (provider === 'google') {
      window.open(`https://www.google.com/maps/@${lat},${lng},3a,${fov}y,${heading}h,${90 - pitch}t/data=!3m1!1e1`, '_blank');
    } else {
      window.open(`https://www.mapillary.com/app/?lat=${lat}&lng=${lng}`, '_blank');
    }
  };

  // Place a marker on the map showing where street view is looking
  const handleShowOnMap = () => {
    ctx.map.addGeoJsonLayer('street-view-marker', {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] },
        properties: { name: 'Street View Location', heading },
      }],
    }, { color: '#f39c12' });
    ctx.map.flyTo(parseFloat(lng), parseFloat(lat), 17);
  };

  return (
    <Paper p="md" withBorder style={{ width: 400 }}>
      <Stack gap="sm">
        <Group justify="space-between">
          <Text fw={600} size="lg">Street View</Text>
          <Badge size="sm" color="orange">{provider}</Badge>
        </Group>

        <SegmentedControl
          fullWidth
          data={[
            { value: 'google', label: 'Google' },
            { value: 'mapillary', label: 'Mapillary' },
          ]}
          value={provider}
          onChange={(v) => setProvider(v as Provider)}
        />

        {provider === 'mapillary' && (
          <TextInput
            label="Mapillary Token"
            placeholder="MLY|..."
            value={mapillaryToken}
            onChange={(e) => saveToken(e.currentTarget.value)}
          />
        )}

        <Group grow>
          <TextInput label="Latitude" value={lat} onChange={(e) => setLat(e.currentTarget.value)} />
          <TextInput label="Longitude" value={lng} onChange={(e) => setLng(e.currentTarget.value)} />
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
          <Button size="xs" variant="light" onClick={handleShowOnMap}>
            Show on Map
          </Button>
          <Button size="xs" variant="light" onClick={handleOpen}>
            Open External
          </Button>
        </Group>

        {provider === 'google' && (
          <Group grow>
            <TextInput label="Heading°" value={String(heading)} onChange={(e) => setHeading(Number(e.currentTarget.value))} />
            <TextInput label="Pitch°" value={String(pitch)} onChange={(e) => setPitch(Number(e.currentTarget.value))} />
            <TextInput label="FOV°" value={String(fov)} onChange={(e) => setFov(Number(e.currentTarget.value))} />
          </Group>
        )}

        <Switch label="Auto-sync with map click" checked={autoSync} onChange={(e) => setAutoSync(e.currentTarget.checked)} />

        {provider === 'mapillary' && <Text size="sm" c="dimmed">{mlyStatus}</Text>}

        <div style={{ width: '100%', height: 250, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--mantine-color-default-border)' }}>
          {provider === 'google' ? (
            needsKey ? (
              <Text size="sm" c="dimmed" py="lg" ta="center" data-testid="street-view-needs-key">
                Add a Google Maps API key in plugin settings to load Street View.
              </Text>
            ) : (
              <iframe
                ref={iframeRef}
                src={getEmbedUrl()}
                width="100%"
                height="100%"
                style={{ border: 'none' }}
                loading="lazy"
                allowFullScreen
                title="Street View"
              />
            )
          ) : token ? (
            <div ref={mlyContainer} style={{ width: '100%', height: '100%' }} />
          ) : (
            <Text size="sm" c="dimmed" py="lg" ta="center">
              Add a Mapillary access token above (free at mapillary.com/dashboard).
            </Text>
          )}
        </div>
      </Stack>
    </Paper>
  );
}

const plugin: PluginDefinition = {
  id: 'street-view',
  name: 'Street View',
  description: 'Street-level imagery from Google Street View and Mapillary integrated with the map',
  version: '1.0.0',
  author: 'TileTopia-HQ',
  icon: <IconEye size={14} />,
  category: 'tools',
  Panel: StreetViewPanel,
  settings: [
    { key: 'defaultProvider', label: 'Default Provider', type: 'select', defaultValue: 'mapillary', options: [{ value: 'mapillary', label: 'Mapillary' }, { value: 'google', label: 'Google Street View' }] },
    { key: 'googleApiKey', label: 'Google Maps API Key', type: 'text' },
    { key: 'mapillaryToken', label: 'Mapillary Access Token', type: 'text' },
  ],
};

export default plugin;
