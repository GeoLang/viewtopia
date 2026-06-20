import { useCallback } from 'react';
import { Tabs, Group, Select, Button, Menu, Box, ActionIcon, Tooltip } from '@mantine/core';
import {
  IconGlobe,
  IconMap,
  IconRuler,
  IconPencil,
  IconMapPin,
  IconInfoCircle,
  IconSearch,
  IconWorld,
  IconTool,
  IconRoute,
  IconBookmark,
  IconDownload,
  IconMapPins,
  IconStack2,
  IconBuildingSkyscraper,
  IconColumns,
  IconChartBar,
  IconTimeline,
  IconUsers,
  IconLink,
  IconSettings,
  IconPackage,
  IconFileExport,
  IconBook,
  IconCategory,
  IconMountain,
  IconChartAreaLine,
  IconClick,
  IconVectorTriangle,
  IconPalette,
} from '@tabler/icons-react';
import { useAppStore, type Renderer, type Basemap, type ViewerTab } from '../store/app';
import { useSpaceTimeStore } from '../features/spacetime/store';
import { getPlugins } from '../plugins/registry';
import { FlyToSearch } from './FlyToSearch';

const TAB_DATA: { value: ViewerTab; label: string; icon: React.ReactNode }[] = [
  { value: 'globe', label: '3D Globe', icon: <IconGlobe size={14} /> },
  { value: 'map', label: '2D Map', icon: <IconMap size={14} /> },
];

const RENDERER_OPTIONS: { value: Renderer; label: string }[] = [
  { value: 'cesium', label: 'CesiumJS' },
  { value: 'deckgl', label: 'deck.gl' },
  { value: 'maplibre', label: 'MapLibre' },
];

const BASEMAP_OPTIONS: { value: Basemap; label: string }[] = [
  { value: 'osm', label: 'OSM' },
  { value: 'satellite', label: 'Satellite' },
  { value: 'topo', label: 'Topo' },
  { value: 'dark', label: 'Dark' },
];

