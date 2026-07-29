/**
 * Raster Classification Plugin — unsupervised k-means / ISODATA on COG pixels.
 * Equivalent to: QGIS Semi-Automatic Classification Plugin (2.6M downloads)
 * Pixels come from src/raster/loader.ts (geotiff.js), read down to a bounded
 * size so a large COG cannot lock the tab.
 */

import { useState } from 'react';
import {
  Paper, Text, Stack, Button, Group, Badge, Select, Slider, Table, ColorSwatch, Loader,
  Alert, TextInput, FileInput, Divider,
} from '@mantine/core';
import { IconCategory, IconLink, IconUpload } from '@tabler/icons-react';
import type { PluginDefinition, PluginContext } from '../sdk';
import { loadCogFromUrl, loadCogFromBuffer, type LoadedRaster } from '../../raster/loader';
import { classifyPixels, CLASS_COLORS, type ClassStats, type ClassifyMethod } from './classify';

/** Read cap: clustering is synchronous, so keep the pixel count in the hundreds of thousands. */
const MAX_DIMENSION = 512;
/** Bands used as the feature vector; a 1-band raster clusters on one dimension. */
const MAX_BANDS = 3;

/** Pixels to classify, from a COG or from the demo generator. */
interface ClassifyInput {
  width: number;
  height: number;
  bands: Float32Array[];
  noData: number | null;
  /** where the pixels came from, shown in the UI */
  source: string;
  demo: boolean;
  crs?: string;
}

function fromRaster(loaded: LoadedRaster, source: string): ClassifyInput {
  const { metadata, bands } = loaded;
  return {
    width: metadata.width,
    height: metadata.height,
    bands: bands.slice(0, MAX_BANDS),
    noData: metadata.noData,
    source,
    demo: false,
    crs: metadata.crs,
  };
}

/** Generated stand-in for people without a COG at hand. Always labelled as demo. */
function demoInput(): ClassifyInput {
  const width = 256, height = 256;
  const numPixels = width * height;
  const bands = [new Float32Array(numPixels), new Float32Array(numPixels), new Float32Array(numPixels)];
  // three bands of sin/cos gradients plus noise, so the clusters are separable
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      bands[0][i] = Math.sin(x / 30) * 50 + Math.random() * 20 + 100;
      bands[1][i] = Math.cos(y / 25) * 40 + Math.random() * 15 + 120;
      bands[2][i] = Math.sin((x + y) / 40) * 60 + Math.random() * 10 + 80;
    }
  }
  return { width, height, bands, noData: null, source: 'Generated demo data', demo: true };
}

/** Paint the labels, leaving unclassified pixels transparent. */
function renderLabels(labels: Int16Array, width: number, height: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const imgCtx = canvas.getContext('2d')!;
  const imgData = imgCtx.createImageData(width, height);

  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];
    if (label < 0) {
      imgData.data[i * 4 + 3] = 0;
      continue;
    }
    const color = CLASS_COLORS[label % CLASS_COLORS.length];
    imgData.data[i * 4] = parseInt(color.slice(1, 3), 16);
    imgData.data[i * 4 + 1] = parseInt(color.slice(3, 5), 16);
    imgData.data[i * 4 + 2] = parseInt(color.slice(5, 7), 16);
    imgData.data[i * 4 + 3] = 255;
  }
  imgCtx.putImageData(imgData, 0, 0);
  return canvas.toDataURL();
}

