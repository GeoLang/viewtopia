/**
 * Export Map Plugin — Export current map view as image or embeddable HTML.
 * Equivalent to: QGIS qgis2web (1.6M downloads) + print layout
 */

import { useState } from 'react';
import { Paper, Text, Stack, Button, Group, Badge, Select, NumberInput, TextInput, Switch, Code } from '@mantine/core';
import { IconPhoto, IconShare } from '@tabler/icons-react';
import type { PluginDefinition, PluginContext } from '../sdk';
import { useAppStore } from '../../store/app';
import { maplibreRasterStyle, rasterTiles } from '../../hooks/basemapTiles';
import { getSharedCamera } from '../../hooks/sharedCamera';

type ExportFormat = 'png' | 'jpeg' | 'html-embed' | 'html-full';

/** Container the active renderer draws into, matching ViewerArea's visibility rules. */
function activeCanvas(activeTab: string, renderer: string): HTMLCanvasElement | null {
  const containerId =
    activeTab === 'map' ? 'leaflet-container' : renderer === 'maplibre' ? 'maplibre-container' : 'cesium-container';
  return document.getElementById(containerId)?.querySelector('canvas') ?? null;
}

/** Ground meters per pixel of the exported image, from the web-mercator zoom. */
function metersPerPixel(latitude: number, zoom: number, cssWidth: number, exportWidth: number): number {
  const perCssPixel = (156_543.03392 * Math.cos((latitude * Math.PI) / 180)) / 2 ** zoom;
  return (perCssPixel * cssWidth) / exportWidth;
}

/** Round scale-bar distance near the target pixel width, and how wide it draws. */
function scaleBar(mpp: number, targetPx: number): { label: string; px: number } {
  const raw = mpp * targetPx;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const nice = [1, 2, 5, 10].map((m) => m * pow).find((v) => v >= raw) ?? pow * 10;
  const label = nice >= 1000 ? `${(nice / 1000).toLocaleString()} km` : `${nice} m`;
  return { label, px: nice / mpp };
}

// reads the live app store rather than ctx, so a basemap or renderer switch re-renders the panel
function ExportMapPanel(_props: { ctx: PluginContext }) {
  const [format, setFormat] = useState<ExportFormat>('png');
  const [width, setWidth] = useState(1920);
  const [height, setHeight] = useState(1080);
  const [title, setTitle] = useState('');
  const [includeAttribution, setIncludeAttribution] = useState(true);
  const [includeScaleBar, setIncludeScaleBar] = useState(true);
  const [includeNorthArrow, setIncludeNorthArrow] = useState(false);
  const [embedCode, setEmbedCode] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const activeTab = useAppStore((s) => s.activeTab);
  const renderer = useAppStore((s) => s.renderer);
  const basemap = useAppStore((s) => s.basemap);
  const customBasemap = useAppStore((s) => s.customBasemap);

  const handleExport = async () => {
    setStatus(null);

    if (format === 'html-embed') {
      setEmbedCode(generateEmbedCode());
      return;
    }

    if (format === 'html-full') {
      downloadBlob(new Blob([generateFullHtml()], { type: 'text/html' }), 'map-export.html');
      return;
    }

    // For image formats, capture the canvas of the renderer currently on screen
    try {
      const mapCanvas = activeCanvas(activeTab, renderer);
      if (!mapCanvas) {
        setStatus('No map canvas found — Leaflet draws tiles as images, so switch to MapLibre or Cesium.');
        return;
      }

      // Create export canvas with decorations
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const exportCtx = canvas.getContext('2d')!;

      // Scale and draw map
      exportCtx.drawImage(mapCanvas, 0, 0, width, height);

      const camera = getSharedCamera();

      // Add title
      if (title) {
        exportCtx.fillStyle = 'rgba(255,255,255,0.8)';
        exportCtx.fillRect(10, 10, exportCtx.measureText(title).width + 20, 30);
        exportCtx.fillStyle = '#333';
        exportCtx.font = 'bold 16px sans-serif';
        exportCtx.fillText(title, 20, 30);
      }

      // Add attribution of the basemap actually on screen
      if (includeAttribution) {
        const attr = rasterTiles(basemap, customBasemap).attr;
        exportCtx.font = '11px sans-serif';
        const boxWidth = exportCtx.measureText(attr).width + 20;
        exportCtx.fillStyle = 'rgba(255,255,255,0.7)';
        exportCtx.fillRect(width - boxWidth, height - 25, boxWidth, 25);
        exportCtx.fillStyle = '#666';
        exportCtx.fillText(attr, width - boxWidth + 10, height - 8);
      }

      // Add scale bar, sized from the current zoom and latitude
      if (includeScaleBar) {
        const mpp = metersPerPixel(camera.latitude, camera.zoom, mapCanvas.clientWidth || width, width);
        const bar = scaleBar(mpp, 100);
        exportCtx.fillStyle = '#333';
        exportCtx.fillRect(20, height - 40, bar.px, 4);
        exportCtx.fillRect(20, height - 44, 2, 8);
        exportCtx.fillRect(20 + bar.px, height - 44, 2, 8);
        exportCtx.font = '11px sans-serif';
        exportCtx.fillText(bar.label, 20, height - 48);
      }

      // Add north arrow, rotated against the current bearing
      if (includeNorthArrow) {
        exportCtx.save();
        exportCtx.translate(width - 40, 50);
        exportCtx.rotate((-camera.bearing * Math.PI) / 180);
        exportCtx.fillStyle = '#333';
        exportCtx.beginPath();
        exportCtx.moveTo(0, -20);
        exportCtx.lineTo(-8, 10);
        exportCtx.lineTo(8, 10);
        exportCtx.closePath();
        exportCtx.fill();
        exportCtx.font = 'bold 12px sans-serif';
        exportCtx.textAlign = 'center';
        exportCtx.fillText('N', 0, -24);
        exportCtx.restore();
      }

      // Export
      const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
      const quality = format === 'jpeg' ? 0.92 : undefined;
      canvas.toBlob((blob) => {
        if (blob) downloadBlob(blob, `map-export.${format}`);
      }, mimeType, quality);
      setStatus('Exported.');
    } catch (e) {
      setStatus(`Export error: ${e instanceof Error ? e.message : 'Unknown'}`);
    }
  };

  const generateEmbedCode = (): string => {
    return `<iframe
  src="${window.location.origin}/?embed=true"
  width="${width}"
  height="${height}"
  frameborder="0"
  style="border: 1px solid #ccc; border-radius: 8px;"
  allowfullscreen
  loading="lazy"
  title="${title || 'ViewTopia Map'}"
></iframe>`;
  };

  /**
   * Standalone page on the current view and basemap. Vector basemaps export as
   * their closest raster, so the page needs no style host or key.
   */
  const generateFullHtml = (): string => {
    const camera = getSharedCamera();
    const style = maplibreRasterStyle(basemap, customBasemap);
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title || 'ViewTopia Map Export'}</title>
  <link rel="stylesheet" href="https://unpkg.com/maplibre-gl/dist/maplibre-gl.css">
  <script src="https://unpkg.com/maplibre-gl/dist/maplibre-gl.js"></script>
  <style>
    body { margin: 0; padding: 0; }
    #map { width: 100vw; height: 100vh; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    const map = new maplibregl.Map({
      container: 'map',
      style: ${JSON.stringify(style)},
      center: [${camera.longitude}, ${camera.latitude}],
      zoom: ${camera.zoom},
      bearing: ${camera.bearing},
      pitch: ${camera.pitch}
    });
    map.addControl(new maplibregl.NavigationControl());
    ${includeScaleBar ? 'map.addControl(new maplibregl.ScaleControl());' : ''}
  </script>