export function ViewerToolbar() {
  const { activeTab, setActiveTab, renderer, setRenderer, basemap, setBasemap, togglePanel } = useAppStore();
  const toggleSpaceTime = useSpaceTimeStore((s) => s.togglePanel);
  const plugins = getPlugins();

  const handleExportPng = useCallback(() => {
    // Find the active canvas element and export it
    const canvas = document.querySelector(
      '#cesium-container canvas, #deckgl-container canvas, #maplibre-container canvas, #leaflet-container canvas',
    ) as HTMLCanvasElement | null;
    if (!canvas) return;
    try {
      const link = document.createElement('a');
      link.download = `viewtopia-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch {
      // Canvas may be tainted by cross-origin tiles
    }
  }, []);

  return (
    <Group
      px="sm"
      py={4}
      justify="space-between"
      style={{ borderBottom: '1px solid #30363d', background: '#161b22', overflowX: 'auto' }}
      wrap="nowrap"
    >
      <Tabs
        value={activeTab}
        onChange={(v) => v && setActiveTab(v as ViewerTab)}
        variant="pills"
        radius="sm"
      >
        <Tabs.List>
          {TAB_DATA.map((tab) => (
            <Tabs.Tab
              key={tab.value}
              value={tab.value}
              leftSection={tab.icon}
              size="xs"
            >
              {tab.label}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs>

      <Group gap="xs" wrap="nowrap">
        <FlyToSearch />
        <Select
          size="xs"
          w={110}
          aria-label="Renderer"
          data={RENDERER_OPTIONS}
          value={renderer}
          onChange={(v) => v && setRenderer(v as Renderer)}
          styles={{
            input: { background: '#0d1117', borderColor: '#30363d' },
          }}
        />

        <Select
          size="xs"
          w={100}
          data={BASEMAP_OPTIONS}
          value={basemap}
          onChange={(v) => v && setBasemap(v as Basemap)}
          styles={{
            input: { background: '#0d1117', borderColor: '#30363d' },
          }}
        />

        <Tooltip label="Measure"><ActionIcon aria-label="Measure" size="sm" variant="subtle" color="gray" onClick={() => togglePanel('measure')}><IconRuler size={14} /></ActionIcon></Tooltip>
        <Tooltip label="Draw"><ActionIcon aria-label="Draw" size="sm" variant="subtle" color="gray" onClick={() => togglePanel('draw')}><IconPencil size={14} /></ActionIcon></Tooltip>
        <Tooltip label="Annotate"><ActionIcon aria-label="Annotate" size="sm" variant="subtle" color="gray" onClick={() => togglePanel('annotate')}><IconMapPin size={14} /></ActionIcon></Tooltip>
        <Tooltip label="Route"><ActionIcon aria-label="Route" size="sm" variant="subtle" color="gray" onClick={() => togglePanel('routing')}><IconRoute size={14} /></ActionIcon></Tooltip>
        <Tooltip label="Bookmarks"><ActionIcon aria-label="Bookmarks" size="sm" variant="subtle" color="gray" onClick={() => togglePanel('bookmark')}><IconBookmark size={14} /></ActionIcon></Tooltip>
        <Tooltip label="Search"><ActionIcon aria-label="Search" size="sm" variant="subtle" color="gray" onClick={() => togglePanel('geocoding')}><IconSearch size={14} /></ActionIcon></Tooltip>
        <Tooltip label="Layers"><ActionIcon aria-label="Layers" size="sm" variant="subtle" color="gray" onClick={() => togglePanel('layers')}><IconStack2 size={14} /></ActionIcon></Tooltip>
        <Tooltip label="Buildings"><ActionIcon aria-label="Buildings" size="sm" variant="subtle" color="gray" onClick={() => togglePanel('buildings')}><IconBuildingSkyscraper size={14} /></ActionIcon></Tooltip>
        <Tooltip label="Inspect"><ActionIcon aria-label="Inspect" size="sm" variant="subtle" color="gray" onClick={() => togglePanel('featurePicker')}><IconClick size={14} /></ActionIcon></Tooltip>
        <Tooltip label="GeoJSON Editor"><ActionIcon aria-label="GeoJSON Editor" size="sm" variant="subtle" color="gray" onClick={() => togglePanel('geojsonEditor')}><IconVectorTriangle size={14} /></ActionIcon></Tooltip>
        <Tooltip label="Style Editor"><ActionIcon aria-label="Style Editor" size="sm" variant="subtle" color="gray" onClick={() => togglePanel('styleEditor')}><IconPalette size={14} /></ActionIcon></Tooltip>
        <Tooltip label="Export PNG"><ActionIcon aria-label="Export PNG" size="sm" variant="subtle" color="gray" onClick={handleExportPng}><IconDownload size={14} /></ActionIcon></Tooltip>

        <Menu shadow="md" width={180}>
          <Menu.Target>
            <Button size="xs" variant="subtle" leftSection={<IconInfoCircle size={14} />}>
              Analysis
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item onClick={() => togglePanel('clipping')}>✂ Clip</Menu.Item>
            <Menu.Item onClick={() => togglePanel('crossSection')}>📐 Section</Menu.Item>
            <Menu.Item onClick={() => togglePanel('heatmap')}>🔥 Heatmap</Menu.Item>
            <Menu.Item onClick={() => togglePanel('timelapse')}>⏳ Timelapse</Menu.Item>
            <Menu.Item onClick={toggleSpaceTime}>🕐 Space-Time</Menu.Item>
            <Menu.Divider />
            <Menu.Item onClick={() => togglePanel('shadows')}>🌑 Shadows</Menu.Item>
            <Menu.Item onClick={() => togglePanel('viewshed')}>👁 Viewshed</Menu.Item>
            <Menu.Item onClick={() => togglePanel('volume')}>📦 Volume</Menu.Item>
            <Menu.Item onClick={() => togglePanel('terrainAnalysis')}>⛰ Terrain</Menu.Item>
            <Menu.Item onClick={() => togglePanel('terrainProfile')}>📈 Profile</Menu.Item>
            <Menu.Item onClick={() => togglePanel('spatialStats')}>📊 Statistics</Menu.Item>
            <Menu.Item onClick={() => togglePanel('pointCloudCompare')}>🔄 Cloud Compare</Menu.Item>
            <Menu.Item onClick={() => togglePanel('classification')}>🏷 Classification</Menu.Item>
          </Menu.Dropdown>
        </Menu>

        <Menu shadow="md" width={160}>
          <Menu.Target>
            <Button size="xs" variant="subtle" leftSection={<IconWorld size={14} />}>
              Simulate
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item onClick={() => togglePanel('weather')}>🌦 Weather</Menu.Item>
            <Menu.Item onClick={() => togglePanel('flood')}>🌊 Flood</Menu.Item>
            <Menu.Item onClick={() => togglePanel('wind')}>💨 Wind</Menu.Item>
            <Menu.Item onClick={() => togglePanel('lighting')}>☀ Lighting</Menu.Item>
            <Menu.Item onClick={() => togglePanel('noise')}>🔊 Noise</Menu.Item>
            <Menu.Item onClick={() => togglePanel('energy')}>🔋 Energy</Menu.Item>
            <Menu.Item onClick={() => togglePanel('solar')}>☀ Solar</Menu.Item>
            <Menu.Item onClick={() => togglePanel('traffic')}>🚗 Traffic</Menu.Item>
          </Menu.Dropdown>
        </Menu>

        <Menu shadow="md" width={180}>
          <Menu.Target>
            <Button size="xs" variant="subtle" leftSection={<IconTool size={14} />}>
              Tools
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item onClick={() => togglePanel('photo')}>📷 Photo</Menu.Item>
            <Menu.Item onClick={() => togglePanel('offline')}>💾 Offline</Menu.Item>
            <Menu.Item onClick={() => togglePanel('indoor')}>🏛 Indoor</Menu.Item>
            <Menu.Item onClick={() => togglePanel('drone')}>🛸 Drone</Menu.Item>
            <Menu.Item onClick={() => togglePanel('webxr')}>🥽 WebXR</Menu.Item>
            <Menu.Item onClick={() => togglePanel('accessibility')}>♿ A11y</Menu.Item>
            <Menu.Item onClick={() => togglePanel('export3d')}>🖨 3D Print</Menu.Item>
            <Menu.Item onClick={() => togglePanel('flythrough')}>🎬 Flythrough</Menu.Item>
            <Menu.Divider />
            <Menu.Item onClick={() => togglePanel('charts')}>📊 Charts</Menu.Item>
            <Menu.Item onClick={() => togglePanel('dashboards')}>📈 Dashboards</Menu.Item>
            <Menu.Item onClick={() => togglePanel('splitView')}>🔲 Split View</Menu.Item>
            <Menu.Item onClick={() => togglePanel('stories')}>📖 Stories</Menu.Item>
            <Menu.Item onClick={() => togglePanel('timeline')}>⏱ Timeline</Menu.Item>
            <Menu.Item onClick={() => togglePanel('dataTable')}>📋 Data Table</Menu.Item>
            <Menu.Item onClick={() => togglePanel('collaboration')}>👥 Collaborate</Menu.Item>
            <Menu.Item onClick={() => togglePanel('printExport')}>🖨 Print/Export</Menu.Item>
          </Menu.Dropdown>
        </Menu>

        <Menu shadow="md" width={180}>
          <Menu.Target>
            <Button size="xs" variant="subtle" leftSection={<IconPackage size={14} />}>
              Data
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item onClick={() => togglePanel('portal')}>🗂 Catalog</Menu.Item>
            <Menu.Divider />
            <Menu.Item onClick={() => togglePanel('assets')}>📦 Assets</Menu.Item>
            <Menu.Item onClick={() => togglePanel('ogc')}>🌐 OGC Layers</Menu.Item>
            <Menu.Item onClick={() => togglePanel('import')}>📂 Import</Menu.Item>
            <Menu.Item onClick={() => togglePanel('modelImport')}>🧊 3D Models</Menu.Item>
            <Menu.Item onClick={() => togglePanel('trackImport')}>🗺 Tracks</Menu.Item>
            <Menu.Item onClick={() => togglePanel('vectorTiles')}>🔷 Vector Tiles</Menu.Item>
            <Menu.Item onClick={() => togglePanel('rasterViewer')}>🖼 Raster/COG</Menu.Item>
            <Menu.Divider />
            <Menu.Item onClick={() => togglePanel('cesiumIon')}>🌍 Cesium Ion</Menu.Item>
            <Menu.Item onClick={() => togglePanel('google3d')}>🏙 Google 3D</Menu.Item>
            <Menu.Item onClick={() => togglePanel('globalTerrain')}>⛰ Terrain</Menu.Item>
          </Menu.Dropdown>
        </Menu>

        <Menu shadow="md" width={160}>
          <Menu.Target>
            <Button size="xs" variant="subtle" leftSection={<IconSettings size={14} />}>
              More
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item onClick={() => togglePanel('settings')}>⚙ Settings</Menu.Item>
            <Menu.Item onClick={() => togglePanel('shareLink')}>🔗 Share Link</Menu.Item>
            <Menu.Item onClick={() => togglePanel('tour')}>🎓 Tour</Menu.Item>
          </Menu.Dropdown>
        </Menu>

        {plugins.length > 0 && (
          <Menu shadow="md" width={200}>
            <Menu.Target>
              <Button size="xs" variant="subtle" leftSection={<IconCategory size={14} />}>
                Plugins ({plugins.length})
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              {plugins.map((p) => (
                <Menu.Item key={p.id} onClick={() => togglePanel(p.id as any)}>
                  {p.icon || '🔌'} {p.name}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
        )}
      </Group>
    </Group>
  );
}
