/**
 * Advanced Sketching Plugin — geometry edits on the features drawn with the draw tool.
 * Equivalent to: QGIS Sketching Tools (669K downloads)
 * Every tool here runs turf on real drawn geometry; the tools that would need
 * interactive vertex editing are listed but disabled.
 */

import { useState } from 'react';
import { Paper, Text, Stack, Button, Group, Badge, Select, Slider, Code, NumberInput, Alert } from '@mantine/core';
import { IconPencil, } from '@tabler/icons-react';
import * as turf from '@turf/turf';
import type { PluginDefinition, PluginContext } from '../sdk';
import { useDrawStore, featuresToGeoJSON, type DrawnFeature } from '../../store/draw';

type SketchTool =
  | 'merge'
  | 'split'
  | 'offset'
  | 'smooth'
  | 'densify'
  | 'simplify'
  | 'reshape'
  | 'orthogonalize'
  | 'extend-trim'
  | 'snap';

/** Tools with nothing behind them yet, and why. Shown disabled rather than faked. */
const UNIMPLEMENTED: Partial<Record<SketchTool, string>> = {
  reshape: 'Not implemented: reshaping needs interactive vertex dragging, which the draw tool does not have.',
  orthogonalize: 'Not implemented: no orthogonalization in turf, it would need its own corner-squaring pass.',
  'extend-trim': 'Not implemented: needs interactive picking of the two line ends to extend or trim.',
  snap: 'Not implemented: snapping has to run inside the draw tool while drawing, not as a post-edit.',
};

/** GeoJSON for one drawn feature. The store's converter closes polygon rings. */
function drawnGeoJson(f: DrawnFeature) {
  return featuresToGeoJSON([f]).features[0];
}

function pickerOptions(features: DrawnFeature[], type: DrawnFeature['type']) {
  return features
    .map((f, i) => ({ f, i }))
    .filter(({ f }) => f.type === type)
    .map(({ f, i }) => ({ value: f.id, label: `#${i + 1} ${type} (${f.coords.length} pts)` }));
}

