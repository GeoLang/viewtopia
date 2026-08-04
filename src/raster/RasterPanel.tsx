/**
 * RasterPanel — load a GeoTIFF/COG in the browser and run raster analysis on
 * it, computed by terrano-core over wasm in a worker (engine.ts). Results
 * preview inline and can drape onto the map when the raster is EPSG:4326.
 */
import { useEffect, useRef, useState } from 'react';
import {
  ActionIcon,
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
  IconLeaf,
  IconLink,
  IconMap,
  IconMountain,
  IconSatellite,
  IconTopologyRing3,
  IconUpload,
  IconX,
} from '@tabler/icons-react';
import type { GeoJsonDataSource, ImageryLayer } from 'cesium';
import { getActiveCesiumViewer } from '../viewer/registry';
import { renderGeoJson } from '../viewer/renderGeoJson';
import { useAppStore } from '../store/app';
import {
  addMapGeoJson,
  addMapRaster,
  addRasterOverlay,
  removeOverlay,
  type MapResult,
} from '../lib/terrainAnalysis';
import { loadCogFromUrl, loadCogFromBuffer, type LoadedRaster } from './loader';
import { computeBandMath } from './operations';
import * as engine from './engine';
import { cellSizeMeters } from './terrano';
import { renderToDataUrl } from './renderer';
import type { RasterResult, ColorRamp, ContourResult } from './types';

const inputStyles = { input: { background: '#0d1117', borderColor: '#30363d' } };

