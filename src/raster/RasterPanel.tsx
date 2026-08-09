/**
 * RasterPanel — load a GeoTIFF/COG in the browser and run raster analysis on
 * it, computed by terrano-core over wasm in a worker (engine.ts). Results
 * preview inline and can drape onto the map when the raster is EPSG:4326.
 */
import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Divider,
  FileInput,
  Group,
  NumberInput,
  Paper,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import {
  IconCalculator,
  IconChartHistogram,
  IconGridDots,
  IconLeaf,
  IconLink,
  IconMap,
  IconMountain,
  IconSatellite,
  IconStack2,
  IconTopologyRing3,
  IconUpload,
  IconVector,
} from '@tabler/icons-react';
import { PanelHeader } from '../components/PanelCard';
import { loadCogFromUrl, loadCogFromBuffer, type LoadedRaster } from './loader';
import { computeBandMath, computeStats } from './operations';
import * as engine from './engine';
import { cellSizeMeters } from './terrano';
import { INDEX_PRESETS } from './indices';
import { equalIntervals, ReclassEditor, type ReclassClass } from './ReclassEditor';
import { ZonalTable } from './ZonalTable';
import { useAgentLayerStore } from '../store/agentLayers';
import { renderToDataUrl } from './renderer';
import { cornersOfBbox } from '../overlay/georeference';
import type { RasterResult, ColorRamp, FocalStat, Neighborhood, ZonalResult } from './types';

/** a run that produced features rather than a grid: contours, polygonize */
interface VectorResult {
  name: string;
  geojson: GeoJSON.FeatureCollection;
  summary: string;
  detail: string;
  color: string;
}

