import { useState } from 'react';
import { ScrollArea, Tabs } from '@mantine/core';
import { IconDatabase, IconFolders, IconUpload, IconWorldWww } from '@tabler/icons-react';
import { PanelCard, PanelHeader } from '../../components/PanelCard';
import { useAgentLayerStore } from '../../store/agentLayers';
import { useOgcLayerStore } from '../../store/ogcLayers';
import type { ToolPanel } from '../../store/app';
import { OgcServicesTab } from './OgcServicesTab';
import { SqlWorkspaceTab } from './SqlWorkspaceTab';
import { FileImportTab } from './FileImportTab';

export type DataSourceTab = 'services' | 'database' | 'files';

/** the panels this one replaced, so an old id still opens the tab it named */
const TAB_FOR_PANEL: Partial<Record<NonNullable<ToolPanel>, DataSourceTab>> = {
  ogc: 'services',
  sqlWorkspace: 'database',
  import: 'files',
};

export function dataSourceTab(panel: ToolPanel): DataSourceTab {
  return (panel && TAB_FOR_PANEL[panel]) ?? 'services';
}

export function DataSourcesPanel({ tab, onClose }: { tab: DataSourceTab; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<DataSourceTab>(tab);
  const ogcLayers = useOgcLayerStore((s) => s.layers);
  const addOgcLayer = useOgcLayerStore((s) => s.addLayer);
  const removeOgcLayer = useOgcLayerStore((s) => s.removeLayer);
  const addAgentLayer = useAgentLayerStore((s) => s.addLayer);

  return (
    <PanelCard width={460} maxHeight="80vh" testId="data-sources-panel">
      <PanelHeader icon={<IconFolders size={16} />} title="Data Sources" onClose={onClose} />

      <Tabs
        value={activeTab}
        onChange={(value) => value && setActiveTab(value as DataSourceTab)}
        style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
      >
        <Tabs.List mb="xs">
          <Tabs.Tab value="services" leftSection={<IconWorldWww size={14} />}>
            Services
          </Tabs.Tab>
          <Tabs.Tab value="database" leftSection={<IconDatabase size={14} />}>
            Database
          </Tabs.Tab>
          <Tabs.Tab value="files" leftSection={<IconUpload size={14} />}>
            Files
          </Tabs.Tab>
        </Tabs.List>

        <ScrollArea style={{ flex: 1, minHeight: 0 }}>
          <Tabs.Panel value="services">
            <OgcServicesTab
              layers={ogcLayers}
              onAdd={addOgcLayer}
              onRemove={removeOgcLayer}
            />
          </Tabs.Panel>
          <Tabs.Panel value="database">
            <SqlWorkspaceTab />
          </Tabs.Panel>
          <Tabs.Panel value="files">
            <FileImportTab
              // imported files join the agent layers, so every renderer draws them
              onImport={(name, geojson) =>
                addAgentLayer({ id: crypto.randomUUID(), name, color: '#38bdf8', geojson })
              }
            />
          </Tabs.Panel>
        </ScrollArea>
      </Tabs>
    </PanelCard>
  );
}
