/**
 * RasterPanel — UI for loading COGs and running raster analysis.
 */
import { useState } from 'react';
import {
  Stack,
  Group,
  Button,
  TextInput,
  Select,
  NumberInput,
  Text,
  Paper,
  Badge,
  Divider,
  Alert,
  FileInput,
  Textarea,
} from '@mantine/core';
import {
  IconSatellite,
  IconMountain,
  IconLeaf,
  IconCalculator,
  IconTopologyRing3,
  IconUpload,
  IconLink,
} from '@tabler/icons-react';
import { loadCogFromUrl, loadCogFromBuffer, type LoadedRaster } from './loader';
import {
  computeNdvi,
  computeHillshade,
  computeSlope,
  computeAspect,
  computeBandMath,
  computeContours,
} from './operations';
import { renderToDataUrl, } from './renderer';
import type { RasterResult, ColorRamp, ContourResult } from './types';

export function RasterPanel() {
  const [url, setUrl] = useState('');
  const [raster, setRaster] = useState<LoadedRaster | null>(null);
  const [loading, setLoading] = useState(false);
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

  async function handleLoadUrl() {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const loaded = await loadCogFromUrl(url, { maxDimension: 1024 });
      setRaster(loaded);
      setResult(null);
      setResultImage(null);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load raster');
    } finally {
      setLoading(false);
    }
  }

  function runAnalysis(op: string) {
    if (!raster) return;
    const { bands, metadata } = raster;
    const { width, height, noData, resolution, bbox } = metadata;
    const cellSize = resolution[0];

    let res: RasterResult;
    switch (op) {
      case 'ndvi':
        res = computeNdvi(bands, width, height, { nirBand, redBand }, noData);
        res.bbox = bbox;
        res.colorMap = 'rdylgn';
        break;
      case 'hillshade':
        res = computeHillshade(bands[0], width, height, { azimuth, altitude, zFactor }, cellSize, noData);
        res.bbox = bbox;
        break;
      case 'slope':
        res = computeSlope(bands[0], width, height, { units: slopeUnits, zFactor }, cellSize, noData);
        res.bbox = bbox;
        break;
      case 'aspect':
        res = computeAspect(bands[0], width, height, {}, cellSize, noData);
        res.bbox = bbox;
        break;
      case 'band-math':
        res = computeBandMath(bands, width, height, { expression: bandMathExpr }, noData);
        res.bbox = bbox;
        break;
      case 'contours': {
        const cResult = computeContours(bands[0], width, height, bbox, { interval: contourInterval });
        setContourResult(cResult);
        setResult(null);
        setResultImage(null);
        return;
      }
      default:
        return;
    }

    setResult(res);
    setContourResult(null);
    const img = renderToDataUrl(res, { ramp: colorRamp });
    setResultImage(img);
  }

  return (
    <Stack p="md" gap="sm">
      <Group gap={8}>
        <IconSatellite size={20} />
        <Text fw={600}>Raster Analysis</Text>
      </Group>

      {/* Load section */}
      <Paper p="sm" withBorder>
        <Stack gap="xs">
          <Text size="xs" fw={500}>Load Raster (GeoTIFF / COG)</Text>
          <Group>
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
            placeholder="Or drop a .tif file"
            accept=".tif,.tiff"
            leftSection={<IconUpload size={14} />}
            onChange={handleLoadFile}
          />
        </Stack>
      </Paper>

      {error && <Alert color="red" variant="light">{error}</Alert>}

      {/* Metadata */}
      {raster && (
        <Paper p="sm" withBorder>
          <Group gap={8}>
            <Badge size="xs" color="green">Loaded</Badge>
            <Text size="xs">{raster.metadata.width}×{raster.metadata.height}</Text>
            <Text size="xs">{raster.metadata.bands} bands</Text>
            <Text size="xs">{raster.metadata.crs}</Text>
          </Group>
        </Paper>
      )}

      {/* Operations */}
      {raster && (
        <>
          <Divider label="Operations" labelPosition="center" />

          {/* NDVI */}
          {raster.metadata.bands >= 4 && (
            <Paper p="sm" withBorder>
              <Group justify="space-between" mb={4}>
                <Group gap={4}><IconLeaf size={14} /><Text size="xs" fw={500}>NDVI</Text></Group>
                <Button size="xs" variant="light" color="green" onClick={() => runAnalysis('ndvi')}>Run</Button>
              </Group>
              <Group gap={8}>
                <NumberInput label="NIR Band" value={nirBand + 1} onChange={(v) => setNirBand(Number(v) - 1)} size="xs" w={80} min={1} max={raster.metadata.bands} />
                <NumberInput label="Red Band" value={redBand + 1} onChange={(v) => setRedBand(Number(v) - 1)} size="xs" w={80} min={1} max={raster.metadata.bands} />
              </Group>
            </Paper>
          )}

          {/* Hillshade */}
          <Paper p="sm" withBorder>
            <Group justify="space-between" mb={4}>
              <Group gap={4}><IconMountain size={14} /><Text size="xs" fw={500}>Hillshade</Text></Group>
              <Button size="xs" variant="light" onClick={() => runAnalysis('hillshade')}>Run</Button>
            </Group>
            <Group gap={8}>
              <NumberInput label="Azimuth" value={azimuth} onChange={(v) => setAzimuth(Number(v))} size="xs" w={80} min={0} max={360} />
              <NumberInput label="Altitude" value={altitude} onChange={(v) => setAltitude(Number(v))} size="xs" w={80} min={0} max={90} />
              <NumberInput label="Z Factor" value={zFactor} onChange={(v) => setZFactor(Number(v))} size="xs" w={80} min={0.1} step={0.1} />
            </Group>
          </Paper>

          {/* Slope */}
          <Paper p="sm" withBorder>
            <Group justify="space-between" mb={4}>
              <Text size="xs" fw={500}>Slope</Text>
              <Button size="xs" variant="light" onClick={() => runAnalysis('slope')}>Run</Button>
            </Group>
            <Select label="Units" data={[{ value: 'degrees', label: 'Degrees' }, { value: 'percent', label: 'Percent' }]} value={slopeUnits} onChange={(v) => setSlopeUnits(v as 'degrees' | 'percent')} size="xs" w={120} />
          </Paper>

          {/* Aspect */}
          <Paper p="sm" withBorder>
            <Group justify="space-between">
              <Text size="xs" fw={500}>Aspect</Text>
              <Button size="xs" variant="light" onClick={() => runAnalysis('aspect')}>Run</Button>
            </Group>
          </Paper>

          {/* Band Math */}
          <Paper p="sm" withBorder>
            <Group justify="space-between" mb={4}>
              <Group gap={4}><IconCalculator size={14} /><Text size="xs" fw={500}>Band Math</Text></Group>
              <Button size="xs" variant="light" color="violet" onClick={() => runAnalysis('band-math')}>Run</Button>
            </Group>
            <Textarea
              size="xs"
              placeholder="(b4 - b3) / (b4 + b3)"
              value={bandMathExpr}
              onChange={(e) => setBandMathExpr(e.currentTarget.value)}
              minRows={1}
              autosize
            />
            <Text size="xs" c="dimmed" mt={4}>Use b1, b2, b3... for bands. Math operators: + - * / Math.sqrt() etc.</Text>
          </Paper>

          {/* Contours */}
          <Paper p="sm" withBorder>
            <Group justify="space-between" mb={4}>
              <Group gap={4}><IconTopologyRing3 size={14} /><Text size="xs" fw={500}>Contours</Text></Group>
              <Button size="xs" variant="light" color="teal" onClick={() => runAnalysis('contours')}>Run</Button>
            </Group>
            <NumberInput label="Interval" value={contourInterval} onChange={(v) => setContourInterval(Number(v))} size="xs" w={100} min={1} />
          </Paper>

          {/* Color Ramp */}
          <Select
            label="Color Ramp"
            size="xs"
            data={['viridis', 'magma', 'inferno', 'plasma', 'terrain', 'rdylgn', 'spectral', 'greens', 'reds', 'blues', 'grays']}
            value={colorRamp}
            onChange={(v) => {
              const ramp = v as ColorRamp;
              setColorRamp(ramp);
              if (result) {
                const img = renderToDataUrl(result, { ramp });
                setResultImage(img);
              }
            }}
          />
        </>
      )}

      {/* Result */}
      {result && (
        <Paper p="sm" withBorder>
          <Text size="xs" fw={500} mb={4}>Result: {result.operation}</Text>
          {result.stats && (
            <Group gap={12}>
              <Text size="xs">Min: {result.stats.min.toFixed(3)}</Text>
              <Text size="xs">Max: {result.stats.max.toFixed(3)}</Text>
              <Text size="xs">Mean: {result.stats.mean.toFixed(3)}</Text>
              <Text size="xs">σ: {result.stats.std.toFixed(3)}</Text>
            </Group>
          )}
          {resultImage && (
            <img src={resultImage} alt={result.operation} style={{ width: '100%', borderRadius: 4, marginTop: 8 }} />
          )}
        </Paper>
      )}

      {contourResult && (
        <Paper p="sm" withBorder>
          <Text size="xs" fw={500}>Contours</Text>
          <Text size="xs">{contourResult.geojson.features.length} contour lines</Text>
          <Text size="xs">Elevation range: {contourResult.elevationRange[0].toFixed(0)}–{contourResult.elevationRange[1].toFixed(0)}</Text>
        </Paper>
      )}
    </Stack>
  );
}