export function RasterPanel({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState('');
  const [raster, setRaster] = useState<LoadedRaster | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RasterResult | null>(null);
  const [vector, setVector] = useState<VectorResult | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [colorRamp, setColorRamp] = useState<ColorRamp>('viridis');

  // Operation params
  const [indexKey, setIndexKey] = useState('ndvi');
  const [indexBands, setIndexBands] = useState<number[]>(INDEX_PRESETS.ndvi.defaults);
  const [reclassInput, setReclassInput] = useState('0');
  const [polygonInput, setPolygonInput] = useState('0');
  const [focalInput, setFocalInput] = useState('0');
  const [focalStat, setFocalStat] = useState<FocalStat>('mean');
  const [focalShape, setFocalShape] = useState<Neighborhood>('square');
  const [focalRadius, setFocalRadius] = useState(1);
  const [zonalValues, setZonalValues] = useState('0');
  const [zonalZones, setZonalZones] = useState('0');
  const [zonalRows, setZonalRows] = useState<ZonalResult[] | null>(null);
  const [zonalLabels, setZonalLabels] = useState<string[] | null>(null);
  const [reclassCount, setReclassCount] = useState(5);
  const [reclassClasses, setReclassClasses] = useState<ReclassClass[]>([]);
  const [azimuth, setAzimuth] = useState(315);
  const [altitude, setAltitude] = useState(45);
  const [zFactor, setZFactor] = useState(1);
  const [slopeUnits, setSlopeUnits] = useState<'degrees' | 'percent'>('degrees');
  const [bandMathExpr, setBandMathExpr] = useState('(b4 - b3) / (b4 + b3)');
  const [contourInterval, setContourInterval] = useState(10);

  const mapLayers = useAgentLayerStore((s) => s.layers);
  const addRasterLayer = useAgentLayerStore((s) => s.addRasterLayer);
  const addVectorLayer = useAgentLayerStore((s) => s.addLayer);

  // a layer is placed by its lon/lat bbox, so any other frame stays inline
  const canMap = raster?.metadata.crs === 'EPSG:4326';

  const preset = INDEX_PRESETS[indexKey];
  // preset defaults assume a Landsat-style stack, so a narrower raster clamps
  // rather than indexing a band that isn't there
  const bandCount = raster?.metadata.bands ?? 0;
  const pickedBands = indexBands.map((b) => Math.min(b, Math.max(0, bandCount - 1)));
  // reclass and polygonize read a source band or whatever the panel last
  // computed, which is how a slope raster gets binned and a reclass gets
  // turned into features
  const sourceOptions = [
    ...Array.from({ length: bandCount }, (_, i) => ({
      value: String(i),
      label: `Band ${i + 1}`,
    })),
    ...(result ? [{ value: 'result', label: `Result: ${result.operation}` }] : []),
  ];
  const sourceData = (input: string) =>
    input === 'result' ? (result?.data ?? null) : (raster?.bands[Number(input)] ?? null);
  const reclassData = sourceData(reclassInput);
  // zones can also come from a polygon layer already on the map, which burns
  // onto the raster's grid before the summary runs
  const polygonLayers = mapLayers.filter((l) =>
    l.geojson.features.some(
      (f) => f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon',
    ),
  );
  const zoneOptions = [
    ...sourceOptions,
    ...polygonLayers.map((l) => ({ value: `layer:${l.id}`, label: l.name })),
  ];

  async function handleLoadUrl() {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const loaded = await loadCogFromUrl(url, { maxDimension: 1024 });
      setRaster(loaded);
      setResult(null);
      setResultImage(null);
      setVector(null);
      setZonalRows(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load raster');
    } finally {
      setLoading(false);
    }
  }

  async function handleLoadFile(file: File | null) {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const buffer = await file.arrayBuffer();
      const loaded = await loadCogFromBuffer(buffer, { maxDimension: 1024 });
      setRaster(loaded);
      setResult(null);
      setResultImage(null);
      setVector(null);
      setZonalRows(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load raster');
    } finally {
      setLoading(false);
    }
  }

  async function runAnalysis(op: string) {
    if (!raster) return;
    const { bands, metadata } = raster;
    const { width, height, noData, bbox } = metadata;
    const cellSize = cellSizeMeters(metadata);

    setRunning(op);
    setError(null);
    try {
      let res: RasterResult;
      switch (op) {
        case 'index': {
          res = preset.expression
            ? computeBandMath(bands, width, height, {
                expression: preset.expression(pickedBands.map((b) => b + 1)),
                operation: preset.operation,
                colorMap: preset.ramp,
              }, noData)
            : await engine.normalizedDifference(
                bands[pickedBands[0]],
                bands[pickedBands[1]],
                width,
                height,
                noData,
                preset.operation,
                preset.ramp,
              );
          break;
        }
        case 'reclass': {
          if (!reclassData) throw new Error('no input to reclassify');
          if (reclassClasses.length === 0) throw new Error('add at least one class');
          res = await engine.reclass(reclassData, width, height, reclassClasses, noData);
          break;
        }
        case 'hillshade':
          res = await engine.hillshade(
            bands[0],
            width,
            height,
            cellSize,
            zFactor,
            azimuth,
            altitude,
            noData,
          );
          break;
        case 'slope':
          res = await engine.slope(bands[0], width, height, cellSize, zFactor, slopeUnits, noData);
          break;
        case 'aspect':
          res = await engine.aspect(bands[0], width, height, cellSize, noData);
          break;
        case 'band-math':
          res = computeBandMath(bands, width, height, { expression: bandMathExpr }, noData);
          break;
        case 'contours': {
          const c = await engine.contours(
            bands[0],
            width,
            height,
            bbox,
            contourInterval,
            0,
            noData,
          );
          setVector({
            name: 'contours',
            geojson: c.geojson,
            summary: `${c.geojson.features.length} contour lines`,
            detail: `Elevation ${c.elevationRange[0].toFixed(0)}–${c.elevationRange[1].toFixed(0)}`,
            color: '#f59e0b',
          });
          setResult(null);
          setResultImage(null);
          return;
        }
        case 'focal': {
          const data = sourceData(focalInput);
          if (!data) throw new Error('no input for focal statistics');
          res = await engine.focalStats(
            data,
            width,
            height,
            focalRadius,
            focalShape,
            focalStat,
            noData,
          );
          break;
        }
        case 'zonal': {
          const values = sourceData(zonalValues);
          if (!values) throw new Error('no values to summarize');
          if (zonalZones.startsWith('layer:')) {
            const layer = mapLayers.find((l) => l.id === zonalZones.slice('layer:'.length));
            if (!layer) throw new Error('that layer is no longer on the map');
            setZonalRows(
              await engine.zonalStatsByPolygons(
                values,
                layer.geojson.features,
                width,
                height,
                bbox,
                noData,
              ),
            );
            setZonalLabels(
              layer.geojson.features.map(
                (f, i) => String(f.properties?.name ?? f.properties?.label ?? `Feature ${i + 1}`),
              ),
            );
          } else {
            const zones = sourceData(zonalZones);
            if (!zones) throw new Error('no zones to group by');
            setZonalRows(await engine.zonalStats(values, zones, width, height, noData));
            setZonalLabels(null);
          }
          return;
        }
        case 'polygonize': {
          const data = sourceData(polygonInput);
          if (!data) throw new Error('no input to polygonize');
          const p = await engine.polygonize(data, width, height, bbox, noData);
          setVector({
            name: 'polygons',
            geojson: p.geojson,
            summary: `${p.regions} polygons`,
            detail: 'one feature per connected run of equal cells',
            color: '#38bdf8',
          });
          setResult(null);
          setResultImage(null);
          return;
        }
        default:
          return;
      }

      res.bbox = bbox;
      setResult(res);
      setVector(null);
      setResultImage(renderToDataUrl(res, { ramp: colorRamp }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setRunning(null);
    }
  }

  /**
   * Hand the result to the layer store, which every renderer draws from, so it
   * survives a renderer switch and stacks with the runs before it instead of
   * replacing the one drape this panel used to own.
   */
  const addAsLayer = () => {
    if (result && resultImage) {
      addRasterLayer({
        id: crypto.randomUUID(),
        name: result.operation,
        url: resultImage,
        corners: cornersOfBbox(result.bbox),
        opacity: 0.8,
        visible: true,
      });
    } else if (vector) {
      addVectorLayer({
        id: crypto.randomUUID(),
        name: vector.name,
        color: vector.color,
        geojson: vector.geojson,
      });
    }
  };

  return (
    <Paper
      shadow="xl"
      radius="md"
      p="sm"
      style={{
        position: 'absolute',
        top: 60,
        right: 16,
        width: 320,
        maxHeight: 'calc(100vh - 120px)',
        overflowY: 'auto',
        background: 'var(--mantine-color-dark-7)',
        border: '1px solid var(--mantine-color-dark-5)',
        zIndex: 300,
      }}
    >
      <PanelHeader
        icon={<IconSatellite size={16} />}
        title="Raster Analysis"
        onClose={onClose}
      />

      <Stack gap="xs">
        <Group gap="xs" wrap="nowrap">
          <TextInput
            placeholder="https://example.com/dem.tif"
            value={url}
            onChange={(e) => setUrl(e.currentTarget.value)}
            size="xs"
            style={{ flex: 1 }}
            leftSection={<IconLink size={14} />}
          />
          <Button size="xs" onClick={handleLoadUrl} loading={loading}>
            Load
          </Button>
        </Group>
        <FileInput
          size="xs"
          placeholder="Or pick a .tif file"
          accept=".tif,.tiff"
          leftSection={<IconUpload size={14} />}
          onChange={handleLoadFile}
        />

        {error && (
          <Alert color="red" variant="light" p="xs">
            <Text size="xs">{error}</Text>
          </Alert>
        )}

        {raster && (
          <Group gap={8}>
            <Badge size="xs" color="green">
              Loaded
            </Badge>
            <Text size="xs" c="dimmed">
              {raster.metadata.width}×{raster.metadata.height} · {raster.metadata.bands} band
              {raster.metadata.bands === 1 ? '' : 's'} · {raster.metadata.crs}
            </Text>
          </Group>
        )}

        {raster && (
          <>
            <Divider label="Operations" labelPosition="center" />

            {raster.metadata.bands >= 2 && (
              <Paper p="xs" withBorder bg="var(--mantine-color-dark-8)">
                <Group justify="space-between" mb={4}>
                  <Group gap={4}>
                    <IconLeaf size={14} />
                    <Text size="xs" fw={500} c="white">
                      Spectral Index
                    </Text>
                  </Group>
                  <Button
                    size="xs"
                    variant="light"
                    color="green"
                    aria-label="Run index"
                    onClick={() => runAnalysis('index')}
                    loading={running === 'index'}
                  >
                    Run
                  </Button>
                </Group>
                <Select
                  aria-label="Index preset"
                  size="xs"
                  data={Object.entries(INDEX_PRESETS).map(([value, p]) => ({
                    value,
                    label: p.label,
                  }))}
                  value={indexKey}
                  onChange={(v) => {
                    const key = v ?? 'ndvi';
                    setIndexKey(key);
                    setIndexBands(INDEX_PRESETS[key].defaults);
                  }}
                  mb={4}
                />
                <Group gap={8}>
                  {preset.roles.map((role, i) => (
                    <NumberInput
                      key={role}
                      label={`${role} band`}
                      value={pickedBands[i] + 1}
                      onChange={(v) =>
                        setIndexBands(indexBands.map((b, j) => (j === i ? Number(v) - 1 : b)))
                      }
                      size="xs"
                      w={72}
                      min={1}
                      max={raster.metadata.bands}
                    />
                  ))}
                </Group>
                {preset.hint && (
                  <Text size="xs" c="dimmed" mt={4}>
                    {preset.hint}
                  </Text>
                )}
              </Paper>
            )}

            <Paper p="xs" withBorder bg="var(--mantine-color-dark-8)">
              <Group justify="space-between" mb={4}>
                <Group gap={4}>
                  <IconMountain size={14} />
                  <Text size="xs" fw={500} c="white">
                    Hillshade
                  </Text>
                </Group>
                <Button
                  size="xs"
                  variant="light"
                  aria-label="Run hillshade"
                  onClick={() => runAnalysis('hillshade')}
                  loading={running === 'hillshade'}
                >
                  Run
                </Button>
              </Group>
              <Group gap={8}>
                <NumberInput
                  label="Azimuth"
                  value={azimuth}
                  onChange={(v) => setAzimuth(Number(v))}
                  size="xs"
                  w={80}
                  min={0}
                  max={360}
                />
                <NumberInput
                  label="Altitude"
                  value={altitude}
                  onChange={(v) => setAltitude(Number(v))}
                  size="xs"
                  w={80}
                  min={0}
                  max={90}
                />
                <NumberInput
                  label="Z Factor"
                  value={zFactor}
                  onChange={(v) => setZFactor(Number(v))}
                  size="xs"
                  w={80}
                  min={0.1}
                  step={0.1}
                />
              </Group>
            </Paper>

            <Paper p="xs" withBorder bg="var(--mantine-color-dark-8)">
              <Group justify="space-between" mb={4}>
                <Text size="xs" fw={500} c="white">
                  Slope
                </Text>
                <Button
                  size="xs"
                  variant="light"
                  aria-label="Run slope"
                  onClick={() => runAnalysis('slope')}
                  loading={running === 'slope'}
                >
                  Run
                </Button>
              </Group>
              <Select
                label="Units"
                data={[
                  { value: 'degrees', label: 'Degrees' },
                  { value: 'percent', label: 'Percent' },
                ]}
                value={slopeUnits}
                onChange={(v) => setSlopeUnits((v as 'degrees' | 'percent') ?? 'degrees')}
                size="xs"
                w={120}
              />
            </Paper>

            <Paper p="xs" withBorder bg="var(--mantine-color-dark-8)">
              <Group justify="space-between">
                <Text size="xs" fw={500} c="white">
                  Aspect
                </Text>
                <Button
                  size="xs"
                  variant="light"
                  aria-label="Run aspect"
                  onClick={() => runAnalysis('aspect')}
                  loading={running === 'aspect'}
                >
                  Run
                </Button>
              </Group>
            </Paper>

            <Paper p="xs" withBorder bg="var(--mantine-color-dark-8)">
              <Group justify="space-between" mb={4}>
                <Group gap={4}>
                  <IconCalculator size={14} />
                  <Text size="xs" fw={500} c="white">
                    Band Math
                  </Text>
                </Group>
                <Button
                  size="xs"
                  variant="light"
                  color="violet"
                  aria-label="Run band math"
                  onClick={() => runAnalysis('band-math')}
                  loading={running === 'band-math'}
                >
                  Run
                </Button>
              </Group>
              <Textarea
                size="xs"
                placeholder="(b4 - b3) / (b4 + b3)"
                value={bandMathExpr}
                onChange={(e) => setBandMathExpr(e.currentTarget.value)}
                minRows={1}
                autosize
              />
              <Text size="xs" c="dimmed" mt={4}>
                b1, b2, … are bands; + - * / and Math.* work.
              </Text>
            </Paper>

            <Paper p="xs" withBorder bg="var(--mantine-color-dark-8)">
              <Group justify="space-between" mb={4}>
                <Group gap={4}>
                  <IconTopologyRing3 size={14} />
                  <Text size="xs" fw={500} c="white">
                    Contours
                  </Text>
                </Group>
                <Button
                  size="xs"
                  variant="light"
                  color="teal"
                  aria-label="Run contours"
                  onClick={() => runAnalysis('contours')}
                  loading={running === 'contours'}
                >
                  Run
                </Button>
              </Group>
              <NumberInput
                label="Interval"
                value={contourInterval}
                onChange={(v) => setContourInterval(Number(v))}
                size="xs"
                w={100}
                min={1}
              />
            </Paper>

            <Paper p="xs" withBorder bg="var(--mantine-color-dark-8)">
              <Group justify="space-between" mb={4}>
                <Group gap={4}>
                  <IconStack2 size={14} />
                  <Text size="xs" fw={500} c="white">
                    Reclass
                  </Text>
                </Group>
                <Button
                  size="xs"
                  variant="light"
                  color="orange"
                  aria-label="Run reclass"
                  onClick={() => runAnalysis('reclass')}
                  loading={running === 'reclass'}
                >
                  Run
                </Button>
              </Group>
              <Group gap={8} align="flex-end" mb={4}>
                <Select
                  aria-label="Reclass input"
                  label="Input"
                  size="xs"
                  w={110}
                  data={sourceOptions}
                  value={reclassInput}
                  onChange={(v) => setReclassInput(v ?? '0')}
                />
                <NumberInput
                  label="Classes"
                  value={reclassCount}
                  onChange={(v) => setReclassCount(Number(v))}
                  size="xs"
                  w={70}
                  min={1}
                  max={20}
                />
                <Button
                  size="xs"
                  variant="default"
                  disabled={!reclassData}
                  onClick={() => {
                    if (!reclassData) return;
                    const { min, max } = computeStats(reclassData);
                    setReclassClasses(equalIntervals(min, max, reclassCount));
                  }}
                >
                  Fill
                </Button>
              </Group>
              <ReclassEditor classes={reclassClasses} onChange={setReclassClasses} />
            </Paper>

            <Paper p="xs" withBorder bg="var(--mantine-color-dark-8)">
              <Group justify="space-between" mb={4}>
                <Group gap={4}>
                  <IconVector size={14} />
                  <Text size="xs" fw={500} c="white">
                    Polygonize
                  </Text>
                </Group>
                <Button
                  size="xs"
                  variant="light"
                  color="cyan"
                  aria-label="Run polygonize"
                  onClick={() => runAnalysis('polygonize')}
                  loading={running === 'polygonize'}
                >
                  Run
                </Button>
              </Group>
              <Select
                aria-label="Polygonize input"
                label="Input"
                size="xs"
                w={140}
                data={sourceOptions}
                value={polygonInput}
                onChange={(v) => setPolygonInput(v ?? '0')}
              />
              <Text size="xs" c="dimmed" mt={4}>
                Traces equal-valued cells, so reclass first.
              </Text>
            </Paper>

            <Paper p="xs" withBorder bg="var(--mantine-color-dark-8)">
              <Group justify="space-between" mb={4}>
                <Group gap={4}>
                  <IconGridDots size={14} />
                  <Text size="xs" fw={500} c="white">
                    Focal Statistics
                  </Text>
                </Group>
                <Button
                  size="xs"
                  variant="light"
                  color="grape"
                  aria-label="Run focal statistics"
                  onClick={() => runAnalysis('focal')}
                  loading={running === 'focal'}
                >
                  Run
                </Button>
              </Group>
              <Group gap={8} mb={4}>
                <Select
                  aria-label="Focal input"
                  label="Input"
                  size="xs"
                  w={120}
                  data={sourceOptions}
                  value={focalInput}
                  onChange={(v) => setFocalInput(v ?? '0')}
                />
                <NumberInput
                  label="Radius"
                  value={focalRadius}
                  onChange={(v) => setFocalRadius(Number(v))}
                  size="xs"
                  w={70}
                  min={1}
                  max={15}
                />
              </Group>
              <Group gap={8}>
                <Select
                  aria-label="Focal statistic"
                  label="Statistic"
                  size="xs"
                  w={120}
                  data={['mean', 'median', 'majority', 'min', 'max', 'sum', 'std', 'range']}
                  value={focalStat}
                  onChange={(v) => setFocalStat((v as FocalStat) ?? 'mean')}
                />
                <Select
                  aria-label="Window shape"
                  label="Window"
                  size="xs"
                  w={90}
                  data={[
                    { value: 'square', label: 'Square' },
                    { value: 'circle', label: 'Circle' },
                  ]}
                  value={focalShape}
                  onChange={(v) => setFocalShape((v as Neighborhood) ?? 'square')}
                />
              </Group>
            </Paper>

            <Paper p="xs" withBorder bg="var(--mantine-color-dark-8)">
              <Group justify="space-between" mb={4}>
                <Group gap={4}>
                  <IconChartHistogram size={14} />
                  <Text size="xs" fw={500} c="white">
                    Zonal Statistics
                  </Text>
                </Group>
                <Button
                  size="xs"
                  variant="light"
                  color="yellow"
                  aria-label="Run zonal statistics"
                  onClick={() => runAnalysis('zonal')}
                  loading={running === 'zonal'}
                >
                  Run
                </Button>
              </Group>
              <Group gap={8}>
                <Select
                  aria-label="Zonal values"
                  label="Values"
                  size="xs"
                  w={120}
                  data={sourceOptions}
                  value={zonalValues}
                  onChange={(v) => setZonalValues(v ?? '0')}
                />
                <Select
                  aria-label="Zones"
                  label="Zones"
                  size="xs"
                  w={140}
                  data={zoneOptions}
                  value={zonalZones}
                  onChange={(v) => setZonalZones(v ?? '0')}
                />
              </Group>
              {polygonLayers.length === 0 && (
                <Text size="xs" c="dimmed" mt={4}>
                  Add a polygon layer to the map to group by its features.
                </Text>
              )}
            </Paper>

            <Select
              label="Color Ramp"
              size="xs"
              data={[
                'viridis',
                'magma',
                'inferno',
                'plasma',
                'terrain',
                'rdylgn',
                'spectral',
                'greens',
                'reds',
                'blues',
                'grays',
              ]}
              value={colorRamp}
              onChange={(v) => {
                const ramp = (v as ColorRamp) ?? 'viridis';
                setColorRamp(ramp);
                if (result) setResultImage(renderToDataUrl(result, { ramp }));
              }}
            />
          </>
        )}

        {result && (
          <Paper p="xs" withBorder bg="var(--mantine-color-dark-8)">
            <Text size="xs" fw={500} c="white" mb={4}>
              Result: {result.operation}
            </Text>
            {result.stats && (
              <Group gap={12}>
                <Text size="xs" c="dimmed">
                  Min {result.stats.min.toFixed(3)}
                </Text>
                <Text size="xs" c="dimmed">
                  Max {result.stats.max.toFixed(3)}
                </Text>
                <Text size="xs" c="dimmed">
                  Mean {result.stats.mean.toFixed(3)}
                </Text>
                <Text size="xs" c="dimmed">
                  σ {result.stats.std.toFixed(3)}
                </Text>
              </Group>
            )}
            {resultImage && (
              <img
                src={resultImage}
                alt={result.operation}
                style={{ width: '100%', borderRadius: 4, marginTop: 8 }}
              />
            )}
          </Paper>
        )}

        {vector && (
          <Paper p="xs" withBorder bg="var(--mantine-color-dark-8)">
            <Text size="xs" fw={500} c="white">
              {vector.summary}
            </Text>
            <Text size="xs" c="dimmed">
              {vector.detail}
            </Text>
          </Paper>
        )}

        {zonalRows && (
          <ZonalTable
            rows={zonalRows}
            zoneLabel={zonalLabels ? (z) => zonalLabels[z - 1] ?? String(z) : undefined}
          />
        )}

        {(result || vector) && (
          <Button
            size="xs"
            variant="light"
            color="violet"
            leftSection={<IconMap size={14} />}
            onClick={addAsLayer}
            disabled={!canMap}
          >
            Add as layer
          </Button>
        )}
        {(result || vector) && !canMap && (
          <Text size="xs" c="dimmed">
            A layer needs an EPSG:4326 raster; this one is{' '}
            {raster?.metadata.crs ?? 'unknown'}.
          </Text>
        )}
      </Stack>
    </Paper>
  );
}