export function RasterPanel({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState('');
  const [raster, setRaster] = useState<LoadedRaster | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RasterResult | null>(null);
  const [contourResult, setContourResult] = useState<ContourResult | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [colorRamp, setColorRamp] = useState<ColorRamp>('viridis');

  // Operation params
  const [nirBand, setNirBand] = useState(3); // Band 4 (0-indexed)
  const [redBand, setRedBand] = useState(2); // Band 3
  const [azimuth, setAzimuth] = useState(315);
  const [altitude, setAltitude] = useState(45);
  const [zFactor, setZFactor] = useState(1);
  const [slopeUnits, setSlopeUnits] = useState<'degrees' | 'percent'>('degrees');
  const [bandMathExpr, setBandMathExpr] = useState('(b4 - b3) / (b4 + b3)');
  const [contourInterval, setContourInterval] = useState(10);

  const renderer = useAppStore((s) => s.renderer);
  const layerRef = useRef<ImageryLayer | null>(null);
  const dsRef = useRef<GeoJsonDataSource | undefined>(undefined);
  const mapResultRef = useRef<MapResult | null>(null);

  const clearMapResult = () => {
    removeOverlay(layerRef.current);
    layerRef.current = null;
    mapResultRef.current?.remove();
    mapResultRef.current = null;
    const viewer = getActiveCesiumViewer();
    if (dsRef.current && viewer && !viewer.isDestroyed()) {
      viewer.dataSources.remove(dsRef.current);
    }
    dsRef.current = undefined;
  };

  useEffect(() => clearMapResult, []);

  // the drape helpers place a bbox in lon/lat, so any other frame stays inline
  const canMap = raster?.metadata.crs === 'EPSG:4326';

  async function handleLoadUrl() {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const loaded = await loadCogFromUrl(url, { maxDimension: 1024 });
      setRaster(loaded);
      setResult(null);
      setResultImage(null);
      setContourResult(null);
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
      setContourResult(null);
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
        case 'ndvi':
          res = await engine.ndvi(bands[nirBand], bands[redBand], width, height, noData);
          break;
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
          const cResult = await engine.contours(
            bands[0],
            width,
            height,
            bbox,
            contourInterval,
            0,
            noData,
          );
          setContourResult(cResult);
          setResult(null);
          setResultImage(null);
          return;
        }
        default:
          return;
      }

      res.bbox = bbox;
      setResult(res);
      setContourResult(null);
      setResultImage(renderToDataUrl(res, { ramp: colorRamp }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setRunning(null);
    }
  }

  const addResultToMap = async () => {
    clearMapResult();
    if (result && resultImage) {
      if (renderer === 'maplibre') {
        mapResultRef.current = addMapRaster('raster-analysis', resultImage, result.bbox, 0.8);
      } else {
        layerRef.current = await addRasterOverlay(resultImage, result.bbox, 0.8);
      }
    } else if (contourResult) {
      if (renderer === 'maplibre') {
        mapResultRef.current = addMapGeoJson('raster-contours', contourResult.geojson, '#f59e0b');
      } else {
        dsRef.current = await renderGeoJson(contourResult.geojson, '#f59e0b', false, 'raster-contours');
      }
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
        background: '#161b22',
        border: '1px solid #30363d',
        zIndex: 300,
      }}
    >
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconSatellite size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Raster Analysis
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs">
        <Group gap="xs" wrap="nowrap">
          <TextInput
            placeholder="https://example.com/dem.tif"
            value={url}
            onChange={(e) => setUrl(e.currentTarget.value)}
            size="xs"
            style={{ flex: 1 }}
            leftSection={<IconLink size={14} />}
            styles={inputStyles}
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
          styles={inputStyles}
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
              <Paper p="xs" withBorder bg="#0d1117">
                <Group justify="space-between" mb={4}>
                  <Group gap={4}>
                    <IconLeaf size={14} />
                    <Text size="xs" fw={500} c="white">
                      NDVI
                    </Text>
                  </Group>
                  <Button
                    size="xs"
                    variant="light"
                    color="green"
                    aria-label="Run NDVI"
                  onClick={() => runAnalysis('ndvi')}
                    loading={running === 'ndvi'}
                  >
                    Run
                  </Button>
                </Group>
                <Group gap={8}>
                  <NumberInput
                    label="NIR Band"
                    value={nirBand + 1}
                    onChange={(v) => setNirBand(Number(v) - 1)}
                    size="xs"
                    w={80}
                    min={1}
                    max={raster.metadata.bands}
                    styles={inputStyles}
                  />
                  <NumberInput
                    label="Red Band"
                    value={redBand + 1}
                    onChange={(v) => setRedBand(Number(v) - 1)}
                    size="xs"
                    w={80}
                    min={1}
                    max={raster.metadata.bands}
                    styles={inputStyles}
                  />
                </Group>
              </Paper>
            )}

            <Paper p="xs" withBorder bg="#0d1117">
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
                  styles={inputStyles}
                />
                <NumberInput
                  label="Altitude"
                  value={altitude}
                  onChange={(v) => setAltitude(Number(v))}
                  size="xs"
                  w={80}
                  min={0}
                  max={90}
                  styles={inputStyles}
                />
                <NumberInput
                  label="Z Factor"
                  value={zFactor}
                  onChange={(v) => setZFactor(Number(v))}
                  size="xs"
                  w={80}
                  min={0.1}
                  step={0.1}
                  styles={inputStyles}
                />
              </Group>
            </Paper>

            <Paper p="xs" withBorder bg="#0d1117">
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
                styles={inputStyles}
              />
            </Paper>

            <Paper p="xs" withBorder bg="#0d1117">
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

            <Paper p="xs" withBorder bg="#0d1117">
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
                styles={inputStyles}
              />
              <Text size="xs" c="dimmed" mt={4}>
                b1, b2, … are bands; + - * / and Math.* work.
              </Text>
            </Paper>

            <Paper p="xs" withBorder bg="#0d1117">
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
                styles={inputStyles}
              />
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
              styles={inputStyles}
            />
          </>
        )}

        {result && (
          <Paper p="xs" withBorder bg="#0d1117">
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

        {contourResult && (
          <Paper p="xs" withBorder bg="#0d1117">
            <Text size="xs" fw={500} c="white">
              {contourResult.geojson.features.length} contour lines
            </Text>
            <Text size="xs" c="dimmed">
              Elevation {contourResult.elevationRange[0].toFixed(0)}–
              {contourResult.elevationRange[1].toFixed(0)}
            </Text>
          </Paper>
        )}

        {(result || contourResult) && (
          <Group gap="xs">
            <Button
              size="xs"
              variant="light"
              color="violet"
              leftSection={<IconMap size={14} />}
              onClick={addResultToMap}
              disabled={!canMap}
              style={{ flex: 1 }}
            >
              Add to map
            </Button>
            <Button size="xs" variant="default" onClick={clearMapResult}>
              Clear
            </Button>
          </Group>
        )}
        {(result || contourResult) && !canMap && (
          <Text size="xs" c="dimmed">
            Map overlay needs an EPSG:4326 raster; this one is{' '}
            {raster?.metadata.crs ?? 'unknown'}.
          </Text>
        )}
      </Stack>
    </Paper>
  );
}
