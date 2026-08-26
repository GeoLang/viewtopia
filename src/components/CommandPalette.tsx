import { useMemo } from 'react';
import { Badge } from '@mantine/core';
import { Spotlight, type SpotlightActionGroupData } from '@mantine/spotlight';
import {
  IconClick,
  IconClockHour4,
  IconDownload,
  IconGlobe,
  IconListDetails,
  IconMap,
  IconMessageChatbot,
  IconPlug,
  IconPresentation,
  IconRuler,
  IconSearch,
  IconSettings,
  IconStack2,
} from '@tabler/icons-react';
import { useAppStore, type ToolPanel } from '../store/app';
import { useSplitViewStore } from '../store/splitView';
import { toggleInspectPanel } from '../store/featurePicker';
import { useViewOnlyLive } from '../live/liveStore';
import { useSpaceTimeStore } from '../features/spacetime/store';
import { getPlugins, usePluginRegistryVersion } from '../plugins/registry';
import { TOOL_MENU_GROUPS, visibleToolItems, type ToolMenuItem } from './toolMenus';
import { exportMapPng } from './mapExport';

const previewBadge = (
  <Badge size="xs" variant="light" color="orange">
    Preview
  </Badge>
);

/** Cmd/Ctrl+K palette over the same registries the toolbar menus render. */
export function CommandPalette() {
  const togglePanel = useAppStore((s) => s.togglePanel);
  const setActivePaneTab = useSplitViewStore((s) => s.setActivePaneTab);
  const toggleUiHidden = useAppStore((s) => s.toggleUiHidden);
  const setChatMode = useAppStore((s) => s.setChatMode);
  const showPreviewTools = useAppStore((s) => s.settings.showPreviewTools);
  const toggleSpaceTime = useSpaceTimeStore((s) => s.togglePanel);
  const viewOnly = useViewOnlyLive();
  const pluginRegistryVersion = usePluginRegistryVersion();

  const actionGroups = useMemo<SpotlightActionGroupData[]>(() => {
    const toolAction = (item: ToolMenuItem) => ({
      id: item.panel,
      label: item.label,
      keywords: item.keywords,
      leftSection: <item.icon size={18} />,
      rightSection: item.preview ? previewBadge : undefined,
      onClick: () => togglePanel(item.panel),
    });

    const groups: SpotlightActionGroupData[] = [
      {
        group: 'View',
        actions: [
          {
            id: 'view-globe',
            label: '3D Globe',
            leftSection: <IconGlobe size={18} />,
            onClick: () => setActivePaneTab('globe'),
          },
          {
            id: 'view-map',
            label: '2D Map',
            leftSection: <IconMap size={18} />,
            onClick: () => setActivePaneTab('map'),
          },
          {
            id: 'view-spacetime',
            label: 'Space-Time',
            description: 'T',
            leftSection: <IconClockHour4 size={18} />,
            onClick: toggleSpaceTime,
          },
          {
            id: 'view-presentation',
            label: 'Presentation Mode',
            description: 'Ctrl+.',
            leftSection: <IconPresentation size={18} />,
            onClick: toggleUiHidden,
          },
          {
            id: 'view-chat-only',
            label: 'Chat-only Mode',
            leftSection: <IconMessageChatbot size={18} />,
            onClick: () => setChatMode(true),
          },
        ],
      },
      {
        group: 'Map',
        actions: [
          {
            id: 'measure',
            label: 'Measure',
            leftSection: <IconRuler size={18} />,
            onClick: () => togglePanel('measure'),
          },
          {
            id: 'layers',
            label: 'Layers',
            leftSection: <IconStack2 size={18} />,
            onClick: () => togglePanel('layers'),
          },
          {
            id: 'legend',
            label: 'Legend',
            leftSection: <IconListDetails size={18} />,
            onClick: () => togglePanel('legend'),
          },
          {
            id: 'featurePicker',
            label: 'Inspect',
            leftSection: <IconClick size={18} />,
            onClick: toggleInspectPanel,
          },
          {
            id: 'settings',
            label: 'Settings',
            leftSection: <IconSettings size={18} />,
            onClick: () => togglePanel('settings'),
          },
        ],
      },
      ...TOOL_MENU_GROUPS.map((menu) => ({
        group: menu.group,
        actions: menu.sections.flatMap((section) =>
          visibleToolItems(section, showPreviewTools).map(toolAction),
        ),
      })),
    ];

    groups
      .find((g) => g.group === 'Actions')
      ?.actions.push({
        id: 'export-png',
        label: 'Export PNG',
        leftSection: <IconDownload size={18} />,
        onClick: exportMapPng,
      });

    const plugins = getPlugins();
    if (plugins.length > 0) {
      groups.push({
        group: 'Plugins',
        actions: plugins.map((plugin) => ({
          id: `plugin-${plugin.id}`,
          label: plugin.name,
          description: plugin.description,
          leftSection: plugin.icon ?? <IconPlug size={18} />,
          onClick: () => togglePanel(plugin.id as ToolPanel),
        })),
      });
    }

    // view-only chrome keeps navigation and the view-safe map tools
    if (viewOnly) {
      return groups
        .filter((g) => g.group === 'View' || g.group === 'Map')
        .map((g) => ({
          ...g,
          actions: g.actions.filter((a) => a.id !== 'settings'),
        }));
    }

    return groups;
  }, [
    togglePanel,
    setActivePaneTab,
    toggleUiHidden,
    setChatMode,
    toggleSpaceTime,
    showPreviewTools,
    viewOnly,
    // getPlugins() is read inside, so a runtime install has to rebuild the list
    pluginRegistryVersion,
  ]);

  return (
    <Spotlight
      actions={actionGroups}
      shortcut="mod + K"
      nothingFound="Nothing found"
      highlightQuery
      scrollable
      maxHeight={420}
      searchProps={{
        leftSection: <IconSearch size={18} />,
        placeholder: 'Search tools, panels, plugins…',
      }}
    />
  );
}
