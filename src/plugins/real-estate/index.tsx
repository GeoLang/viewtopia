/**
 * Real Estate Plugin — Parcel search, comparable sales, and parcel editing.
 */

import { IconBuildingEstate } from '@tabler/icons-react';
import { ParcelPanel } from '../../components/tools/ParcelPanel';
import { CompsPanel } from '../../components/tools/CompsPanel';
import { ParcelEditPanel } from '../../components/tools/ParcelEditPanel';
import { Tabs } from '@mantine/core';
import type { PluginDefinition, PluginContext } from '../sdk';

function RealEstatePanel({ ctx }: { ctx: PluginContext }) {
  return (
    <Tabs defaultValue="parcels">
      <Tabs.List>
        <Tabs.Tab value="parcels" size="xs">Parcels</Tabs.Tab>
        <Tabs.Tab value="comps" size="xs">Comps</Tabs.Tab>
        <Tabs.Tab value="edit" size="xs">Edit</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="parcels">
        <ParcelPanel onClose={ctx.close} onFlyTo={(lat, lng, zoom) => ctx.map.flyTo(lng, lat, zoom)} onHighlightParcel={() => {}} />
      </Tabs.Panel>
      <Tabs.Panel value="comps">
        <CompsPanel onClose={ctx.close} subjectLat={null} subjectLng={null} onFlyTo={(lat, lng, zoom) => ctx.map.flyTo(lng, lat, zoom)} onHighlightComps={() => {}} />
      </Tabs.Panel>
      <Tabs.Panel value="edit">
        <ParcelEditPanel onClose={ctx.close} selectedParcels={[]} onStartSplit={() => {}} onStartMerge={() => {}} onConfirmSplit={async () => ({ success: false })} onConfirmMerge={async () => ({ success: false })} onCancel={() => {}} />
      </Tabs.Panel>
    </Tabs>
  );
}

const plugin: PluginDefinition = {
  id: 'real-estate',
  name: 'Real Estate',
  description: 'Parcel search, comparable sales analysis, and parcel split/merge tools',
  version: '1.0.0',
  author: 'TileTopia-HQ',
  icon: <IconBuildingEstate size={14} />,
  category: 'plugins',
  Panel: RealEstatePanel,
  settings: [
    { key: 'parcelBranchId', label: 'Parcels Branch ID', type: 'text', description: 'UUID of the branch containing parcel data' },
    { key: 'salesBranchId', label: 'Sales Branch ID', type: 'text', description: 'UUID of the branch containing sales data' },
    { key: 'defaultRadius', label: 'Default Comp Radius (m)', type: 'number', defaultValue: 1600, min: 100, max: 50000 },
    { key: 'maxDays', label: 'Max Comp Age (days)', type: 'number', defaultValue: 365, min: 30, max: 1825 },
  ],
};

export default plugin;