</body>
</html>`;
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Paper p="md" withBorder style={{ width: 360 }}>
      <Stack gap="sm">
        <Group justify="space-between">
          <Text fw={600} size="lg">Export Map</Text>
          <Badge size="sm" color="indigo">Share</Badge>
        </Group>

        <Select
          label="Format"
          data={[
            { group: 'Image', items: [
              { value: 'png', label: 'PNG (high quality)' },
              { value: 'jpeg', label: 'JPEG (smaller file)' },
            ]},
            { group: 'Web', items: [
              { value: 'html-embed', label: 'Embed Code (iframe)' },
              { value: 'html-full', label: 'Standalone HTML Page' },
            ]},
          ]}
          value={format}
          onChange={(v) => setFormat((v || 'png') as ExportFormat)}
        />

        <TextInput label="Title" value={title} onChange={(e) => setTitle(e.currentTarget.value)} placeholder="My Map" />

        {!format.startsWith('html') && (
          <Group grow>
            <NumberInput label="Width (px)" value={width} onChange={(v) => setWidth(Number(v))} min={100} max={8000} />
            <NumberInput label="Height (px)" value={height} onChange={(v) => setHeight(Number(v))} min={100} max={8000} />
          </Group>
        )}

        {format === 'html-full' && (
          <Text size="xs" c="dimmed">
            Carries the current centre, zoom and a raster basemap. Layers and drawn features are not included.
          </Text>
        )}

        {!format.startsWith('html') && (
          <Text size="xs" c="dimmed">
            Captures the live frame and scales it to the output size, so a bigger export is the same view, not more detail.
          </Text>
        )}

        <Switch label="Attribution" checked={includeAttribution} onChange={(e) => setIncludeAttribution(e.currentTarget.checked)} />
        <Switch label="Scale Bar" checked={includeScaleBar} onChange={(e) => setIncludeScaleBar(e.currentTarget.checked)} />
        <Switch label="North Arrow" checked={includeNorthArrow} onChange={(e) => setIncludeNorthArrow(e.currentTarget.checked)} />

        <Button leftSection={<IconPhoto size={14} />} onClick={handleExport} fullWidth color="indigo">
          Export
        </Button>

        {status && <Text size="xs" c="dimmed">{status}</Text>}

        {embedCode && (
          <>
            <Text size="xs" fw={500}>Embed Code:</Text>
            <Code block style={{ fontSize: 10 }}>{embedCode}</Code>
          </>
        )}
      </Stack>
    </Paper>
  );
}

const plugin: PluginDefinition = {
  id: 'export-map',
  name: 'Export Map',
  description: 'Export map as PNG, JPEG, or standalone HTML; generate embed codes for websites',
  version: '1.0.0',
  author: 'TileTopia-HQ',
  icon: <IconShare size={14} />,
  category: 'tools',
  Panel: ExportMapPanel,
};

export default plugin;
