import { useCallback } from 'react';
import { Badge, Tabs, Group, Select, Button, Menu, ActionIcon, Tooltip } from '@mantine/core';
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
  IconStack2,
  IconBuildingSkyscraper,
  IconSettings,
  IconPackage,
  IconCategory,
  IconClick,
  IconVectorTriangle,
  IconPalette,
  IconWand,
  IconDots,
} from '@tabler/icons-react';
import { useAppStore, type Renderer, type Basemap, type ViewerTab } from '../store/app';
import { useFeaturePickerStore } from '../store/featurePicker';
import { useSpaceTimeStore } from '../features/spacetime/store';
import { getPlugins } from '../plugins/registry';
import {
  ANALYSIS_MENU,
  SIMULATE_MENU,
  TOOLS_MENU,
  DATA_MENU,
  MORE_MENU,
  visibleToolItems,
  type ToolMenuItem,
} from './toolMenus';
import { FlyToSearch } from './FlyToSearch';
import { BASEMAP_SELECT_GROUPS } from '../hooks/basemapTiles';

const TAB_DATA: { value: ViewerTab; label: string; icon: React.ReactNode }[] = [
  { value: 'globe', label: '3D Globe', icon: <IconGlobe size={14} /> },
  { value: 'map', label: '2D Map', icon: <IconMap size={14} /> },
];

const RENDERER_OPTIONS: { value: Renderer; label: string }[] = [
  { value: 'cesium', label: 'CesiumJS' },
  { value: 'maplibre', label: 'MapLibre' },
];

