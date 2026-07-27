/**
 * Street View Plugin — Integrated Google/Mapillary street-level imagery.
 * Equivalent to: QGIS Street View plugin (901K downloads)
 */

import { useState, useRef } from 'react';
import { Paper, Text, Stack, Button, Group, Badge, SegmentedControl, TextInput, Switch } from '@mantine/core';
import { IconEye, IconCamera } from '@tabler/icons-react';
import type { PluginDefinition, PluginContext } from '../sdk';

type Provider = 'google' | 'mapillary';

function StreetViewPanel({ ctx }: { ctx: PluginContext }) {
  const [provider, setProvider] = useState<Provider>('google');
  const [lat, setLat] = useState('51.5074');
  const [lng, setLng] = useState('-0.1278');
  const [heading, setHeading] = useState(0);
  const [pitch, setPitch] = useState(0);
  const [fov, setFov] = useState(90);
  const [autoSync, setAutoSync] = useState(true);
  const [mapillaryToken, setMapillaryToken] = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // the google embed answers 401 without a key, so the panel asks for one in
  // plugin settings instead of loading the iframe
  const googleKey = String(ctx.settings.get('googleApiKey', '') ?? '').trim();
  const needsKey = provider === 'google' && !googleKey;

  const handlePickFromMap = () => {
    const coords = ctx.map.getCursorCoords();
    if (coords) {
      setLat(coords.lat.toFixed(6));
      setLng(coords.lng.toFixed(6));
    }
  };

  const getEmbedUrl = (): string => {
    if (provider === 'google') {
      return `https://www.google.com/maps/embed/v1/streetview?key=${googleKey}&location=${lat},${lng}&heading=${heading}&pitch=${pitch}&fov=${fov}`;
    }
    // Mapillary embed
    return `https://www.mapillary.com/embed?lat=${lat}&lng=${lng}&heading=${heading}&mapillary_token=${mapillaryToken}`;
  };

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
            onChange={(e) => setMapillaryToken(e.currentTarget.value)}
          />
        )}

        <Group grow>
          <TextInput label="Latitude" value={lat} onChange={(e) => setLat(e.currentTarget.value)} />
          <TextInput label="Longitude" value={lng} onChange={(e) => setLng(e.currentTarget.value)} />
        </Group>

        <Group gap="xs">
          <Button size="xs" variant="light" leftSection={<IconCamera size={14} />} onClick={handlePickFromMap}>
            Pick from Map
          </Button>
          <Button size="xs" variant="light" onClick={handleShowOnMap}>
            Show on Map
          </Button>
          <Button size="xs" variant="light" onClick={handleOpen}>
            Open External
          </Button>
        </Group>

        <Group grow>
          <TextInput label="Heading°" value={String(heading)} onChange={(e) => setHeading(Number(e.currentTarget.value))} />
          <TextInput label="Pitch°" value={String(pitch)} onChange={(e) => setPitch(Number(e.currentTarget.value))} />
          <TextInput label="FOV°" value={String(fov)} onChange={(e) => setFov(Number(e.currentTarget.value))} />
        </Group>

        <Switch label="Auto-sync with map click" checked={autoSync} onChange={(e) => setAutoSync(e.currentTarget.checked)} />

        <div style={{ width: '100%', height: 250, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--mantine-color-default-border)' }}>
          {needsKey ? (
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
    { key: 'defaultProvider', label: 'Default Provider', type: 'select', defaultValue: 'google', options: [{ value: 'google', label: 'Google Street View' }, { value: 'mapillary', label: 'Mapillary' }] },
    { key: 'googleApiKey', label: 'Google Maps API Key', type: 'text' },
    { key: 'mapillaryToken', label: 'Mapillary Access Token', type: 'text' },
  ],
};

export default plugin;
