import { Badge, Tabs, Group, Button, Menu, ActionIcon, Tooltip } from '@mantine/core';
import {
  IconGlobe,
  IconMap,
  IconRuler,
  IconInfoCircle,
  IconWorld,
  IconTool,
  IconDownload,
  IconListDetails,
  IconStack2,
  IconSettings,
  IconPackage,
  IconCategory,
  IconClick,
  IconWand,
  IconDots,
  IconClockHour4,
  IconPlug,
} from '@tabler/icons-react';
import { useMediaQuery } from '@mantine/hooks';
import { useAppStore, type ToolPanel, type ViewerTab } from '../store/app';
import { toggleInspectPanel } from '../store/featurePicker';
import { TOOLBAR_ICONS_ONLY_QUERY } from '../theme';
import { useViewOnlyLive } from '../live/liveStore';
import { useSpaceTimeStore } from '../features/spacetime/store';
import { getPlugins } from '../plugins/registry';
import {
  ACTIONS_MENU,
  ANALYSIS_MENU,
  SIMULATE_MENU,
  TOOLS_MENU,
  DATA_MENU,
  MORE_MENU,
  visibleToolItems,
  type ToolMenuItem,
} from './toolMenus';
import { exportMapPng } from './mapExport';
import { FlyToSearch } from './FlyToSearch';

const TAB_DATA: {
  value: ViewerTab;
  label: string;
  ariaLabel: string;
  icon: React.ReactNode;
}[] = [
  { value: 'globe', label: '3D', ariaLabel: '3D Globe', icon: <IconGlobe size={14} /> },
  { value: 'map', label: '2D', ariaLabel: '2D Map', icon: <IconMap size={14} /> },
];

