/**
 * Basemap Catalog Plugin — Quick access to 30+ basemap providers.
 * Equivalent to: QGIS QuickMapServices + HCMGIS basemaps (13.4M combined downloads)
 */

import { useState } from 'react';
import { Paper, Text, Stack, TextInput, Group, Badge, SimpleGrid, UnstyledButton, Image, Tooltip } from '@mantine/core';
import { IconMap2, IconSearch } from '@tabler/icons-react';
import type { PluginDefinition, PluginContext } from '../sdk';

interface BasemapSource {
  id: string;
  name: string;
  url: string;
  attribution: string;
  category: 'streets' | 'satellite' | 'terrain' | 'topo' | 'dark' | 'light' | 'specialty';
  preview?: string;
  /** provider needs an api key: the settings key holding it and the query param it goes in */
  keyAuth?: { setting: string; param: string };
}

// jawg tiles answer 400 without an access token, so those sources render a
// configure-a-key state instead of previewing or selecting them
const JAWG_AUTH = { setting: 'jawgAccessToken', param: 'access-token' };

const BASEMAPS: BasemapSource[] = [
  // Streets
  { id: 'osm-standard', name: 'OpenStreetMap', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '© OpenStreetMap contributors', category: 'streets' },
  { id: 'osm-hot', name: 'OSM Humanitarian', url: 'https://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', attribution: '© OpenStreetMap contributors, HOT', category: 'streets' },
  { id: 'carto-voyager', name: 'Carto Voyager', url: 'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png', attribution: '© Carto, © OSM contributors', category: 'streets' },
  { id: 'carto-positron', name: 'Carto Positron', url: 'https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', attribution: '© Carto, © OSM contributors', category: 'light' },
  { id: 'carto-dark', name: 'Carto Dark Matter', url: 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', attribution: '© Carto, © OSM contributors', category: 'dark' },
  // Satellite
  { id: 'esri-world-imagery', name: 'Esri World Imagery', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: '© Esri', category: 'satellite' },
  { id: 'esri-clarity', name: 'Esri Clarity', url: 'https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: '© Esri', category: 'satellite' },
  // Terrain
  { id: 'otm', name: 'OpenTopoMap', url: 'https://tile.opentopomap.org/{z}/{x}/{y}.png', attribution: '© OpenTopoMap (CC-BY-SA)', category: 'topo' },
  { id: 'stamen-terrain', name: 'Stadia Terrain', url: 'https://tiles.stadiamaps.com/tiles/stamen_terrain/{z}/{x}/{y}.png', attribution: '© Stadia Maps, © Stamen, © OSM', category: 'terrain' },
  { id: 'stamen-toner', name: 'Stadia Toner', url: 'https://tiles.stadiamaps.com/tiles/stamen_toner/{z}/{x}/{y}.png', attribution: '© Stadia Maps, © Stamen, © OSM', category: 'dark' },
  { id: 'stamen-watercolor', name: 'Stadia Watercolor', url: 'https://tiles.stadiamaps.com/tiles/stamen_watercolor/{z}/{x}/{y}.jpg', attribution: '© Stadia Maps, © Stamen, © OSM', category: 'specialty' },
  // Topo
  { id: 'esri-topo', name: 'Esri World Topo', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', attribution: '© Esri', category: 'topo' },
  { id: 'esri-natgeo', name: 'Esri National Geographic', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}', attribution: '© Esri, National Geographic', category: 'topo' },
  // Light
  { id: 'esri-light-gray', name: 'Esri Light Gray', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', attribution: '© Esri', category: 'light' },
  { id: 'alidade-smooth', name: 'Stadia Smooth', url: 'https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}.png', attribution: '© Stadia Maps, © OSM', category: 'light' },
  // Dark
  { id: 'esri-dark-gray', name: 'Esri Dark Gray', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', attribution: '© Esri', category: 'dark' },
  { id: 'alidade-dark', name: 'Stadia Dark', url: 'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}.png', attribution: '© Stadia Maps, © OSM', category: 'dark' },
  // Specialty
  { id: 'esri-ocean', name: 'Esri Ocean', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}', attribution: '© Esri', category: 'specialty' },
  { id: 'openseamap', name: 'OpenSeaMap', url: 'https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png', attribution: '© OpenSeaMap contributors', category: 'specialty' },
  { id: 'openrailway', name: 'OpenRailwayMap', url: 'https://tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png', attribution: '© OpenRailwayMap, © OSM', category: 'specialty' },
  { id: 'cyclosm', name: 'CyclOSM', url: 'https://a.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png', attribution: '© CyclOSM, © OSM contributors', category: 'specialty' },
  { id: 'waymarked-hiking', name: 'Waymarked Hiking', url: 'https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png', attribution: '© Waymarked Trails', category: 'specialty' },
  { id: 'waymarked-cycling', name: 'Waymarked Cycling', url: 'https://tile.waymarkedtrails.org/cycling/{z}/{x}/{y}.png', attribution: '© Waymarked Trails', category: 'specialty' },
  // Historical / Specialized
  { id: 'openhistorical', name: 'OHM Historical', url: 'https://www.openhistoricalmap.org/render/{z}/{x}/{y}.png', attribution: '© OpenHistoricalMap', category: 'specialty' },
  { id: 'thunderforest-landscape', name: 'Thunderforest Landscape', url: 'https://tile.thunderforest.com/landscape/{z}/{x}/{y}.png', attribution: '© Thunderforest, © OSM', category: 'terrain' },
  { id: 'thunderforest-outdoors', name: 'Thunderforest Outdoors', url: 'https://tile.thunderforest.com/outdoors/{z}/{x}/{y}.png', attribution: '© Thunderforest, © OSM', category: 'terrain' },
  { id: 'jawg-streets', name: 'Jawg Streets', url: 'https://tile.jawg.io/jawg-streets/{z}/{x}/{y}.png', attribution: '© Jawg, © OSM', category: 'streets', keyAuth: JAWG_AUTH },
  { id: 'jawg-dark', name: 'Jawg Dark', url: 'https://tile.jawg.io/jawg-dark/{z}/{x}/{y}.png', attribution: '© Jawg, © OSM', category: 'dark', keyAuth: JAWG_AUTH },
  { id: 'jawg-terrain', name: 'Jawg Terrain', url: 'https://tile.jawg.io/jawg-terrain/{z}/{x}/{y}.png', attribution: '© Jawg, © OSM', category: 'terrain', keyAuth: JAWG_AUTH },
  { id: 'esri-streets', name: 'Esri Streets', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', attribution: '© Esri', category: 'streets' },
];

const CATEGORY_COLORS: Record<string, string> = {
  streets: 'blue',
  satellite: 'green',
  terrain: 'orange',
  topo: 'cyan',
  dark: 'grape',
  light: 'gray',
  specialty: 'pink',
};

function BasemapCatalogPanel({ ctx }: { ctx: PluginContext }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState(() =>
    String(ctx.settings.get('activeBasemap', '') ?? ''),
  );

  const filtered = BASEMAPS.filter((b) => {
    const matchSearch = !search || b.name.toLowerCase().includes(search.toLowerCase());
    const matchCategory = !filter || b.category === filter;
    return matchSearch && matchCategory;
  });

  const categories = [...new Set(BASEMAPS.map((b) => b.category))];

  const keyFor = (b: BasemapSource) =>
    b.keyAuth ? String(ctx.settings.get(b.keyAuth.setting, '') ?? '').trim() : '';

  const tileUrl = (b: BasemapSource, key: string) =>
    b.keyAuth ? `${b.url}?${b.keyAuth.param}=${key}` : b.url;

  return (
    <Paper p="md" withBorder style={{ width: 360, maxHeight: '80vh', overflow: 'auto' }}>
      <Stack gap="sm">
        <Group justify="space-between">
          <Text fw={600} size="lg">Basemap Catalog</Text>
          <Badge size="sm">{BASEMAPS.length} sources</Badge>
        </Group>

        <TextInput
          placeholder="Search basemaps..."
          leftSection={<IconSearch size={14} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />

        <Group gap="xs">
          <Badge
            variant={filter === null ? 'filled' : 'light'}
            style={{ cursor: 'pointer' }}
            onClick={() => setFilter(null)}
          >
            All
          </Badge>
          {categories.map((cat) => (
            <Badge
              key={cat}
              color={CATEGORY_COLORS[cat]}
              variant={filter === cat ? 'filled' : 'light'}
              style={{ cursor: 'pointer' }}
              onClick={() => setFilter(filter === cat ? null : cat)}
            >
              {cat}
            </Badge>
          ))}
        </Group>

        <SimpleGrid cols={2} spacing="xs">
          {filtered.map((basemap) => {
            const key = keyFor(basemap);
            const needsKey = !!basemap.keyAuth && !key;
            const url = tileUrl(basemap, key);
            return (
              <Tooltip key={basemap.id} label={basemap.attribution} position="bottom">
                <UnstyledButton
                  disabled={needsKey}
                  onClick={() => {
                    ctx.store.setCustomBasemap({ url, attr: basemap.attribution });
                    setSelected(basemap.id);
                    ctx.settings.set('activeBasemap', basemap.id);
                    ctx.settings.set('activeBasemapUrl', url);
                  }}
                  style={{
                    padding: 8,
                    borderRadius: 8,
                    border: `1px solid ${
                      selected === basemap.id
                        ? 'var(--mantine-color-blue-6)'
                        : 'var(--mantine-color-default-border)'
                    }`,
                    textAlign: 'center',
                  }}
                >
                  <Stack gap={4} align="center">
                    {needsKey ? (
                      <Text size="xs" c="dimmed" data-testid="basemap-needs-key">
                        Add an API key in plugin settings
                      </Text>
                    ) : (
                      <Image
                        src={url.replace('{z}', '2').replace('{x}', '2').replace('{y}', '1')}
                        h={48}
                        w={48}
                        radius="sm"
                        fallbackSrc="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='48' height='48'><rect fill='%23ccc' width='48' height='48'/></svg>"
                      />
                    )}
                    <Text size="xs" lineClamp={1}>{basemap.name}</Text>
                    <Badge size="xs" color={CATEGORY_COLORS[basemap.category]}>{basemap.category}</Badge>
                  </Stack>
                </UnstyledButton>
              </Tooltip>
            );
          })}
        </SimpleGrid>
      </Stack>
    </Paper>
  );
}

const plugin: PluginDefinition = {
  id: 'basemap-catalog',
  name: 'Basemap Catalog',
  description: 'Quick access to 30+ basemap providers — streets, satellite, terrain, topo, dark, and specialty maps',
  version: '1.0.0',
  author: 'TileTopia-HQ',
  icon: <IconMap2 size={14} />,
  category: 'data',
  Panel: BasemapCatalogPanel,
  settings: [
    { key: 'activeBasemap', label: 'Active Basemap', type: 'text', defaultValue: 'osm-standard' },
    { key: 'jawgAccessToken', label: 'Jawg Access Token', type: 'text' },
  ],
};

export default plugin;
