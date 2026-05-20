/**
 * 3D Viewer Plugin — Interactive 3D terrain and building visualization.
 * Equivalent to: QGIS Qgis2threejs (1.4M downloads)
 * Uses deck.gl for 3D rendering with terrain mesh and extruded buildings.
 */

import { useState } from 'react';
import { Paper, Text, Stack, Button, Group, Badge, Slider, Select, Switch, NumberInput, ColorInput } from '@mantine/core';
import { Icon3dCubeSphere } from '@tabler/icons-react';
import type { PluginDefinition, PluginContext } from '../sdk';

interface Scene3DConfig {
  terrainEnabled: boolean;
  terrainExaggeration: number;
  buildingsEnabled: boolean;
  buildingColor: string;
  buildingExtrusionField: string;
  lightingAzimuth: number;
  lightingAltitude: number;
  fogEnabled: boolean;
  fogColor: string;
  skyEnabled: boolean;
  wireframe: boolean;
}

function Viewer3DPanel({ ctx }: { ctx: PluginContext }) {
  const [config, setConfig] = useState<Scene3DConfig>({
    terrainEnabled: true,
    terrainExaggeration: 1.5,
    buildingsEnabled: true,
    buildingColor: '#4a90d9',
    buildingExtrusionField: 'height',
    lightingAzimuth: 315,
    lightingAltitude: 45,
    fogEnabled: false,
    fogColor: '#ffffff',
    skyEnabled: true,
    wireframe: false,
  });

  const updateConfig = (key: keyof Scene3DConfig, value: unknown) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const handleApply = () => {
    // Store 3D config for the renderer to pick up
    ctx.settings.set('scene3d', config);
    // Signal the map to switch to 3D mode
    ctx.map.addGeoJsonLayer('3d-config-signal', {
      type: 'FeatureCollection',
      features: [],
    });
  };

  const handleExport = () => {
    // Export current 3D scene configuration
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'viewtopia-3d-scene.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Paper p="md" withBorder style={{ width: 340 }}>
      <Stack gap="sm">
        <Group justify="space-between">
          <Text fw={600} size="lg">3D Viewer</Text>
          <Badge size="sm" color="indigo">deck.gl</Badge>
        </Group>

        <Text size="sm" fw={500}>Terrain</Text>
        <Switch
          label="Enable 3D Terrain"
          checked={config.terrainEnabled}
          onChange={(e) => updateConfig('terrainEnabled', e.currentTarget.checked)}
        />
        <Text size="xs" c="dimmed">Exaggeration: {config.terrainExaggeration.toFixed(1)}x</Text>
        <Slider
          value={config.terrainExaggeration}
          onChange={(v) => updateConfig('terrainExaggeration', v)}
          min={0.5}
          max={5}
          step={0.1}
          marks={[{ value: 1, label: '1x' }, { value: 2.5, label: '2.5x' }, { value: 5, label: '5x' }]}
        />

        <Text size="sm" fw={500} mt="sm">Buildings</Text>
        <Switch
          label="Extruded Buildings"
          checked={config.buildingsEnabled}
          onChange={(e) => updateConfig('buildingsEnabled', e.currentTarget.checked)}
        />
        <ColorInput
          label="Building Color"
          value={config.buildingColor}
          onChange={(v) => updateConfig('buildingColor', v)}
        />
        <Select
          label="Height Field"
          data={['height', 'floors', 'building:levels', 'render_height']}
          value={config.buildingExtrusionField}
          onChange={(v) => updateConfig('buildingExtrusionField', v || 'height')}
        />
        <Switch
          label="Wireframe Mode"
          checked={config.wireframe}
          onChange={(e) => updateConfig('wireframe', e.currentTarget.checked)}
        />

        <Text size="sm" fw={500} mt="sm">Lighting</Text>
        <Group grow>
          <NumberInput
            label="Azimuth"
            value={config.lightingAzimuth}
            onChange={(v) => updateConfig('lightingAzimuth', Number(v))}
            min={0}
            max={360}
            suffix="°"
          />
          <NumberInput
            label="Altitude"
            value={config.lightingAltitude}
            onChange={(v) => updateConfig('lightingAltitude', Number(v))}
            min={0}
            max={90}
            suffix="°"
          />
        </Group>

        <Text size="sm" fw={500} mt="sm">Atmosphere</Text>
        <Switch
          label="Sky"
          checked={config.skyEnabled}
          onChange={(e) => updateConfig('skyEnabled', e.currentTarget.checked)}
        />
        <Switch
          label="Fog"
          checked={config.fogEnabled}
          onChange={(e) => updateConfig('fogEnabled', e.currentTarget.checked)}
        />
        {config.fogEnabled && (
          <ColorInput label="Fog Color" value={config.fogColor} onChange={(v) => updateConfig('fogColor', v)} />
        )}

        <Group grow mt="sm">
          <Button onClick={handleApply} color="indigo">Apply 3D</Button>
          <Button variant="light" onClick={handleExport}>Export Config</Button>
        </Group>
      </Stack>
    </Paper>
  );
}

const plugin: PluginDefinition = {
  id: 'viewer-3d',
  name: '3D Viewer',
  description: '3D terrain visualization with extruded buildings, configurable lighting, and atmosphere effects',
  version: '1.0.0',
  author: 'TileTopia-HQ',
  icon: <Icon3dCubeSphere size={14} />,
  category: 'tools',
  Panel: Viewer3DPanel,
  settings: [
    { key: 'terrainSource', label: 'Terrain Tile Source', type: 'select', defaultValue: 'mapzen', options: [{ value: 'mapzen', label: 'Mapzen/Nextzen' }, { value: 'mapbox', label: 'Mapbox Terrain' }] },
    { key: 'defaultExaggeration', label: 'Default Exaggeration', type: 'number', defaultValue: 1.5, min: 0.5, max: 10 },
  ],
};

export default plugin;
