/**
 * Example Plugin — demonstrates the Viewtopia plugin system.
 *
 * To create your own plugin:
 * 1. Create a folder: src/plugins/my-plugin/
 * 2. Add an index.tsx that default-exports a PluginDefinition
 * 3. That's it! The plugin auto-appears in the Plugins menu.
 */

import { useState } from 'react';
import { Paper, Text, Button, Stack, TextInput, Group, Badge } from '@mantine/core';
import { IconMapSearch } from '@tabler/icons-react';
import type { PluginDefinition, PluginContext } from '../sdk';

function ExamplePanel({ ctx }: { ctx: PluginContext }) {
  const [lat, setLat] = useState('51.5');
  const [lng, setLng] = useState('-0.12');
  const [layerAdded, setLayerAdded] = useState(false);

  const handleFlyTo = () => {
    ctx.map.flyTo(parseFloat(lng), parseFloat(lat), 12);
  };

  const handleAddLayer = () => {
    ctx.map.addGeoJsonLayer('example-plugin-layer', {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] },
          properties: { name: 'Plugin Marker' },
        },
      ],
    });
    setLayerAdded(true);
  };

  const handleRemoveLayer = () => {
    ctx.map.removeLayer('example-plugin-layer');
    setLayerAdded(false);
  };

  const handleApiCall = async () => {
    try {
      const resp = await ctx.api.fetch('/health');
      const text = await resp.text();
      alert(`API response: ${text}`);
    } catch (e) {
      alert(`API error: ${e}`);
    }
  };

  return (
    <Paper p="md" withBorder style={{ width: 320 }}>
      <Stack gap="sm">
        <Group justify="space-between">
          <Text fw={600}>Example Plugin</Text>
          <Badge size="sm" color="green">v1.0.0</Badge>
        </Group>
        <Text size="sm" c="dimmed">
          This demonstrates the plugin API. Plugins can control the map,
          add layers, and call backend APIs.
        </Text>

        <TextInput label="Latitude" value={lat} onChange={(e) => setLat(e.target.value)} size="xs" />
        <TextInput label="Longitude" value={lng} onChange={(e) => setLng(e.target.value)} size="xs" />

        <Group gap="xs">
          <Button size="xs" onClick={handleFlyTo}>Fly To</Button>
          {!layerAdded ? (
            <Button size="xs" variant="light" onClick={handleAddLayer}>Add Marker</Button>
          ) : (
            <Button size="xs" variant="light" color="red" onClick={handleRemoveLayer}>Remove Marker</Button>
          )}
        </Group>

        <Button size="xs" variant="outline" onClick={handleApiCall}>
          Test API Call
        </Button>
        <Button size="xs" variant="subtle" color="gray" onClick={ctx.close}>
          Close
        </Button>
      </Stack>
    </Paper>
  );
}

const plugin: PluginDefinition = {
  id: 'example-plugin',
  name: 'Example',
  description: 'Demonstrates the plugin system',
  version: '1.0.0',
  author: 'TileTopia-HQ',
  icon: <IconMapSearch size={14} />,
  category: 'plugins',
  Panel: ExamplePanel,
};

export default plugin;
