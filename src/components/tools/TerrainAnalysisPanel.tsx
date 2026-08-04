import { useEffect, useRef, useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  Select,
  Slider,
  Button,
  NumberInput,
} from '@mantine/core';
import { IconDownload, IconMountain, IconX } from '@tabler/icons-react';
import type { GeoJsonDataSource, ImageryLayer } from 'cesium';
import { getActiveCesiumViewer } from '../../viewer/registry';
import { renderGeoJson } from '../../viewer/renderGeoJson';
import { useAppStore } from '../../store/app';
import { useOgcLayerStore } from '../../store/ogcLayers';
import { useAuthStore } from '../../features/auth/store';
import {
  addMapGeoJson,
  addMapRaster,
  addRasterOverlay,
  contours,
  currentBbox,
  DEFAULT_SUN,
  exportCog,
  liveLayerName,
  liveTileTemplate,
  removeOverlay,
  terrainRaster,
  SIGN_IN_HINT,
  type Bbox,
  type LiveOp,
  type MapResult,
} from '../../lib/terrainAnalysis';

type Op = 'slope' | 'aspect' | 'hillshade' | 'contours';

export function TerrainAnalysisPanel({ onClose }: { onClose: () => void }) {
  const [analysis, setAnalysis] = useState<Op>('slope');
  const [opacity, setOpacity] = useState(70);
  const [sun, setSun] = useState(DEFAULT_SUN);
  const [resolution, setResolution] = useState(100);
  const [exporting, setExporting] = useState<LiveOp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const renderer = useAppStore((s) => s.renderer);
  const addXyzLayer = useOgcLayerStore((s) => s.addXyzLayer);
  const needsSignIn = useAuthStore((s) => !s.token);
  const layerRef = useRef<ImageryLayer | null>(null);
  const dsRef = useRef<GeoJsonDataSource | undefined>(undefined);
  const mapResultRef = useRef<MapResult | null>(null);
  const urlRef = useRef<string | null>(null);

  const clearResult = () => {
    removeOverlay(layerRef.current);
    layerRef.current = null;
    mapResultRef.current?.remove();
    mapResultRef.current = null;
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    const viewer = getActiveCesiumViewer();
    if (dsRef.current && viewer && !viewer.isDestroyed()) {
      viewer.dataSources.remove(dsRef.current);
    }
    dsRef.current = undefined;
  };

  useEffect(() => clearResult, []);

  // live opacity control for the raster overlay.
  useEffect(() => {
    if (layerRef.current) layerRef.current.alpha = opacity / 100;
    mapResultRef.current?.setOpacity(opacity / 100);
  }, [opacity]);

  const run = async () => {
    const bbox = currentBbox();
    if (!bbox) {
      setError('Cannot read the current map view');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      clearResult();
      if (analysis === 'contours') {
        const fc = await contours(bbox as Bbox);
        if (renderer === 'maplibre') {
          mapResultRef.current = addMapGeoJson('contours-result', fc, '#f59e0b');
        } else {
          dsRef.current = await renderGeoJson(fc, '#f59e0b', false, 'contours-result');
        }
      } else {
        const url = await terrainRaster(analysis, bbox as Bbox, sun);
        urlRef.current = url;
        if (renderer === 'maplibre') {
          mapResultRef.current = addMapRaster('terrain-result', url, bbox as Bbox, opacity / 100);
        } else {
          layerRef.current = await addRasterOverlay(url, bbox as Bbox, opacity / 100);
        }
      }
    } catch {
      setError('Terrain request failed');
    } finally {
      setLoading(false);
    }
  };

  const setSunValue = (key: 'azimuth' | 'altitude') => (v: number | string) =>
    setSun((s) => (typeof v === 'number' ? { ...s, [key]: v } : s));

  // slope and hillshade also render as on-demand tiles, so they can go on as a
  // normal XYZ layer the layer panel manages
  const isLive = analysis === 'slope' || analysis === 'hillshade';

  const addLive = () => {
    if (analysis !== 'slope' && analysis !== 'hillshade') return;
    const layer = addXyzLayer(liveLayerName(analysis, sun), liveTileTemplate(analysis, sun));
    setStatus(`Showing ${layer.name}`);
  };

  // ndvi is served by the same live endpoint (sentinel-2, monthly median) but
  // is not one of the panel's one-shot ops, so it gets its own button
  const addNdvi = () => {
    const layer = addXyzLayer(liveLayerName('ndvi', sun), liveTileTemplate('ndvi', sun));
    setStatus(`Showing ${layer.name}`);
  };

  const download = async (op: LiveOp) => {
    const bbox = currentBbox();
    if (!bbox) {
      setError('Cannot read the current map view');
      return;
    }
    setExporting(op);
    setError(null);
    try {
      await exportCog(op, bbox as Bbox, resolution, sun);
      setStatus(`Downloaded ${op}.tif`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExporting(null);
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
        width: 260,
        background: '#161b22',
        border: '1px solid #30363d',
        zIndex: 300,
      }}
    >
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconMountain size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Terrain Analysis
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs">
        <Select
          size="xs"
          label="Analysis Type"
          data={[
            { value: 'slope', label: 'Slope' },
            { value: 'aspect', label: 'Aspect' },
            { value: 'hillshade', label: 'Hillshade' },
            { value: 'contours', label: 'Contour Lines' },
          ]}
          value={analysis}
          onChange={(v) => setAnalysis((v as Op) ?? 'slope')}
          styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
        />

        {analysis === 'hillshade' && (
          <Group grow>
            <NumberInput
              size="xs"
              label="Azimuth"
              min={0}
              max={360}
              value={sun.azimuth}
              onChange={setSunValue('azimuth')}
              styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
            />
            <NumberInput
              size="xs"
              label="Altitude"
              min={0}
              max={90}
              value={sun.altitude}
              onChange={setSunValue('altitude')}
              styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
            />
          </Group>
        )}

        <Text size="xs" c="dimmed">Opacity: {opacity}%</Text>
        <Slider
          size="xs"
          min={10}
          max={100}
          value={opacity}
          onChange={setOpacity}
          color="violet"
          disabled={analysis === 'contours'}
        />

        <Group grow>
          <Button
            size="xs"
            color="violet"
            onClick={run}
            loading={loading}
            disabled={needsSignIn}
          >
            Run
          </Button>
          <Button size="xs" variant="default" onClick={clearResult}>
            Clear
          </Button>
        </Group>

        <NumberInput
          size="xs"
          label="Export resolution (m/px)"
          min={1}
          value={resolution}
          onChange={(v) => typeof v === 'number' && setResolution(v)}
          styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
        />

        <Group gap="xs" wrap="nowrap">
          <Button
            size="xs"
            variant="light"
            color="violet"
            onClick={addLive}
            disabled={!isLive}
            style={{ flex: 1 }}
          >
            Add live layer
          </Button>
          <ActionIcon
            size="lg"
            variant="light"
            color="violet"
            aria-label="Download GeoTIFF"
            onClick={() => isLive && download(analysis as LiveOp)}
            disabled={!isLive || needsSignIn}
            loading={exporting !== null && exporting === analysis}
          >
            <IconDownload size={14} />
          </ActionIcon>
        </Group>

        <Group gap="xs" wrap="nowrap">
          <Button
            size="xs"
            variant="light"
            color="green"
            onClick={addNdvi}
            style={{ flex: 1 }}
          >
            Add live NDVI layer
          </Button>
          <ActionIcon
            size="lg"
            variant="light"
            color="green"
            aria-label="Download NDVI GeoTIFF"
            onClick={() => download('ndvi')}
            disabled={needsSignIn}
            loading={exporting === 'ndvi'}
          >
            <IconDownload size={14} />
          </ActionIcon>
        </Group>

        {status && (
          <Text size="xs" c="dimmed" data-testid="terrain-live-status">
            {status}
          </Text>
        )}

        {needsSignIn && (
          <Text size="xs" c="dimmed" data-testid="terrain-signin">
            {SIGN_IN_HINT}
          </Text>
        )}

        {error && (
          <Text size="xs" c="red">
            {error}
          </Text>
        )}
      </Stack>
    </Paper>
  );
}
