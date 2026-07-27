/**
 * Data Catalog Plugin — Search and browse geospatial data catalogs (STAC, CSW, WMS/WFS).
 * Equivalent to: QGIS MetaSearch Catalogue Client (856K downloads)
 */

import { useState } from 'react';
import { Paper, Text, Stack, Button, Group, Badge, TextInput, Select, Table, Loader, } from '@mantine/core';
import { IconDatabase, IconSearch, } from '@tabler/icons-react';
import type { PluginDefinition, PluginContext } from '../sdk';

interface CatalogResult {
  id: string;
  title: string;
  description: string;
  type: 'raster' | 'vector' | 'service' | 'collection';
  url?: string;
  bbox?: [number, number, number, number];
  datetime?: string;
  provider?: string;
}

// Well-known STAC catalogs
const STAC_CATALOGS = [
  { value: 'https://earth-search.aws.element84.com/v1', label: 'Earth Search (Sentinel, Landsat)' },
  { value: 'https://planetarycomputer.microsoft.com/api/stac/v1', label: 'Microsoft Planetary Computer' },
  { value: 'https://stac.openlandmap.org', label: 'OpenLandMap' },
  { value: 'custom', label: '— Custom URL —' },
];

async function searchStac(catalogUrl: string, query: string, bbox?: string): Promise<CatalogResult[]> {
  const searchUrl = `${catalogUrl}/search`;
  const body: Record<string, unknown> = {
    limit: 20,
  };

  if (query) {
    body.query = { 'eo:cloud_cover': { lt: 20 } };
    body.collections = [query];
  }

  if (bbox) {
    body.bbox = bbox.split(',').map(Number);
  }

  const resp = await fetch(searchUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    // Try GET collections instead
    const collResp = await fetch(`${catalogUrl}/collections`);
    if (!collResp.ok) throw new Error(`Catalog error: ${resp.status}`);
    const data = await collResp.json();
    return (data.collections || []).map((c: Record<string, unknown>) => ({
      id: c.id as string,
      title: (c.title || c.id) as string,
      description: ((c.description as string) || '').slice(0, 100),
      type: 'collection' as const,
      url: (c.links as Array<{ href: string }>)?.find((l) => l.href)?.href,
      bbox: (c.extent as Record<string, unknown>)?.spatial
        ? ((c.extent as Record<string, Record<string, number[][]>>).spatial.bbox?.[0] as unknown as [number, number, number, number])
        : undefined,
    }));
  }

  const data = await resp.json();
  return (data.features || []).map((f: Record<string, unknown>) => ({
    id: (f.id || '') as string,
    title: ((f.properties as Record<string, string>)?.title || f.id || '') as string,
    description: ((f.properties as Record<string, string>)?.description || '').slice(0, 100),
    type: 'raster' as const,
    bbox: f.bbox as [number, number, number, number] | undefined,
    datetime: (f.properties as Record<string, string>)?.datetime,
    url: (f.assets as Record<string, { href: string }>)?.visual?.href,
  }));
}

function DataCatalogPanel({ ctx }: { ctx: PluginContext }) {
  const [catalog, setCatalog] = useState(STAC_CATALOGS[0].value);
  const [customUrl, setCustomUrl] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [bbox, setBbox] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<CatalogResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    setLoading(true);
    setError(null);
    setResults([]);

    try {
      const url = catalog === 'custom' ? customUrl : catalog;
      const items = await searchStac(url, searchQuery, bbox || undefined);
      setResults(items);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  const handleAddToMap = (item: CatalogResult) => {
    if (item.bbox) {
      ctx.map.fitBounds(item.bbox);
    }
    if (item.url) {
      // Add as a data source reference
      ctx.map.addGeoJsonLayer(`catalog-${item.id}`, {
        type: 'FeatureCollection',
        features: item.bbox ? [{
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [item.bbox[0], item.bbox[1]],
              [item.bbox[2], item.bbox[1]],
              [item.bbox[2], item.bbox[3]],
              [item.bbox[0], item.bbox[3]],
              [item.bbox[0], item.bbox[1]],
            ]],
          },
          properties: { title: item.title, url: item.url },
        }] : [],
      }, { color: '#3498db', lineWidth: 2, opacity: 0.3 });
    }
  };

  return (
    <Paper p="md" withBorder style={{ width: 420, maxHeight: '80vh', overflow: 'auto' }}>
      <Stack gap="sm">
        <Group justify="space-between">
          <Text fw={600} size="lg">Data Catalog</Text>
          <Badge size="sm" color="cyan">STAC</Badge>
        </Group>

        <Select
          label="Catalog"
          data={STAC_CATALOGS}
          value={catalog}
          onChange={(v) => setCatalog(v || STAC_CATALOGS[0].value)}
        />

        {catalog === 'custom' && (
          <TextInput
            label="Custom STAC URL"
            value={customUrl}
            onChange={(e) => setCustomUrl(e.currentTarget.value)}
            placeholder="https://my-stac-server.com/v1"
          />
        )}

        <TextInput
          label="Collection / Query"
          placeholder="sentinel-2-l2a, landsat-c2-l2..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.currentTarget.value)}
        />

        <TextInput
          label="Bounding Box (optional)"
          placeholder="west,south,east,north"
          value={bbox}
          onChange={(e) => setBbox(e.currentTarget.value)}
        />

        <Button
          leftSection={loading ? <Loader size={14} /> : <IconSearch size={14} />}
          onClick={handleSearch}
          disabled={loading}
          fullWidth
          color="cyan"
        >
          {loading ? 'Searching...' : 'Search Catalog'}
        </Button>

        {error && <Text size="sm" c="red">{error}</Text>}

        {results.length > 0 && (
          <>
            <Text size="sm" c="dimmed">{results.length} results</Text>
            <Table striped withTableBorder style={{ fontSize: 11 }}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Title</Table.Th>
                  <Table.Th>Type</Table.Th>
                  <Table.Th>Date</Table.Th>
                  <Table.Th></Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {results.map((r) => (
                  <Table.Tr key={r.id}>
                    <Table.Td>
                      <Text size="xs" lineClamp={1}>{r.title}</Text>
                    </Table.Td>
                    <Table.Td><Badge size="xs">{r.type}</Badge></Table.Td>
                    <Table.Td><Text size="xs">{r.datetime?.split('T')[0] || '—'}</Text></Table.Td>
                    <Table.Td>
                      <Button size="compact-xs" variant="light" onClick={() => handleAddToMap(r)}>
                        + Map
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </>
        )}
      </Stack>
    </Paper>
  );
}

const plugin: PluginDefinition = {
  id: 'data-catalog',
  name: 'Data Catalog',
  description: 'Search and browse STAC geospatial data catalogs — Sentinel, Landsat, Planetary Computer, and custom endpoints',
  version: '1.0.0',
  author: 'TileTopia-HQ',
  icon: <IconDatabase size={14} />,
  category: 'data',
  Panel: DataCatalogPanel,
  settings: [
    { key: 'defaultCatalog', label: 'Default Catalog', type: 'text', defaultValue: 'https://earth-search.aws.element84.com/v1' },
    { key: 'maxResults', label: 'Max Results', type: 'number', defaultValue: 20, min: 5, max: 100 },
  ],
};

export default plugin;