function AdvancedSketchingPanel({ ctx }: { ctx: PluginContext }) {
  const [tool, setTool] = useState<SketchTool>('merge');
  const [targetId, setTargetId] = useState<string | null>(null);
  const [splitterId, setSplitterId] = useState<string | null>(null);
  const [offsetDist, setOffsetDist] = useState(10);
  const [densifyInterval, setDensifyInterval] = useState(10);
  const [smoothFactor, setSmoothFactor] = useState(0.5);
  const [simplifyTolerance, setSimplifyTolerance] = useState(20);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const drawn = useDrawStore((s) => s.features);
  const lines = pickerOptions(drawn, 'LineString');
  const polygons = drawn.filter((f) => f.type === 'Polygon');
  const target = drawn.find((f) => f.id === targetId) ?? null;
  const splitter = drawn.find((f) => f.id === splitterId) ?? null;

  const unimplemented = UNIMPLEMENTED[tool];
  const needsLine = tool === 'offset' || tool === 'smooth' || tool === 'densify';
  const needsAnyFeature = tool === 'simplify';
  const needsTwoLines = tool === 'split';

  const handleApply = () => {
    setResult(null);
    setError(null);
    if (unimplemented) return;

    if (tool === 'merge') {
      if (polygons.length < 2) {
        setError('Draw at least two polygons first.');
        return;
      }
      const polys = polygons.flatMap((f) => {
        const g = drawnGeoJson(f);
        return g.geometry.type === 'Polygon' ? [turf.polygon(g.geometry.coordinates)] : [];
      });
      const merged = turf.union(turf.featureCollection(polys));
      if (!merged) {
        setError('Union returned nothing.');
        return;
      }
      ctx.map.addGeoJsonLayer('sketch-merge', merged, { color: '#e67e22', filled: true, lineWidth: 2 });
      const parts = merged.geometry.type === 'MultiPolygon' ? merged.geometry.coordinates.length : 1;
      const km2 = turf.area(merged) / 1e6;
      setResult(
        `✓ Merged ${polygons.length} polygons → ${parts} part(s), ${km2.toFixed(3)} km²` +
          (parts > 1 ? '\n(the polygons do not all touch, so the union is a multi-polygon)' : ''),
      );
      return;
    }

    if (tool === 'split') {
      if (!target || !splitter) {
        setError('Pick a line to split and a line to split it with.');
        return;
      }
      if (target.id === splitter.id) {
        setError('Pick two different lines.');
        return;
      }
      if (target.type !== 'LineString' || splitter.type !== 'LineString') {
        setError('Split takes two drawn lines.');
        return;
      }
      const pieces = turf.lineSplit(
        turf.lineString(target.coords),
        turf.lineString(splitter.coords),
      );
      if (pieces.features.length < 2) {
        setError('The two lines do not cross, so there is nothing to split.');
        return;
      }
      ctx.map.addGeoJsonLayer('sketch-split', pieces, { color: '#e74c3c', lineWidth: 3, filled: false });
      const lengths = pieces.features.map((p) => turf.length(p, { units: 'meters' }).toFixed(1));
      setResult(`✓ Split into ${pieces.features.length} pieces: ${lengths.join(' m, ')} m`);
      return;
    }

    if (!target) {
      setError('Pick a drawn feature first.');
      return;
    }
    // the picker keeps its value across tool switches, so re-check the type
    if (needsLine && target.type !== 'LineString') {
      setError('This tool takes a drawn line.');
      return;
    }

    switch (tool) {
      case 'offset': {
        const line = turf.lineString(target.coords);
        const offsetLine = turf.lineOffset(line, offsetDist, { units: 'meters' });
        ctx.map.addGeoJsonLayer('sketch-offset', offsetLine, { color: '#e74c3c', lineWidth: 2, filled: false });
        setResult(`✓ Parallel offset at ${offsetDist} m of the ${target.coords.length}-vertex line`);
        break;
      }
      case 'smooth': {
        // bezier spline through the drawn vertices
        const smoothed = turf.bezierSpline(turf.lineString(target.coords), {
          resolution: 10000,
          sharpness: smoothFactor,
        });
        ctx.map.addGeoJsonLayer('sketch-smooth', smoothed, { color: '#2ecc71', lineWidth: 2, filled: false });
        setResult(`✓ Smoothed with sharpness ${smoothFactor.toFixed(2)} → ${smoothed.geometry.coordinates.length} vertices`);
        break;
      }
      case 'densify': {
        const line = turf.lineString(target.coords);
        // add a vertex every N meters along the line, keeping the end point
        const length = turf.length(line, { units: 'meters' });
        const points: number[][] = [];
        for (let d = 0; d < length; d += densifyInterval) {
          points.push(turf.along(line, d, { units: 'meters' }).geometry.coordinates);
        }
        points.push(target.coords[target.coords.length - 1]);
        const densified = turf.lineString(points);
        ctx.map.addGeoJsonLayer('sketch-densify', densified, { color: '#9b59b6', lineWidth: 2, filled: false });
        setResult(`✓ Densified: ${target.coords.length} → ${points.length} vertices (every ${densifyInterval} m)`);
        break;
      }
      case 'simplify': {
        const feature = drawnGeoJson(target);
        if (feature.geometry.type === 'Point') {
          setError('Simplify needs a line or a polygon.');
          return;
        }
        // turf tolerance is in degrees, the input is meters
        const simplified = turf.simplify(feature, {
          tolerance: simplifyTolerance / 111_320,
          highQuality: true,
        });
        const before = target.coords.length;
        const geom = simplified.geometry;
        const after =
          geom.type === 'Polygon' ? geom.coordinates[0].length : geom.type === 'LineString' ? geom.coordinates.length : 0;
        ctx.map.addGeoJsonLayer('sketch-simplify', simplified, {
          color: '#f1c40f',
          lineWidth: 2,
          filled: geom.type === 'Polygon',
        });
        setResult(`✓ Simplified at ${simplifyTolerance} m: ${before} → ${after} vertices`);
        break;
      }
    }
  };

  return (
    <Paper p="md" withBorder style={{ width: 360 }}>
      <Stack gap="sm">
        <Group justify="space-between">
          <Text fw={600} size="lg">Advanced Sketching</Text>
          <Badge size="sm" color="pink">Edit</Badge>
        </Group>

        <Text size="xs" c="dimmed">
          Works on the features from the draw tool: {drawn.length} drawn ({polygons.length} polygons, {lines.length} lines).
        </Text>

        <Select
          label="Tool"
          data={[
            { group: 'Topology', items: [
              { value: 'merge', label: '🔗 Merge Polygons (union)' },
              { value: 'split', label: '✂️ Split Line by Line' },
              { value: 'reshape', label: '✏️ Reshape Boundary' },
              { value: 'extend-trim', label: '↔️ Extend / Trim' },
            ]},
            { group: 'Geometry', items: [
              { value: 'offset', label: '↕️ Parallel Offset' },
              { value: 'smooth', label: '〰️ Smooth (Bezier)' },
              { value: 'densify', label: '••• Densify Vertices' },
              { value: 'simplify', label: '📐 Simplify (Douglas-Peucker)' },
              { value: 'orthogonalize', label: '⊾ Orthogonalize (90°)' },
            ]},
            { group: 'Snapping', items: [
              { value: 'snap', label: '🧲 Configure Snapping' },
            ]},
          ]}
          value={tool}
          onChange={(v) => setTool((v || 'merge') as SketchTool)}
        />

        {unimplemented && <Alert color="gray" p="xs"><Text size="xs">{unimplemented}</Text></Alert>}

        {!unimplemented && tool === 'merge' && (
          <Text size="xs" c="dimmed">Unions all {polygons.length} drawn polygons.</Text>
        )}

        {(needsLine || needsTwoLines) && (
          <Select
            label={needsTwoLines ? 'Line to split' : 'Line'}
            data={lines}
            value={targetId}
            onChange={setTargetId}
            placeholder={lines.length ? 'Pick a drawn line' : 'Draw a line first'}
          />
        )}

        {needsTwoLines && (
          <Select
            label="Split with line"
            data={lines}
            value={splitterId}
            onChange={setSplitterId}
            placeholder={lines.length ? 'Pick a drawn line' : 'Draw a line first'}
          />
        )}

        {needsAnyFeature && (
          <Select
            label="Feature"
            data={[...lines, ...pickerOptions(drawn, 'Polygon')]}
            value={targetId}
            onChange={setTargetId}
            placeholder={drawn.length ? 'Pick a drawn feature' : 'Draw something first'}
          />
        )}

        {tool === 'offset' && (
          <NumberInput label="Offset Distance (m)" value={offsetDist} onChange={(v) => setOffsetDist(Number(v))} min={1} max={1000} />
        )}

        {tool === 'smooth' && (
          <>
            <Text size="xs" c="dimmed">Smoothness: {smoothFactor.toFixed(2)}</Text>
            <Slider value={smoothFactor} onChange={setSmoothFactor} min={0.1} max={1} step={0.05} />
          </>
        )}

        {tool === 'densify' && (
          <NumberInput label="Vertex Interval (m)" value={densifyInterval} onChange={(v) => setDensifyInterval(Number(v))} min={1} max={1000} />
        )}

        {tool === 'simplify' && (
          <NumberInput label="Tolerance (m)" value={simplifyTolerance} onChange={(v) => setSimplifyTolerance(Number(v))} min={1} max={10000} />
        )}

        <Button
          leftSection={<IconPencil size={14} />}
          onClick={handleApply}
          disabled={!!unimplemented}
          fullWidth
          color="pink"
        >
          {unimplemented ? 'Not implemented' : 'Apply Tool'}
        </Button>

        {error && <Alert color="yellow" p="xs"><Text size="xs">{error}</Text></Alert>}
        {result && <Code block>{result}</Code>}
      </Stack>
    </Paper>
  );
}

const plugin: PluginDefinition = {
  id: 'sketching',
  name: 'Advanced Sketching',
  description: 'Turf edits on drawn features: merge, split, offset, smooth, densify, simplify',
  version: '1.0.0',
  author: 'TileTopia-HQ',
  icon: <IconPencil size={14} />,
  category: 'tools',
  Panel: AdvancedSketchingPanel,
};

export default plugin;
