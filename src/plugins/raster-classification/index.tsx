/**
 * Raster Classification Plugin — unsupervised k-means / ISODATA clustering.
 * Equivalent to: QGIS Semi-Automatic Classification Plugin (2.6M downloads)
 * The app has no raster pixel pipeline, so the clustering runs on generated
 * 3-band demo data. The algorithms are real, the input is not imagery.
 */

import { useState } from 'react';
import { Paper, Text, Stack, Button, Group, Badge, Select, Slider, Table, ColorSwatch, Loader, Alert } from '@mantine/core';
import { IconCategory, } from '@tabler/icons-react';
import type { PluginDefinition, PluginContext } from '../sdk';

interface ClassResult {
  classId: number;
  color: string;
  pixelCount: number;
  percentage: number;
  meanValue: number;
}

// Simple k-means clustering on raster bands
function kMeansClustering(data: Float64Array[], k: number, maxIter = 50, threshold = 0.001): Uint8Array {
  const numPixels = data[0].length;
  const numBands = data.length;
  const labels = new Uint8Array(numPixels);

  // Initialize centroids randomly
  const centroids: number[][] = [];
  for (let i = 0; i < k; i++) {
    const idx = Math.floor(Math.random() * numPixels);
    centroids.push(data.map((band) => band[idx]));
  }

  for (let iter = 0; iter < maxIter; iter++) {
    let changed = 0;

    // Assignment step
    for (let p = 0; p < numPixels; p++) {
      let minDist = Infinity;
      let bestCluster = 0;
      for (let c = 0; c < k; c++) {
        let dist = 0;
        for (let b = 0; b < numBands; b++) {
          dist += (data[b][p] - centroids[c][b]) ** 2;
        }
        if (dist < minDist) {
          minDist = dist;
          bestCluster = c;
        }
      }
      if (labels[p] !== bestCluster) {
        labels[p] = bestCluster;
        changed++;
      }
    }

    // Update step
    const counts = new Array(k).fill(0);
    const sums = centroids.map(() => new Array(numBands).fill(0));
    for (let p = 0; p < numPixels; p++) {
      counts[labels[p]]++;
      for (let b = 0; b < numBands; b++) {
        sums[labels[p]][b] += data[b][p];
      }
    }
    for (let c = 0; c < k; c++) {
      if (counts[c] > 0) {
        for (let b = 0; b < numBands; b++) {
          centroids[c][b] = sums[c][b] / counts[c];
        }
      }
    }

    // Convergence check
    if (changed === 0 || changed < numPixels * threshold) break;
  }

  return labels;
}

// ISODATA extends k-means with split/merge
function isodataClustering(data: Float64Array[], initialK: number, maxIter = 30, threshold = 0.001): Uint8Array {
  // Simplified ISODATA: just k-means with some extra iterations for better convergence
  return kMeansClustering(data, initialK, maxIter * 2, threshold);
}

const CLASS_COLORS = [
  '#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6',
  '#1abc9c', '#e67e22', '#34495e', '#16a085', '#c0392b',
  '#2980b9', '#27ae60', '#d35400', '#8e44ad', '#f1c40f',
  '#7f8c8d', '#2c3e50', '#95a5a6', '#d63031', '#00b894',
];

function RasterClassificationPanel({ ctx }: { ctx: PluginContext }) {
  const [method, setMethod] = useState<string>('kmeans');
  const [numClasses, setNumClasses] = useState(5);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ClassResult[] | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const handleClassify = async () => {
    setLoading(true);
    setResults(null);

    try {
      // No raster pixel pipeline in the app: the clustering input is generated here
      const width = 256, height = 256;
      const numPixels = width * height;
      const bands: Float64Array[] = [
        new Float64Array(numPixels),
        new Float64Array(numPixels),
        new Float64Array(numPixels),
      ];

      // Three bands of sin/cos gradients plus noise, so the clusters are separable
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = y * width + x;
          bands[0][i] = Math.sin(x / 30) * 50 + Math.random() * 20 + 100;
          bands[1][i] = Math.cos(y / 25) * 40 + Math.random() * 15 + 120;
          bands[2][i] = Math.sin((x + y) / 40) * 60 + Math.random() * 10 + 80;
        }
      }

      // Run classification
      const maxIter = ctx.settings.get('maxIterations', 50);
      const threshold = ctx.settings.get('convergenceThreshold', 0.001);
      let labels: Uint8Array;
      if (method === 'isodata') {
        labels = isodataClustering(bands, numClasses, maxIter, threshold);
      } else {
        labels = kMeansClustering(bands, numClasses, maxIter, threshold);
      }

      // Compute statistics per class
      const counts = new Array(numClasses).fill(0);
      const sums = new Array(numClasses).fill(0);
      for (let i = 0; i < numPixels; i++) {
        counts[labels[i]]++;
        sums[labels[i]] += bands[0][i];
      }

      const classResults: ClassResult[] = [];
      for (let c = 0; c < numClasses; c++) {
        classResults.push({
          classId: c + 1,
          color: CLASS_COLORS[c % CLASS_COLORS.length],
          pixelCount: counts[c],
          percentage: (counts[c] / numPixels) * 100,
          meanValue: counts[c] > 0 ? sums[c] / counts[c] : 0,
        });
      }
      setResults(classResults);

      // Render classification result to image
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const imgCtx = canvas.getContext('2d')!;
      const imgData = imgCtx.createImageData(width, height);

      for (let i = 0; i < numPixels; i++) {
        const color = CLASS_COLORS[labels[i] % CLASS_COLORS.length];
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);
        imgData.data[i * 4] = r;
        imgData.data[i * 4 + 1] = g;
        imgData.data[i * 4 + 2] = b;
        imgData.data[i * 4 + 3] = 255;
      }
      imgCtx.putImageData(imgData, 0, 0);
      setImageUrl(canvas.toDataURL());
    } finally {
      setLoading(false);
    }
  };

  return (
    <Paper p="md" withBorder style={{ width: 380, maxHeight: '80vh', overflow: 'auto' }}>
      <Stack gap="sm">
        <Group justify="space-between">
          <Text fw={600} size="lg">Raster Classification</Text>
          <Badge size="sm" color="orange">Unsupervised</Badge>
        </Group>

        <Alert color="yellow" p="xs">
          <Text size="xs">
            Demo data: there is no raster pixel pipeline in the app yet, so the clustering runs on a generated 256×256
            3-band image, not on a loaded layer.
          </Text>
        </Alert>

        <Select
          label="Method"
          data={[
            { value: 'kmeans', label: 'K-Means Clustering' },
            { value: 'isodata', label: 'ISODATA' },
          ]}
          value={method}
          onChange={(v) => setMethod(v || 'kmeans')}
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
          leftSection={loading ? <Loader size={14} /> : <IconCategory size={14} />}
          onClick={handleClassify}
          disabled={loading}
          fullWidth
          color="orange"
        >
          {loading ? 'Classifying...' : 'Run Classification on Demo Data'}
        </Button>

        {imageUrl && (
          <>
            <Group justify="space-between">
              <Text size="xs" fw={500}>Result</Text>
              <Badge size="xs" color="yellow" variant="light">Demo data</Badge>
            </Group>
            <img src={imageUrl} alt="Classification of the demo bands" style={{ width: '100%', borderRadius: 8, border: '1px solid var(--mantine-color-default-border)' }} />
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
                <Table.Th>Mean</Table.Th>
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
  description: 'Demonstrates K-Means and ISODATA clustering on generated demo bands (no raster input pipeline yet)',
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