export function ViewerToolbar() {
  const { activeTab, setActiveTab, renderer, setRenderer, basemap, setBasemap, togglePanel } = useAppStore();
  const activePanel = useAppStore((s) => s.activePanel);
  const setPickerEnabled = useFeaturePickerStore((s) => s.setEnabled);
  const toggleSpaceTime = useSpaceTimeStore((s) => s.togglePanel);
  const showPreviewTools = useAppStore((s) => s.settings.showPreviewTools);
  const plugins = getPlugins();

  // the 2d map is leaflet: the renderer choice doesn't apply, and vector
  // styles can't render there (leaflet shows their raster approximation)
  const onMapTab = activeTab === 'map';
  const basemapGroups = onMapTab
    ? BASEMAP_SELECT_GROUPS.map((g) =>
        g.group.startsWith('Vector')
          ? { ...g, items: g.items.map((i) => ({ ...i, disabled: true })) }
          : g,
      )
    : BASEMAP_SELECT_GROUPS;

  const renderMenuItems = (items: ToolMenuItem[]) =>
    visibleToolItems(items, showPreviewTools).map((item) => (
      <Menu.Item
        key={item.panel}
        onClick={() => togglePanel(item.panel)}
        rightSection={
          item.preview ? (
            <Badge size="xs" variant="light" color="orange">
              Preview
            </Badge>
          ) : undefined
        }
      >
        {item.label}
      </Menu.Item>
    ));

  // Inspect is the picking mode itself, not just a panel — opening it arms the
  // picker (the panel's switch mirrors this), closing it disarms.
  const toggleInspect = useCallback(() => {
    const opening = activePanel !== 'featurePicker';
    togglePanel('featurePicker');
    setPickerEnabled(opening);
  }, [activePanel, togglePanel, setPickerEnabled]);

  const handleExportPng = useCallback(() => {
    // Find the active canvas element and export it
    const canvas = document.querySelector(
      '#cesium-container canvas, #maplibre-container canvas, #leaflet-container canvas',
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
          disabled={onMapTab}
          onChange={(v) => v && setRenderer(v as Renderer)}
          styles={{
            input: { background: '#0d1117', borderColor: '#30363d' },
          }}
        />

        <Select
          size="xs"
          w={110}
          aria-label="Basemap"
          comboboxProps={{ width: 190, position: 'bottom-start' }}
          data={basemapGroups}
          value={basemap}
          onChange={(v) => v && setBasemap(v as Basemap)}
          styles={{
            input: { background: '#0d1117', borderColor: '#30363d' },
          }}
        />

        <Tooltip label="Measure"><ActionIcon aria-label="Measure" size="sm" variant="subtle" color="gray" onClick={() => togglePanel('measure')}><IconRuler size={14} /></ActionIcon></Tooltip>
        <Tooltip label="Layers"><ActionIcon aria-label="Layers" size="sm" variant="subtle" color="gray" onClick={() => togglePanel('layers')}><IconStack2 size={14} /></ActionIcon></Tooltip>
        <Tooltip label="Inspect"><ActionIcon aria-label="Inspect" size="sm" variant="subtle" color="gray" onClick={toggleInspect}><IconClick size={14} /></ActionIcon></Tooltip>

        <Menu shadow="md" width={180}>
          <Menu.Target>
            <Button size="xs" variant="subtle" leftSection={<IconWand size={14} />}>
              Actions
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item leftSection={<IconPencil size={14} />} onClick={() => togglePanel('draw')}>
              Draw
            </Menu.Item>
            <Menu.Item leftSection={<IconMapPin size={14} />} onClick={() => togglePanel('annotate')}>
              Annotate
            </Menu.Item>
            <Menu.Item leftSection={<IconRoute size={14} />} onClick={() => togglePanel('routing')}>
              Route
            </Menu.Item>
            <Menu.Item leftSection={<IconBookmark size={14} />} onClick={() => togglePanel('bookmark')}>
              Bookmarks
            </Menu.Item>
            <Menu.Item leftSection={<IconSearch size={14} />} onClick={() => togglePanel('geocoding')}>
              Search
            </Menu.Item>
            <Menu.Item
              leftSection={<IconBuildingSkyscraper size={14} />}
              onClick={() => togglePanel('buildings')}
            >
              Buildings
            </Menu.Item>
            <Menu.Item
              leftSection={<IconVectorTriangle size={14} />}
              onClick={() => togglePanel('geojsonEditor')}
            >
              GeoJSON Editor
            </Menu.Item>
            <Menu.Item leftSection={<IconPalette size={14} />} onClick={() => togglePanel('styleEditor')}>
              Style Editor
            </Menu.Item>
            <Menu.Item leftSection={<IconDownload size={14} />} onClick={handleExportPng}>
              Export PNG
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>

        <Menu shadow="md" width={180}>
          <Menu.Target>
            <Button size="xs" variant="subtle" leftSection={<IconInfoCircle size={14} />}>
              Analysis
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            {renderMenuItems(ANALYSIS_MENU[0])}
            <Menu.Item onClick={toggleSpaceTime}>🕐 Space-Time</Menu.Item>
            <Menu.Divider />
            {renderMenuItems(ANALYSIS_MENU[1])}
          </Menu.Dropdown>
        </Menu>

        <Menu shadow="md" width={160}>
          <Menu.Target>
            <Button size="xs" variant="subtle" leftSection={<IconWorld size={14} />}>
              Simulate
            </Button>
          </Menu.Target>
          <Menu.Dropdown>{renderMenuItems(SIMULATE_MENU[0])}</Menu.Dropdown>
        </Menu>

        <Menu shadow="md" width={180}>
          <Menu.Target>
            <Button size="xs" variant="subtle" leftSection={<IconTool size={14} />}>
              Tools
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            {renderMenuItems(TOOLS_MENU[0])}
            <Menu.Divider />
            {renderMenuItems(TOOLS_MENU[1])}
          </Menu.Dropdown>
        </Menu>

        <Menu shadow="md" width={180}>
          <Menu.Target>
            <Button size="xs" variant="subtle" leftSection={<IconPackage size={14} />}>
              Data
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            {renderMenuItems(DATA_MENU[0])}
            <Menu.Divider />
            {renderMenuItems(DATA_MENU[1])}
            <Menu.Divider />
            {renderMenuItems(DATA_MENU[2])}
          </Menu.Dropdown>
        </Menu>

        <Menu shadow="md" width={160}>
          <Menu.Target>
            <Button size="xs" variant="subtle" leftSection={<IconDots size={14} />}>
              More
            </Button>
          </Menu.Target>
          <Menu.Dropdown>{renderMenuItems(MORE_MENU[0])}</Menu.Dropdown>
        </Menu>

        <Button
          size="xs"
          variant="subtle"
          leftSection={<IconSettings size={14} />}
          onClick={() => togglePanel('settings')}
        >
          Settings
        </Button>

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
