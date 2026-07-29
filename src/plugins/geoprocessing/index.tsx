/**
 * Geoprocessing Plugin — Buffer, dissolve, intersect, union, clip, difference, voronoi.
 * Equivalent to: QGIS mmqgis + native geoprocessing (1.7M downloads)
 * Uses Turf.js for all geometry operations.
 */

import { useState } from 'react';
import { Paper, Text, Stack, Select, Button, Group, Badge, NumberInput, Loader, Code, } from '@mantine/core';
import { IconVectorTriangle } from '@tabler/icons-react';
import * as turf from '@turf/turf';
import { useGeoJsonSources, propertyKeys, type GeoJsonSource } from '../../lib/geojsonSources';
import type { PluginDefinition, PluginContext } from '../sdk';

type GeoOp = 'buffer' | 'dissolve' | 'intersect' | 'union' | 'difference' | 'convex-hull' | 'voronoi' | 'centroid' | 'simplify' | 'explode' | 'collect' | 'bbox-clip';

/** Ops that combine two sources; the rest run on the input alone. */
const OVERLAY_OPS: GeoOp[] = ['intersect', 'union', 'difference', 'bbox-clip', 'collect'];

interface OpParams {
  bufferDist: number;
  bufferUnits: turf.Units;
  simplifyTol: number;
  /** dissolve: group-by field; collect: point field to aggregate. */
  field: string;
}

type Poly = GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
type Clippable = GeoJSON.Feature<
  GeoJSON.Polygon | GeoJSON.MultiPolygon | GeoJSON.LineString | GeoJSON.MultiLineString
>;

function polygonsOf(fc: GeoJSON.FeatureCollection): Poly[] {
  return fc.features.filter(
    (f): f is Poly => f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon',
  );
}

function pointsOf(fc: GeoJSON.FeatureCollection): GeoJSON.Feature<GeoJSON.Point>[] {
  return fc.features.filter(
    (f): f is GeoJSON.Feature<GeoJSON.Point> => f.geometry?.type === 'Point',
  );
}

function clippablesOf(fc: GeoJSON.FeatureCollection): Clippable[] {
  return fc.features.filter(
    (f): f is Clippable =>
      f.geometry?.type === 'Polygon' ||
      f.geometry?.type === 'MultiPolygon' ||
      f.geometry?.type === 'LineString' ||
      f.geometry?.type === 'MultiLineString',
  );
}

/** Merge a source's polygons into one feature, so overlay ops work on whole layers. */
function mergedPolygon(source: GeoJsonSource, label: string): Poly {
  const polys = polygonsOf(source.geojson);
  if (polys.length === 0) throw new Error(`${label} "${source.name}" has no polygons`);
  const merged = polys.length === 1 ? polys[0] : turf.union(turf.featureCollection(polys));
  if (!merged) throw new Error(`${label} "${source.name}" merged to an empty geometry`);
  return merged;
}

function asCollection(
  out: GeoJSON.FeatureCollection | GeoJSON.Feature,
): GeoJSON.FeatureCollection {
  return out.type === 'FeatureCollection' ? out : turf.featureCollection([out]);
}