/** `compact` is the phone layout: the labeled menus fold into one "All tools" menu. */
export function ViewerToolbar({ compact = false }: { compact?: boolean }) {
  const { activeTab, setActiveTab, togglePanel } = useAppStore();
  const toggleSpaceTime = useSpaceTimeStore((s) => s.togglePanel);
  const showPreviewTools = useAppStore((s) => s.settings.showPreviewTools);
  const viewOnly = useViewOnlyLive();
  const plugins = getPlugins();
  const iconsOnly = useMediaQuery(TOOLBAR_ICONS_ONLY_QUERY, false, {
    getInitialValueInEffect: false,
  });

  const renderMenuItems = (items: ToolMenuItem[]) =>
    visibleToolItems(items, showPreviewTools).map((item) => (
      <Menu.Item
        key={item.panel}
        leftSection={<item.icon size={14} />}
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

  const rendererTabs = (
    <Tabs
      value={activeTab}
      onChange={(v) => v && setActiveTab(v as ViewerTab)}
      variant="pills"
      radius="sm"
      style={{ flexShrink: 0 }}
    >
      <Tabs.List style={{ flexWrap: 'nowrap' }}>
        {TAB_DATA.map((tab) => (
          <Tabs.Tab
            key={tab.value}
            value={tab.value}
            leftSection={tab.icon}
            size="xs"
            aria-label={tab.ariaLabel}
          >
            {tab.label}
          </Tabs.Tab>
        ))}
      </Tabs.List>
    </Tabs>
  );

  const measureIcon = (
    <Tooltip label="Measure (M)"><ActionIcon aria-label="Measure" size="sm" variant="subtle" color="gray" onClick={() => togglePanel('measure')}><IconRuler size={14} /></ActionIcon></Tooltip>
  );
  const layersIcon = (
    <Tooltip label="Layers"><ActionIcon aria-label="Layers" size="sm" variant="subtle" color="gray" onClick={() => togglePanel('layers')}><IconStack2 size={14} /></ActionIcon></Tooltip>
  );
  const legendIcon = (
    <Tooltip label="Legend"><ActionIcon aria-label="Legend" size="sm" variant="subtle" color="gray" onClick={() => togglePanel('legend')}><IconListDetails size={14} /></ActionIcon></Tooltip>
  );
  const inspectIcon = (
    <Tooltip label="Inspect"><ActionIcon aria-label="Inspect" size="sm" variant="subtle" color="gray" onClick={toggleInspectPanel}><IconClick size={14} /></ActionIcon></Tooltip>
  );
  const viewOnlyBadge = (
    <Badge size="sm" variant="light" color="gray">
      View only
    </Badge>
  );

  const labeledMenus: {
    label: string;
    icon: React.ReactNode;
    width: number;
    items: React.ReactNode;
  }[] = [
    {
      label: 'Actions',
      icon: <IconWand size={14} />,
      width: 180,
      items: (
        <>
          {renderMenuItems(ACTIONS_MENU[0])}
          <Menu.Item leftSection={<IconDownload size={14} />} onClick={exportMapPng}>
            Export PNG
          </Menu.Item>
        </>
      ),
    },
    {
      label: 'Analysis',
      icon: <IconInfoCircle size={14} />,
      width: 180,
      items: (
        <>
          {renderMenuItems(ANALYSIS_MENU[0])}
          <Menu.Item leftSection={<IconClockHour4 size={14} />} onClick={toggleSpaceTime}>
            Space-Time
          </Menu.Item>
          <Menu.Divider />
          {renderMenuItems(ANALYSIS_MENU[1])}
        </>
      ),
    },
    {
      label: 'Simulate',
      icon: <IconWorld size={14} />,
      width: 160,
      items: renderMenuItems(SIMULATE_MENU[0]),
    },
    {
      label: 'Tools',
      icon: <IconTool size={14} />,
      width: 180,
      items: (
        <>
          {renderMenuItems(TOOLS_MENU[0])}
          <Menu.Divider />
          {renderMenuItems(TOOLS_MENU[1])}
        </>
      ),
    },
    {
      label: 'Data',
      icon: <IconPackage size={14} />,
      width: 180,
      items: (
        <>
          {renderMenuItems(DATA_MENU[0])}
          <Menu.Divider />
          {renderMenuItems(DATA_MENU[1])}
          <Menu.Divider />
          {renderMenuItems(DATA_MENU[2])}
        </>
      ),
    },
  ];

  if (compact) {
    return (
      <Group gap={6} style={{ flex: 1, minWidth: 0, overflowX: 'auto' }} wrap="nowrap">
        {rendererTabs}
        <FlyToSearch />
        {viewOnly ? (
          <>
            {measureIcon}
            {layersIcon}
            {legendIcon}
            {inspectIcon}
            {viewOnlyBadge}
          </>
        ) : (
          <>
            {layersIcon}
            {inspectIcon}
            <Menu shadow="md" width={210}>
              <Menu.Target>
                <Tooltip label="All tools">
                  <ActionIcon aria-label="All tools" size="sm" variant="subtle" color="gray">
                    <IconTool size={14} />
                  </ActionIcon>
                </Tooltip>
              </Menu.Target>
              <Menu.Dropdown mah="70vh" style={{ overflowY: 'auto' }}>
                <Menu.Item leftSection={<IconRuler size={14} />} onClick={() => togglePanel('measure')}>
                  Measure
                </Menu.Item>
                <Menu.Item leftSection={<IconListDetails size={14} />} onClick={() => togglePanel('legend')}>
                  Legend
                </Menu.Item>
                <Menu.Label>Actions</Menu.Label>
                {renderMenuItems(ACTIONS_MENU[0])}
                <Menu.Item leftSection={<IconDownload size={14} />} onClick={exportMapPng}>
                  Export PNG
                </Menu.Item>
                <Menu.Label>Analysis</Menu.Label>
                {renderMenuItems(ANALYSIS_MENU[0])}
                <Menu.Item leftSection={<IconClockHour4 size={14} />} onClick={toggleSpaceTime}>
                  Space-Time
                </Menu.Item>
                {renderMenuItems(ANALYSIS_MENU[1])}
                <Menu.Label>Simulate</Menu.Label>
                {renderMenuItems(SIMULATE_MENU[0])}
                <Menu.Label>Tools</Menu.Label>
                {renderMenuItems(TOOLS_MENU[0])}
                {renderMenuItems(TOOLS_MENU[1])}
                <Menu.Label>Data</Menu.Label>
                {renderMenuItems(DATA_MENU[0])}
                {renderMenuItems(DATA_MENU[1])}
                {renderMenuItems(DATA_MENU[2])}
                <Menu.Label>More</Menu.Label>
                {renderMenuItems(MORE_MENU[0])}
                {plugins.length > 0 && <Menu.Label>Plugins</Menu.Label>}
                {plugins.map((p) => (
                  <Menu.Item
                    key={p.id}
                    leftSection={p.icon ?? <IconPlug size={14} />}
                    onClick={() => togglePanel(p.id as ToolPanel)}
                  >
                    {p.name}
                  </Menu.Item>
                ))}
                <Menu.Divider />
                <Menu.Item leftSection={<IconSettings size={14} />} onClick={() => togglePanel('settings')}>
                  Settings
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </>
        )}
      </Group>
    );
  }

  return (
    <Group
      gap={6}
      style={{ flex: 1, minWidth: 0, overflowX: 'auto' }}
      wrap="nowrap"
    >
      {rendererTabs}

      <Group gap={6} wrap="nowrap">
        <FlyToSearch />

        {measureIcon}
        {layersIcon}
        {legendIcon}
        {inspectIcon}

        {viewOnly && viewOnlyBadge}

        {!viewOnly && (
        <>
        {labeledMenus.map((menu) => (
          <Menu key={menu.label} shadow="md" width={menu.width}>
            <Menu.Target>
              {/* the label stays the accessible name, so the menu is found by it either way */}
              {iconsOnly ? (
                <Tooltip label={menu.label}>
                  <ActionIcon
                    aria-label={menu.label}
                    size="sm"
                    variant="subtle"
                    color="gray"
                  >
                    {menu.icon}
                  </ActionIcon>
                </Tooltip>
              ) : (
                <Button size="xs" variant="subtle" leftSection={menu.icon}>
                  {menu.label}
                </Button>
              )}
            </Menu.Target>
            <Menu.Dropdown>{menu.items}</Menu.Dropdown>
          </Menu>
        ))}

        <Menu shadow="md" width={160}>
          <Menu.Target>
            <Tooltip label="More">
              <ActionIcon aria-label="More" size="sm" variant="subtle" color="gray">
                <IconDots size={14} />
              </ActionIcon>
            </Tooltip>
          </Menu.Target>
          <Menu.Dropdown>{renderMenuItems(MORE_MENU[0])}</Menu.Dropdown>
        </Menu>

        {plugins.length > 0 && (
          <Menu shadow="md" width={200}>
            <Menu.Target>
              <Tooltip label={`Plugins (${plugins.length})`}>
                <ActionIcon aria-label={`Plugins (${plugins.length})`} size="sm" variant="subtle" color="gray">
                  <IconCategory size={14} />
                </ActionIcon>
              </Tooltip>
            </Menu.Target>
            <Menu.Dropdown>
              {plugins.map((p) => (
                <Menu.Item
                  key={p.id}
                  leftSection={p.icon ?? <IconPlug size={14} />}
                  onClick={() => togglePanel(p.id as ToolPanel)}
                >
                  {p.name}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
        )}

        <Tooltip label="Settings">
          <ActionIcon
            aria-label="Settings"
            size="sm"
            variant="subtle"
            color="gray"
            onClick={() => togglePanel('settings')}
          >
            <IconSettings size={14} />
          </ActionIcon>
        </Tooltip>
        </>
        )}
      </Group>
    </Group>
  );
}
