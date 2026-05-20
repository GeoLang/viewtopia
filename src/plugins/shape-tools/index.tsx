/**
 * Shape Tools Plugin — Create geodesic shapes: circles, ellipses, sectors, bearing lines.
 * Equivalent to: QGIS Shape Tools (669K downloads)
 * Uses Turf.js for geodesic calculations.
 */

import { useState } from 'react';
import { Paper, Text, Stack, Button, Group, Badge, Select, NumberInput, ColorInput, TextInput } from '@mantine/core';
import { IconCircle, IconOvalVertical } from '@tabler/icons-react';
import * as turf from '@turf/turf';
import type { PluginDefinition, PluginContext } from '../sdk';

type ShapeType = 'circle' | 'ellipse' | 'sector' | 'bearing-line' | 'arc' | 'star' | 'polygon';

function ShapeToolsPanel({ ctx }: { ctx: PluginContext }) {
  const [shape, setShape] = useState<ShapeType>('circle');
  const [center, setCenter] = useState('51.5074,-0.1278');
  const [radius, setRadius] = useState(1000);
  const [units, setUnits] = useState<string>('meters');
  const [bearing, setBearing] = useState(0);
  const [semiMajor, setSemiMajor] = useState(2000);
  const [semiMinor, setSemiMinor] = useState(1000);
  const [startAngle, setStartAngle] = useState(0);
  const [endAngle, setEndAngle] = useState(90);
  const [sides, setSides] = useState(6);
  const [color, setColor] = useState('#2ecc71');
  const [distance, setDistance] = useState(5000);

  const handleCreate = () => {
    const [lat, lng] = center.split(',').map(Number);
    const pt = turf.point([lng, lat]);
    let feature: GeoJSON.Feature | GeoJSON.FeatureCollection;

    switch (shape) {
      case 'circle':
        feature = turf.circle(pt, radius, { units: units as turf.Units, steps: 64 });
        break;
      case 'ellipse':
        feature = turf.ellipse(pt, semiMajor / 1000, semiMinor / 1000, {
          units: 'kilometers',
          angle: bearing,
          steps: 64,
        });
        break;
      case 'sector':
        feature = turf.sector(pt, radius / 1000, startAngle, endAngle, {
          units: 'kilometers',
          steps: 64,
        });
        break;
      case 'bearing-line': {
        const dest = turf.destination(pt, distance, bearing, { units: units as turf.Units });
        feature = turf.lineString([[lng, lat], dest.geometry.coordinates]);
        break;
      }
      case 'arc': {
        // Create arc as partial circle
        const points: [number, number][] = [];
        for (let a = startAngle; a <= endAngle; a += 2) {
          const dest = turf.destination(pt, radius, a, { units: units as turf.Units });
          points.push(dest.geometry.coordinates as [number, number]);
        }
        feature = turf.lineString(points);
        break;
      }
      case 'star': {
        // Create star polygon
        const outer = radius;
        const inner = radius * 0.4;
        const points: [number, number][] = [];
        for (let i = 0; i < sides * 2; i++) {
          const angle = (i * 360) / (sides * 2) - 90;
          const r = i % 2 === 0 ? outer : inner;
          const dest = turf.destination(pt, r, angle, { units: units as turf.Units });
          points.push(dest.geometry.coordinates as [number, number]);
        }
        points.push(points[0]);
        feature = turf.polygon([points]);
        break;
      }
      case 'polygon': {
        // Regular polygon
        const pts: [number, number][] = [];
        for (let i = 0; i < sides; i++) {
          const angle = (i * 360) / sides - 90;
          const dest = turf.destination(pt, radius, angle, { units: units as turf.Units });
          pts.push(dest.geometry.coordinates as [number, number]);
        }
        pts.push(pts[0]);
        feature = turf.polygon([pts]);
        break;
      }
    }

    const layerId = `shape-${shape}-${Date.now()}`;
    const fc = turf.featureCollection([feature as GeoJSON.Feature]);
    ctx.map.addGeoJsonLayer(layerId, fc, { color, lineWidth: 2, filled: true, opacity: 0.4 });
    ctx.map.flyTo(lng, lat, 14);
  };

  return (
    <Paper p="md" withBorder style={{ width: 340 }}>
      <Stack gap="sm">
        <Group justify="space-between">
          <Text fw={600} size="lg">Shape Tools</Text>
          <Badge size="sm" color="teal">Geodesic</Badge>
        </Group>

        <Select
          label="Shape Type"
          data={[
            { value: 'circle', label: '⭕ Circle' },
            { value: 'ellipse', label: '⬮ Ellipse' },
            { value: 'sector', label: '◔ Sector (Pie)' },
            { value: 'bearing-line', label: '↗ Line of Bearing' },
            { value: 'arc', label: '⌒ Arc' },
            { value: 'star', label: '★ Star' },
            { value: 'polygon', label: '⬡ Regular Polygon' },
          ]}
          value={shape}
          onChange={(v) => setShape((v || 'circle') as ShapeType)}
        />

        <TextInput
          label="Center (lat,lng)"
          value={center}
          onChange={(e) => setCenter(e.currentTarget.value)}
          placeholder="51.5074,-0.1278"
        />

        {['circle', 'sector', 'arc', 'star', 'polygon'].includes(shape) && (
          <NumberInput label="Radius" value={radius} onChange={(v) => setRadius(Number(v))} min={1} />
        )}

        {shape === 'ellipse' && (
          <Group grow>
            <NumberInput label="Semi-Major (m)" value={semiMajor} onChange={(v) => setSemiMajor(Number(v))} min={1} />
            <NumberInput label="Semi-Minor (m)" value={semiMinor} onChange={(v) => setSemiMinor(Number(v))} min={1} />
          </Group>
        )}

        {['bearing-line', 'ellipse'].includes(shape) && (
          <NumberInput label="Bearing / Rotation (°)" value={bearing} onChange={(v) => setBearing(Number(v))} min={0} max={360} />
        )}

        {shape === 'bearing-line' && (
          <NumberInput label="Distance" value={distance} onChange={(v) => setDistance(Number(v))} min={1} />
        )}

        {['sector', 'arc'].includes(shape) && (
          <Group grow>
            <NumberInput label="Start Angle (°)" value={startAngle} onChange={(v) => setStartAngle(Number(v))} min={0} max={360} />
            <NumberInput label="End Angle (°)" value={endAngle} onChange={(v) => setEndAngle(Number(v))} min={0} max={360} />
          </Group>
        )}

        {['star', 'polygon'].includes(shape) && (
          <NumberInput label="Sides / Points" value={sides} onChange={(v) => setSides(Number(v))} min={3} max={36} />
        )}

        <Select
          label="Units"
          data={['meters', 'kilometers', 'miles', 'feet', 'nauticalMiles']}
          value={units}
          onChange={(v) => setUnits(v || 'meters')}
        />

        <ColorInput label="Color" value={color} onChange={setColor} />

        <Button onClick={handleCreate} fullWidth color="teal">
          Create Shape
        </Button>
      </Stack>
    </Paper>
  );
}

const plugin: PluginDefinition = {
  id: 'shape-tools',
  name: 'Shape Tools',
  description: 'Create geodesic shapes: circles, ellipses, sectors, arcs, bearing lines, stars, regular polygons',
  version: '1.0.0',
  author: 'TileTopia-HQ',
  icon: <IconCircle size={14} />,
  category: 'tools',
  Panel: ShapeToolsPanel,
};

export default plugin;