/** Run one turf operation over the selected sources. Throws with a usable message. */
export function runOperation(
  operation: GeoOp,
  input: GeoJsonSource,
  overlay: GeoJsonSource | undefined,
  params: OpParams,
): GeoJSON.FeatureCollection {
  const fc = input.geojson;
  if (fc.features.length === 0) throw new Error(`"${input.name}" has no features`);
  if (OVERLAY_OPS.includes(operation) && !overlay) throw new Error('select an overlay layer');

  switch (operation) {
    case 'buffer': {
      const out = turf.buffer(fc, params.bufferDist, { units: params.bufferUnits });
      if (!out) throw new Error('buffer produced no geometry');
      return out;
    }
    case 'simplify':
      return turf.simplify(fc, { tolerance: params.simplifyTol, highQuality: true });
    case 'convex-hull': {
      const hull = turf.convex(fc);
      if (!hull) throw new Error('convex hull needs at least three distinct vertices');
      return asCollection(hull);
    }
    case 'centroid':
      return turf.featureCollection(fc.features.map((f) => turf.centroid(f, { properties: f.properties ?? {} })));
    case 'explode':
      return turf.explode(fc);
    case 'voronoi': {
      const points = turf.explode(fc);
      const bbox = turf.bbox(fc) as [number, number, number, number];
      return turf.voronoi(points, { bbox });
    }
    case 'dissolve': {
      const polys = fc.features.filter(
        (f): f is GeoJSON.Feature<GeoJSON.Polygon> => f.geometry?.type === 'Polygon',
      );
      if (polys.length === 0) throw new Error(`"${input.name}" has no simple polygons to dissolve`);
      return turf.dissolve(turf.featureCollection(polys), {
        propertyName: params.field || undefined,
      });
    }
    case 'intersect':
    case 'union':
    case 'difference': {
      const a = mergedPolygon(input, 'input layer');
      const b = mergedPolygon(overlay as GeoJsonSource, 'overlay layer');
      const pair = turf.featureCollection([a, b]);
      const out =
        operation === 'intersect'
          ? turf.intersect(pair)
          : operation === 'union'
            ? turf.union(pair)
            : turf.difference(pair);
      if (!out) throw new Error(`${operation} produced no geometry (the layers may not overlap)`);
      return asCollection(out);
    }
    case 'bbox-clip': {
      const bbox = turf.bbox((overlay as GeoJsonSource).geojson) as [number, number, number, number];
      const clippable = clippablesOf(fc);
      if (clippable.length === 0) throw new Error(`"${input.name}" has no lines or polygons to clip`);
      const clipped: GeoJSON.Feature[] = clippable
        .map((f) => turf.bboxClip(f, bbox))
        .filter((f) => turf.coordAll(f).length > 0);
      if (clipped.length === 0) throw new Error('nothing left after clipping to the overlay bounds');
      return turf.featureCollection(clipped);
    }
    case 'collect': {
      if (!params.field) throw new Error('pick the point field to collect');
      const polys = fc.features.filter(
        (f): f is GeoJSON.Feature<GeoJSON.Polygon> => f.geometry?.type === 'Polygon',
      );
      if (polys.length === 0) throw new Error(`"${input.name}" has no simple polygons`);
      const points = pointsOf((overlay as GeoJsonSource).geojson);
      if (points.length === 0) throw new Error(`overlay layer "${(overlay as GeoJsonSource).name}" has no points`);
      return turf.collect(
        turf.featureCollection(polys),
        turf.featureCollection(points),
        params.field,
        `${params.field}_collected`,
      );
    }
  }
}

