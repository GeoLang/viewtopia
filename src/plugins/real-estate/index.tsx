/**
 * Real Estate Plugin — Parcel search, comparable sales, and parcel editing.
 */

import { useEffect, useState } from 'react';
import { IconBuildingEstate } from '@tabler/icons-react';
import { ParcelPanel } from '../../components/tools/ParcelPanel';
import { CompsPanel } from '../../components/tools/CompsPanel';
import { ParcelEditPanel } from '../../components/tools/ParcelEditPanel';
import { Tabs } from '@mantine/core';
import type { PluginDefinition, PluginContext } from '../sdk';
import {
  discoverBranch,
  mergeParcels,
  splitParcel,
  PARCELS_DATASET,
  SALES_DATASET,
  type ParcelRecord,
} from '../../lib/realEstate';

function RealEstatePanel({ ctx }: { ctx: PluginContext }) {
  const [parcelsBranch, setParcelsBranch] = useState<string | null>(null);
  const [salesBranch, setSalesBranch] = useState<string | null>(null);
  const [subject, setSubject] = useState<{ lat: number; lng: number } | null>(null);
  const [selected, setSelected] = useState<ParcelRecord[]>([]);

  useEffect(() => {
    let active = true;
    // settings override wins, otherwise discover the seeded demo datasets by name
    const overrideParcels = ctx.settings.get<string>('parcelBranchId', '');
    const overrideSales = ctx.settings.get<string>('salesBranchId', '');
    (async () => {
      const p = overrideParcels || (await discoverBranch(PARCELS_DATASET));
      const s = overrideSales || (await discoverBranch(SALES_DATASET));
      if (!active) return;
      setParcelsBranch(p);
      setSalesBranch(s);
    })().catch(() => {
      /* leave branches null; panels show a load hint */
    });
    return () => {
      active = false;
    };
  }, [ctx.settings]);

  const addToSelection = (parcel: ParcelRecord) => {
    setSelected((prev) =>
      prev.some((p) => p.id === parcel.id) ? prev : [...prev, parcel],
    );
  };

  const handleMerge = async () => {
    if (!parcelsBranch || selected.length < 2) return { success: false };
    const { newApn } = await mergeParcels(parcelsBranch, selected);
    setSelected([]);
    return { success: true, newApn };
  };

  const handleSplit = async () => {
    if (!parcelsBranch || selected.length !== 1) return { success: false };
    const { newApns } = await splitParcel(parcelsBranch, selected[0]);
    setSelected([]);
    return { success: true, newApns };
  };

  return (
    <Tabs defaultValue="parcels">
      <Tabs.List>
        <Tabs.Tab value="parcels" size="xs">Parcels</Tabs.Tab>
        <Tabs.Tab value="comps" size="xs">Comps</Tabs.Tab>
        <Tabs.Tab value="edit" size="xs">Edit</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="parcels">
        <ParcelPanel
          branchId={parcelsBranch}
          onClose={ctx.close}
          onFlyTo={(lat, lng, zoom) => ctx.map.flyTo(lng, lat, zoom)}
          onHighlightParcel={() => {}}
          onSubjectFound={(lat, lng) => setSubject({ lat, lng })}
          onAddToSelection={addToSelection}
        />
      </Tabs.Panel>
      <Tabs.Panel value="comps">
        <CompsPanel
          branchId={salesBranch}
          onClose={ctx.close}
          subjectLat={subject?.lat ?? null}
          subjectLng={subject?.lng ?? null}
          onFlyTo={(lat, lng, zoom) => ctx.map.flyTo(lng, lat, zoom)}
          onHighlightComps={() => {}}
        />
      </Tabs.Panel>
      <Tabs.Panel value="edit">
        <ParcelEditPanel
          onClose={ctx.close}
          selectedParcels={selected.map((p) => p.apn)}
          onStartSplit={() => {}}
          onStartMerge={() => {}}
          onConfirmSplit={handleSplit}
          onConfirmMerge={handleMerge}
          onCancel={() => setSelected([])}
        />
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
    { key: 'parcelBranchId', label: 'Parcels Branch ID', type: 'text', description: 'UUID of the branch containing parcel data (blank = auto-discover demo_parcels)' },
    { key: 'salesBranchId', label: 'Sales Branch ID', type: 'text', description: 'UUID of the branch containing sales data (blank = auto-discover demo_sales)' },
    { key: 'defaultRadius', label: 'Default Comp Radius (m)', type: 'number', defaultValue: 1600, min: 100, max: 50000 },
    { key: 'maxDays', label: 'Max Comp Age (days)', type: 'number', defaultValue: 365, min: 30, max: 1825 },
  ],
};

export default plugin;