function RasterClassificationPanel({ ctx }: { ctx: PluginContext }) {
  const [url, setUrl] = useState('');
  const [input, setInput] = useState<ClassifyInput | null>(null);
  const [method, setMethod] = useState<ClassifyMethod>('kmeans');
  const [numClasses, setNumClasses] = useState(5);
  const [loading, setLoading] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ClassStats[] | null>(null);
  const [skipped, setSkipped] = useState(0);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const reset = () => {
    setResults(null);
    setImageUrl(null);
    setSkipped(0);
  };

  const handleLoadUrl = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    reset();
    try {
      const loaded = await loadCogFromUrl(url.trim(), { maxDimension: MAX_DIMENSION });
      setInput(fromRaster(loaded, url.trim()));
    } catch (err) {
      setInput(null);
      setError(err instanceof Error ? err.message : 'Failed to load raster');
    } finally {
      setLoading(false);
    }
  };

  const handleLoadFile = async (file: File | null) => {
    if (!file) return;
    setLoading(true);
    setError(null);
    reset();
    try {
      const loaded = await loadCogFromBuffer(await file.arrayBuffer(), { maxDimension: MAX_DIMENSION });
      setInput(fromRaster(loaded, file.name));
    } catch (err) {
      setInput(null);
      setError(err instanceof Error ? err.message : 'Failed to load raster');
    } finally {
      setLoading(false);
    }
  };

  const handleClassify = async () => {
    if (!input) return;
    setError(null);
    reset();

    if (input.bands.length === 0) {
      setError('The raster has no readable bands.');
      return;
    }
    if (input.bands[0].length !== input.width * input.height) {
      setError(`Unsupported raster layout: ${input.bands[0].length} samples for ${input.width}×${input.height} pixels.`);
      return;
    }

    setClassifying(true);
    // the clustering blocks, so let the spinner paint first
    await new Promise((resolve) => setTimeout(resolve, 0));
    try {
      const result = classifyPixels(input.bands, {
        method,
        numClasses,
        noData: input.noData,
        maxIterations: ctx.settings.get('maxIterations', 50),
        convergenceThreshold: ctx.settings.get('convergenceThreshold', 0.001),
      });
      if (result.classifiedPixels === 0) {
        setError('Every pixel is nodata, nothing to classify.');
        return;
      }
      setResults(result.classes);
      setSkipped(result.skippedPixels);
      setImageUrl(renderLabels(result.labels, input.width, input.height));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Classification failed');
    } finally {
      setClassifying(false);
    }
  };

  return (
    <Paper p="md" withBorder style={{ width: 380, maxHeight: '80vh', overflow: 'auto' }}>
      <Stack gap="sm">
        <Group justify="space-between">
          <Text fw={600} size="lg">Raster Classification</Text>
          <Badge size="sm" color="orange">Unsupervised</Badge>
        </Group>

        <Text size="xs" fw={500}>Load Raster (GeoTIFF / COG)</Text>
        <Group gap="xs" wrap="nowrap">
          <TextInput
            placeholder="https://example.com/scene.tif"
            value={url}
            onChange={(e) => setUrl(e.currentTarget.value)}
            size="xs"
            style={{ flex: 1 }}
            leftSection={<IconLink size={14} />}
          />
          <Button size="xs" onClick={handleLoadUrl} loading={loading}>Load</Button>
        </Group>
        <FileInput
          size="xs"
          placeholder="Or pick a .tif file"
          accept=".tif,.tiff"
          leftSection={<IconUpload size={14} />}
          onChange={handleLoadFile}
        />
        <Button size="xs" variant="subtle" color="gray" onClick={() => { setError(null); reset(); setInput(demoInput()); }}>
          Try with demo data
        </Button>
        <Text size="xs" c="dimmed">
          Read down to {MAX_DIMENSION} px on the long side, first {MAX_BANDS} bands.
        </Text>

        {error && <Alert color="red" variant="light" p="xs"><Text size="xs">{error}</Text></Alert>}

        {input && (
          <Paper p="xs" withBorder>
            <Group gap={8}>
              <Badge size="xs" color={input.demo ? 'yellow' : 'green'}>
                {input.demo ? 'Generated demo data' : 'Loaded'}
              </Badge>
              <Text size="xs">{input.width}×{input.height}</Text>
              <Text size="xs">{input.bands.length} band{input.bands.length === 1 ? '' : 's'}</Text>
              {input.crs && <Text size="xs">{input.crs}</Text>}
            </Group>
            <Text size="xs" c="dimmed" mt={4} style={{ wordBreak: 'break-all' }}>{input.source}</Text>
          </Paper>
        )}

        <Divider />

        <Select
          label="Method"
          data={[
            { value: 'kmeans', label: 'K-Means Clustering' },
            { value: 'isodata', label: 'ISODATA' },
          ]}
          value={method}
          onChange={(v) => setMethod((v || 'kmeans') as ClassifyMethod)}
        />

        <Text size="xs" c="dimmed">Number of Classes: {numClasses}</Text>
        <Slider
          value={numClasses}
          onChange={setNumClasses}
          min={2}
          max={20}
          marks={[{ value: 2, label: '2' }, { value: 10, label: '10' }, { value: 20, label: '20' }]}
        />

        <Button
          leftSection={classifying ? <Loader size={14} /> : <IconCategory size={14} />}
          onClick={handleClassify}
          disabled={!input || classifying}
          fullWidth
          color="orange"
        >
          {classifying ? 'Classifying...' : input ? 'Run Classification' : 'Load a raster first'}
        </Button>

        {imageUrl && input && (
          <>
            <Group justify="space-between">
              <Text size="xs" fw={500}>Result</Text>
              {input.demo && <Badge size="xs" color="yellow" variant="light">Demo data</Badge>}
            </Group>
            <img
              src={imageUrl}
              alt="Classified raster"
              style={{ width: '100%', imageRendering: 'pixelated', borderRadius: 8, border: '1px solid var(--mantine-color-default-border)' }}
            />
            {skipped > 0 && (
              <Text size="xs" c="dimmed">{skipped.toLocaleString()} pixels skipped as nodata.</Text>
            )}
          </>
        )}

        {results && (
          <Table striped withTableBorder style={{ fontSize: 11 }}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Class</Table.Th>
                <Table.Th>Color</Table.Th>
                <Table.Th>Pixels</Table.Th>
                <Table.Th>%</Table.Th>
                <Table.Th>Mean B1</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {results.map((r) => (
                <Table.Tr key={r.classId}>
                  <Table.Td>{r.classId}</Table.Td>
                  <Table.Td><ColorSwatch size={14} color={r.color} /></Table.Td>
                  <Table.Td>{r.pixelCount.toLocaleString()}</Table.Td>
                  <Table.Td>{r.percentage.toFixed(1)}%</Table.Td>
                  <Table.Td>{r.meanValue.toFixed(1)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Stack>
    </Paper>
  );
}

const plugin: PluginDefinition = {
  id: 'raster-classification',
  name: 'Raster Classification',
  description: 'Unsupervised K-Means / ISODATA classification of the pixels of a COG loaded from a URL or file',
  version: '1.0.0',
  author: 'TileTopia-HQ',
  icon: <IconCategory size={14} />,
  category: 'analysis',
  Panel: RasterClassificationPanel,
  settings: [
    { key: 'maxIterations', label: 'Max Iterations', type: 'number', defaultValue: 50, min: 10, max: 200 },
    { key: 'convergenceThreshold', label: 'Convergence Threshold', type: 'number', defaultValue: 0.001 },
  ],
};

export default plugin;