function GeoprocessingPanel({ ctx }: { ctx: PluginContext }) {
  const [operation, setOperation] = useState<GeoOp>('buffer');
  const [inputLayer, setInputLayer] = useState<string | null>(null);
  const [overlayLayer, setOverlayLayer] = useState<string | null>(null);
  const [bufferDist, setBufferDist] = useState<number>(100);
  const [bufferUnits, setBufferUnits] = useState<string>('meters');
  const [simplifyTol, setSimplifyTol] = useState<number>(0.001);
  const [field, setField] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  // real geojson to run on: whatever is drawn, plus the loaded and plugin layers
  const sources = useGeoJsonSources();
  const input = sources.find((s) => s.id === inputLayer);
  const overlay = sources.find((s) => s.id === overlayLayer);

  const needsOverlay = OVERLAY_OPS.includes(operation);
  // collect aggregates a field off the overlay points, dissolve groups the input
  const fieldOptions = propertyKeys(operation === 'collect' ? overlay : input);

  const handleRun = async () => {
    if (!input) return;
    setLoading(true);
    setResult(null);

    try {
      const output = runOperation(operation, input, overlay, {
        bufferDist,
        bufferUnits: bufferUnits as turf.Units,
        simplifyTol,
        field,
      });
      const layerId = `geoprocess-${operation}`;
      ctx.map.addGeoJsonLayer(layerId, output, { color: '#9b59b6', lineWidth: 2 });
      setResult(`✓ ${operation}: ${output.features.length} features → layer "${layerId}"`);
    } catch (e) {
      setResult(`✗ Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Paper p="md" withBorder style={{ width: 360 }}>
      <Stack gap="sm">
        <Group justify="space-between">
          <Text fw={600} size="lg">Geoprocessing</Text>
          <Badge size="sm" color="grape">Turf.js</Badge>
        </Group>

        <Select
          label="Operation"
          data={[
            { group: 'Geometry', items: [
              { value: 'buffer', label: 'Buffer' },
              { value: 'simplify', label: 'Simplify' },
              { value: 'convex-hull', label: 'Convex Hull' },
              { value: 'centroid', label: 'Centroids' },
              { value: 'explode', label: 'Explode to Points' },
              { value: 'voronoi', label: 'Voronoi Polygons' },
            ]},
            { group: 'Overlay', items: [
              { value: 'intersect', label: 'Intersect' },
              { value: 'union', label: 'Union' },
              { value: 'difference', label: 'Difference (Erase)' },
              { value: 'bbox-clip', label: 'Clip to Overlay Bounds' },
            ]},
            { group: 'Aggregation', items: [
              { value: 'dissolve', label: 'Dissolve' },
              { value: 'collect', label: 'Collect' },
            ]},
          ]}
          value={operation}
          onChange={(v) => setOperation((v || 'buffer') as GeoOp)}
        />

        {sources.length === 0 ? (
          <Text size="sm" c="dimmed">Draw or load features first — there is nothing to process yet.</Text>
        ) : (
          <>
            <Select
              label="Input Layer"
              data={sources.map((s) => ({ value: s.id, label: s.name }))}
              value={inputLayer}
              onChange={setInputLayer}
              placeholder="Select input layer"
            />

            {needsOverlay && (
              <Select
                label="Overlay Layer"
                data={sources.map((s) => ({ value: s.id, label: s.name }))}
                value={overlayLayer}
                onChange={setOverlayLayer}
                placeholder="Select overlay layer"
              />
            )}
          </>
        )}

        {operation === 'buffer' && (
          <Group grow>
            <NumberInput label="Distance" value={bufferDist} onChange={(v) => setBufferDist(Number(v))} min={0} />
            <Select
              label="Units"
              data={['meters', 'kilometers', 'miles', 'feet', 'yards', 'nauticalMiles']}
              value={bufferUnits}
              onChange={(v) => setBufferUnits(v || 'meters')}
            />
          </Group>
        )}

        {operation === 'simplify' && (
          <NumberInput label="Tolerance" value={simplifyTol} onChange={(v) => setSimplifyTol(Number(v))} step={0.001} decimalScale={4} />
        )}

        {(operation === 'dissolve' || operation === 'collect') && (
          <Select
            label={operation === 'dissolve' ? 'Dissolve Field' : 'Point Field to Collect'}
            data={fieldOptions}
            value={field || null}
            onChange={(v) => setField(v || '')}
            placeholder={fieldOptions.length ? 'select a field' : 'the selected layer has no fields'}
            clearable
          />
        )}

        <Button
          leftSection={loading ? <Loader size={14} /> : <IconVectorTriangle size={14} />}
          onClick={handleRun}
          disabled={loading || !input || (needsOverlay && !overlay)}
          fullWidth
          color="grape"
        >
          {loading ? 'Processing...' : `Run ${operation}`}
        </Button>

        {result && <Code block>{result}</Code>}
      </Stack>
    </Paper>
  );
}

const plugin: PluginDefinition = {
  id: 'geoprocessing',
  name: 'Geoprocessing',
  description: 'Vector geoprocessing tools: buffer, dissolve, intersect, union, difference, voronoi, simplify',
  version: '1.0.0',
  author: 'TileTopia-HQ',
  icon: <IconVectorTriangle size={14} />,
  category: 'analysis',
  Panel: GeoprocessingPanel,
};

export default plugin;
