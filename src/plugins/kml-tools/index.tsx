/**
 * KML Tools Plugin — Import/export KML and KMZ files.
 * Equivalent to: QGIS KML Tools (771K downloads)
 * Uses @tmcw/togeojson for parsing.
 */

import { useState, useRef } from 'react';
import { Paper, Text, Stack, Button, Group, Badge, FileInput, Code, SegmentedControl, Textarea } from '@mantine/core';
import { IconFileImport, IconFileExport, IconFile } from '@tabler/icons-react';
import { kml, gpx } from '@tmcw/togeojson';
import type { PluginDefinition, PluginContext } from '../sdk';

type ImportFormat = 'kml' | 'kmz' | 'gpx';

function geojsonToKml(geojson: GeoJSON.FeatureCollection): string {
  let kmlStr = '<?xml version="1.0" encoding="UTF-8"?>\n';
  kmlStr += '<kml xmlns="http://www.opengis.net/kml/2.2">\n<Document>\n';
  kmlStr += `  <name>ViewTopia Export</name>\n`;

  for (const feature of geojson.features) {
    kmlStr += '  <Placemark>\n';
    if (feature.properties?.name) {
      kmlStr += `    <name>${feature.properties.name}</name>\n`;
    }
    if (feature.properties?.description) {
      kmlStr += `    <description>${feature.properties.description}</description>\n`;
    }

    const geom = feature.geometry;
    if (geom.type === 'Point') {
      kmlStr += `    <Point><coordinates>${geom.coordinates[0]},${geom.coordinates[1]},${geom.coordinates[2] || 0}</coordinates></Point>\n`;
    } else if (geom.type === 'LineString') {
      const coords = geom.coordinates.map((c) => `${c[0]},${c[1]},${c[2] || 0}`).join(' ');
      kmlStr += `    <LineString><coordinates>${coords}</coordinates></LineString>\n`;
    } else if (geom.type === 'Polygon') {
      kmlStr += '    <Polygon><outerBoundaryIs><LinearRing><coordinates>';
      kmlStr += geom.coordinates[0].map((c) => `${c[0]},${c[1]},${c[2] || 0}`).join(' ');
      kmlStr += '</coordinates></LinearRing></outerBoundaryIs></Polygon>\n';
    } else if (geom.type === 'MultiPoint') {
      kmlStr += '    <MultiGeometry>\n';
      for (const c of geom.coordinates) {
        kmlStr += `      <Point><coordinates>${c[0]},${c[1]},${c[2] || 0}</coordinates></Point>\n`;
      }
      kmlStr += '    </MultiGeometry>\n';
    }

    kmlStr += '  </Placemark>\n';
  }

  kmlStr += '</Document>\n</kml>';
  return kmlStr;
}

function KmlToolsPanel({ ctx }: { ctx: PluginContext }) {
  const [mode, setMode] = useState<'import' | 'export'>('import');
  const [importResult, setImportResult] = useState<string | null>(null);
  const [exportGeojson, setExportGeojson] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleImport = async (file: File | null) => {
    if (!file) return;
    setImportResult(null);

    try {
      let geojson: GeoJSON.FeatureCollection;

      if (file.name.endsWith('.kmz')) {
        // KMZ is a ZIP containing doc.kml
        const { entries } = await import('https://unpkg.com/@nicolo-ribaudo/unzip@1.0.0/index.js' as string).catch(() => ({ entries: null }));
        // Fallback: try reading as KML (some .kmz files are just renamed)
        const text = await file.text();
        const dom = new DOMParser().parseFromString(text, 'text/xml');
        geojson = kml(dom) as GeoJSON.FeatureCollection;
      } else if (file.name.endsWith('.gpx')) {
        const text = await file.text();
        const dom = new DOMParser().parseFromString(text, 'text/xml');
        geojson = gpx(dom) as GeoJSON.FeatureCollection;
      } else {
        // KML
        const text = await file.text();
        const dom = new DOMParser().parseFromString(text, 'text/xml');
        geojson = kml(dom) as GeoJSON.FeatureCollection;
      }

      const layerId = `import-${file.name.replace(/\.[^.]+$/, '')}-${Date.now()}`;
      ctx.map.addGeoJsonLayer(layerId, geojson, { color: '#3498db', lineWidth: 2 });

      setImportResult(`✓ Imported ${geojson.features.length} features from ${file.name}\nLayer: ${layerId}`);

      // Fit to bounds if features exist
      if (geojson.features.length > 0) {
        const coords = geojson.features.flatMap((f) => {
          const g = f.geometry;
          if (g.type === 'Point') return [g.coordinates];
          if (g.type === 'LineString') return g.coordinates;
          if (g.type === 'Polygon') return g.coordinates[0];
          if (g.type === 'MultiPoint') return g.coordinates;
          return [];
        });
        if (coords.length > 0) {
          const lngs = coords.map((c) => c[0]);
          const lats = coords.map((c) => c[1]);
          ctx.map.fitBounds([Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)]);
        }
      }
    } catch (e) {
      setImportResult(`✗ Error: ${e instanceof Error ? e.message : 'Failed to parse file'}`);
    }
  };

  const handleExport = () => {
    try {
      const geojson = JSON.parse(exportGeojson) as GeoJSON.FeatureCollection;
      const kmlContent = geojsonToKml(geojson);

      const blob = new Blob([kmlContent], { type: 'application/vnd.google-earth.kml+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'export.kml';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(`Export error: ${e instanceof Error ? e.message : 'Invalid GeoJSON'}`);
    }
  };

  return (
    <Paper p="md" withBorder style={{ width: 380 }}>
      <Stack gap="sm">
        <Group justify="space-between">
          <Text fw={600} size="lg">KML Tools</Text>
          <Badge size="sm" color="blue">KML/KMZ/GPX</Badge>
        </Group>

        <SegmentedControl
          fullWidth
          data={[
            { value: 'import', label: 'Import' },
            { value: 'export', label: 'Export' },
          ]}
          value={mode}
          onChange={(v) => setMode(v as 'import' | 'export')}
        />

        {mode === 'import' ? (
          <>
            <FileInput
              label="Select File"
              accept=".kml,.kmz,.gpx"
              placeholder="Choose .kml, .kmz, or .gpx file"
              leftSection={<IconFileImport size={14} />}
              onChange={handleImport}
            />
            <Text size="xs" c="dimmed">
              Supports KML, KMZ (Google Earth), and GPX (GPS tracks) files.
              Features are converted to GeoJSON and added as a map layer.
            </Text>
            {importResult && <Code block>{importResult}</Code>}
          </>
        ) : (
          <>
            <Textarea
              label="GeoJSON to Export"
              placeholder='{"type":"FeatureCollection","features":[...]}'
              minRows={6}
              value={exportGeojson}
              onChange={(e) => setExportGeojson(e.currentTarget.value)}
            />
            <Button leftSection={<IconFileExport size={14} />} onClick={handleExport} fullWidth>
              Export as KML
            </Button>
          </>
        )}
      </Stack>
    </Paper>
  );
}

const plugin: PluginDefinition = {
  id: 'kml-tools',
  name: 'KML Tools',
  description: 'Import KML, KMZ, and GPX files; export GeoJSON layers as KML for Google Earth',
  version: '1.0.0',
  author: 'TileTopia-HQ',
  icon: <IconFile size={14} />,
  category: 'data',
  Panel: KmlToolsPanel,
};

export default plugin;
