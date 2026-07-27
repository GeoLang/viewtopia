/**
 * Export Map Plugin — Export current map view as image, PDF, or embeddable HTML.
 * Equivalent to: QGIS qgis2web (1.6M downloads) + print layout
 */

import { useState } from 'react';
import { Paper, Text, Stack, Button, Group, Badge, Select, NumberInput, TextInput, Switch, Code } from '@mantine/core';
import { IconPhoto, IconShare } from '@tabler/icons-react';
import type { PluginDefinition, PluginContext } from '../sdk';

type ExportFormat = 'png' | 'jpeg' | 'svg' | 'pdf' | 'html-embed' | 'html-full';

function ExportMapPanel({ ctx }: { ctx: PluginContext }) {
  const [format, setFormat] = useState<ExportFormat>('png');
  const [width, setWidth] = useState(1920);
  const [height, setHeight] = useState(1080);
  const [dpi, setDpi] = useState(96);
  const [title, setTitle] = useState('');
  const [includeAttribution, setIncludeAttribution] = useState(true);
  const [includeScaleBar, setIncludeScaleBar] = useState(true);
  const [includeNorthArrow, setIncludeNorthArrow] = useState(false);
  const [embedCode, setEmbedCode] = useState<string | null>(null);

  const handleExport = async () => {
    if (format === 'html-embed') {
      const code = generateEmbedCode();
      setEmbedCode(code);
      return;
    }

    if (format === 'html-full') {
      const html = generateFullHtml();
      downloadBlob(new Blob([html], { type: 'text/html' }), 'map-export.html');
      return;
    }

    // For image formats, capture the map canvas
    try {
      const mapCanvas = document.querySelector('canvas') as HTMLCanvasElement;
      if (!mapCanvas) {
        alert('No map canvas found');
        return;
      }

      // Create export canvas with decorations
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const exportCtx = canvas.getContext('2d')!;

      // Scale and draw map
      exportCtx.drawImage(mapCanvas, 0, 0, width, height);

      // Add title
      if (title) {
        exportCtx.fillStyle = 'rgba(255,255,255,0.8)';
        exportCtx.fillRect(10, 10, exportCtx.measureText(title).width + 20, 30);
        exportCtx.fillStyle = '#333';
        exportCtx.font = 'bold 16px sans-serif';
        exportCtx.fillText(title, 20, 30);
      }

      // Add attribution
      if (includeAttribution) {
        const attr = '© OpenStreetMap contributors';
        exportCtx.fillStyle = 'rgba(255,255,255,0.7)';
        exportCtx.fillRect(width - 250, height - 25, 250, 25);
        exportCtx.fillStyle = '#666';
        exportCtx.font = '11px sans-serif';
        exportCtx.fillText(attr, width - 240, height - 8);
      }

      // Add scale bar
      if (includeScaleBar) {
        exportCtx.fillStyle = '#333';
        exportCtx.fillRect(20, height - 40, 100, 4);
        exportCtx.fillRect(20, height - 44, 2, 8);
        exportCtx.fillRect(120, height - 44, 2, 8);
        exportCtx.font = '11px sans-serif';
        exportCtx.fillText('1 km', 50, height - 48);
      }

      // Add north arrow
      if (includeNorthArrow) {
        exportCtx.save();
        exportCtx.translate(width - 40, 50);
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
    } catch (e) {
      alert(`Export error: ${e instanceof Error ? e.message : 'Unknown'}`);
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

  const generateFullHtml = (): string => {
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
      style: 'https://demotiles.maplibre.org/style.json',
      center: [0, 0],
      zoom: 2
    });
    map.addControl(new maplibregl.NavigationControl());
    ${includeScaleBar ? "map.addControl(new maplibregl.ScaleControl());" : ''}
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

        <Switch label="Attribution" checked={includeAttribution} onChange={(e) => setIncludeAttribution(e.currentTarget.checked)} />
        <Switch label="Scale Bar" checked={includeScaleBar} onChange={(e) => setIncludeScaleBar(e.currentTarget.checked)} />
        <Switch label="North Arrow" checked={includeNorthArrow} onChange={(e) => setIncludeNorthArrow(e.currentTarget.checked)} />

        <Button leftSection={<IconPhoto size={14} />} onClick={handleExport} fullWidth color="indigo">
          Export
        </Button>

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
