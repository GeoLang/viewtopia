import { Tabs, Group, Select, Button, Menu, Box } from '@mantine/core';
import {
  IconGlobe,
  IconMap,
  IconPhoto,
  IconTable,
  IconRuler,
  IconPencil,
  IconMapPin,
  IconInfoCircle,
  IconSearch,
  IconWorld,
  IconTool,
} from '@tabler/icons-react';
import { useAppStore, type Renderer, type ViewerTab } from '../store/app';

const TAB_DATA: { value: ViewerTab; label: string; icon: React.ReactNode }[] = [
  { value: 'globe', label: '3D Globe', icon: <IconGlobe size={14} /> },
  { value: 'map', label: '2D Map', icon: <IconMap size={14} /> },
  { value: 'image', label: 'Image', icon: <IconPhoto size={14} /> },
  { value: 'table', label: 'Table', icon: <IconTable size={14} /> },
];

const RENDERER_OPTIONS: { value: Renderer; label: string }[] = [
  { value: 'cesium', label: 'CesiumJS' },
  { value: 'deckgl', label: 'deck.gl' },
  { value: 'maplibre', label: 'MapLibre' },
];

export function ViewerToolbar() {
  const { activeTab, setActiveTab, renderer, setRenderer } = useAppStore();

  return (
    <Group
      px="sm"
      py={4}
      justify="space-between"
      style={{ borderBottom: '1px solid #30363d', background: '#161b22' }}
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
        <Select
          size="xs"
          w={110}
          data={RENDERER_OPTIONS}
          value={renderer}
          onChange={(v) => v && setRenderer(v as Renderer)}
          styles={{
            input: { background: '#0d1117', borderColor: '#30363d' },
          }}
        />

        <Button size="xs" variant="subtle" leftSection={<IconRuler size={14} />}>
          Measure
        </Button>
        <Button size="xs" variant="subtle" leftSection={<IconPencil size={14} />}>
          Draw
        </Button>
        <Button size="xs" variant="subtle" leftSection={<IconMapPin size={14} />}>
          Annotate
        </Button>
        <Button size="xs" variant="subtle" leftSection={<IconInfoCircle size={14} />}>
          Info
        </Button>

        <Menu shadow="md" width={160}>
          <Menu.Target>
            <Button size="xs" variant="subtle" leftSection={<IconSearch size={14} />}>
              Analysis
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item>Clip</Menu.Item>
            <Menu.Item>Section</Menu.Item>
            <Menu.Item>Heatmap</Menu.Item>
            <Menu.Item>Timelapse</Menu.Item>
            <Menu.Item>Space-Time</Menu.Item>
          </Menu.Dropdown>
        </Menu>

        <Menu shadow="md" width={160}>
          <Menu.Target>
            <Button size="xs" variant="subtle" leftSection={<IconWorld size={14} />}>
              Simulate
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item>Weather</Menu.Item>
            <Menu.Item>Flood</Menu.Item>
            <Menu.Item>Wind</Menu.Item>
            <Menu.Item>Lighting</Menu.Item>
            <Menu.Item>Noise</Menu.Item>
            <Menu.Item>Energy</Menu.Item>
            <Menu.Item>Solar</Menu.Item>
            <Menu.Item>Traffic</Menu.Item>
          </Menu.Dropdown>
        </Menu>

        <Menu shadow="md" width={160}>
          <Menu.Target>
            <Button size="xs" variant="subtle" leftSection={<IconTool size={14} />}>
              Tools
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item>Photo</Menu.Item>
            <Menu.Item>Offline</Menu.Item>
            <Menu.Item>Indoor</Menu.Item>
            <Menu.Item>Drone</Menu.Item>
            <Menu.Item>WebXR</Menu.Item>
            <Menu.Item>Accessibility</Menu.Item>
            <Menu.Item>3D Print</Menu.Item>
            <Menu.Item>Flythrough</Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>
    </Group>
  );
}
