/**
 * Real Estate Plugin — Parcel search, comparable sales, and parcel editing.
 */

import { useEffect, useRef, useState } from 'react';
import { IconBuildingEstate, IconX } from '@tabler/icons-react';
import { ParcelPanel } from '../../components/tools/ParcelPanel';
import { CompsPanel } from '../../components/tools/CompsPanel';
import { ParcelEditPanel } from '../../components/tools/ParcelEditPanel';
import { Tabs, ActionIcon } from '@mantine/core';
import type { PluginDefinition, PluginContext, PluginMapContext } from '../sdk';
import {
  discoverBranch,
  mergeParcels,
  splitParcel,
  PARCELS_DATASET,
  SALES_DATASET,
  type ParcelRecord,
} from '../../lib/realEstate';

const PARCEL_LAYER = 'real-estate-parcel';
const COMPS_LAYER = 'real-estate-comps';
const SELECTION_LAYER = 'real-estate-selection';
const SPLIT_LINE_LAYER = 'real-estate-split-line';

function RealEstatePanel({ ctx }: { ctx: PluginContext }) {
  const [parcelsBranch, setParcelsBranch] = useState<string | null>(null);
  const [salesBranch, setSalesBranch] = useState<string | null>(null);
  const [subject, setSubject] = useState<{ lat: number; lng: number } | null>(null);
  const [selected, setSelected] = useState<ParcelRecord[]>([]);

  // the plugin context is rebuilt on every app-store change, so map calls made
  // outside render go through a ref instead of an effect dependency
  const mapRef = useRef<PluginMapContext>(ctx.map);
  mapRef.current = ctx.map;
  const splitLineRef = useRef<GeoJSON.LineString | null>(null);
  const splitClicksRef = useRef<Array<[number, number]>>([]);
  const stopClicksRef = useRef<(() => void) | null>(null);

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

  useEffect(() => () => stopClicksRef.current?.(), []);

  const drawSelection = (parcels: ParcelRecord[]) => {
    const features = parcels
      .filter((p) => p.geometry)
      .map((p): GeoJSON.Feature => ({
        type: 'Feature',
        geometry: p.geometry as GeoJSON.Geometry,
        properties: { apn: p.apn, address: p.address },
      }));
    if (features.length === 0) {
      mapRef.current.removeLayer(SELECTION_LAYER);
      return;
    }
    mapRef.current.addGeoJsonLayer(
      SELECTION_LAYER,
      { type: 'FeatureCollection', features },
      { color: '#be4bdb', opacity: 0.35, lineWidth: 2 },
    );
  };

  const clearSplitLine = () => {
    stopClicksRef.current?.();
    stopClicksRef.current = null;
    splitClicksRef.current = [];
    splitLineRef.current = null;
    mapRef.current.removeLayer(SPLIT_LINE_LAYER);
  };

  const addToSelection = (parcel: ParcelRecord) => {
    if (selected.some((p) => p.id === parcel.id)) return;
    const next = [...selected, parcel];
    setSelected(next);
    drawSelection(next);
  };

  const clearSelection = () => {
    setSelected([]);
    drawSelection([]);
    clearSplitLine();
  };

  // two map clicks give the blade for ST_Split; without them splitParcel falls
  // back to a bbox bisector
  const handleStartSplit = () => {
    clearSplitLine();
    stopClicksRef.current = ctx.map.onMapClick(({ lat, lng }) => {
      splitClicksRef.current.push([lng, lat]);
      if (splitClicksRef.current.length < 2) return;
      const line: GeoJSON.LineString = {
        type: 'LineString',
        coordinates: splitClicksRef.current.slice(0, 2),
      };
      splitLineRef.current = line;
      mapRef.current.addGeoJsonLayer(SPLIT_LINE_LAYER, line, {
        color: '#fa5252',
        lineWidth: 3,
        filled: false,
      });
      stopClicksRef.current?.();
      stopClicksRef.current = null;
    });
  };

  const handleStartMerge = () => {
    clearSplitLine();
    drawSelection(selected);
  };

  const handleMerge = async () => {
    if (!parcelsBranch || selected.length < 2) return { success: false };
    const { newApn } = await mergeParcels(parcelsBranch, selected);
    clearSelection();
    return { success: true, newApn };
  };

  const handleSplit = async () => {
    if (!parcelsBranch || selected.length !== 1) return { success: false };
    const { newApns } = await splitParcel(
      parcelsBranch,
      selected[0],
      splitLineRef.current ?? undefined,
    );
    clearSelection();
    return { success: true, newApns };
  };

  const highlightParcel = (geometry: GeoJSON.Geometry | null) => {
    if (!geometry) {
      ctx.map.removeLayer(PARCEL_LAYER);
      return;
    }
    ctx.map.addGeoJsonLayer(
      PARCEL_LAYER,
      { type: 'Feature', geometry, properties: {} },
      { color: '#f76707', opacity: 0.25, lineWidth: 2 },
    );
  };

  const highlightComps = (comps: Array<{ lat: number; lng: number }>) => {
    // sales without coordinates in their properties can't be mapped
    const located = comps.filter((c) => c.lat !== 0 || c.lng !== 0);
    if (located.length === 0) {
      ctx.map.removeLayer(COMPS_LAYER);
      return;
    }
    ctx.map.addGeoJsonLayer(
      COMPS_LAYER,
      {
        type: 'FeatureCollection',
        features: located.map((c): GeoJSON.Feature => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [c.lng, c.lat] },
          properties: {},
        })),
      },
      { color: '#2f9e44', lineWidth: 2 },
    );
  };

  return (
    <Tabs defaultValue="parcels">
      <Tabs.List>
        <Tabs.Tab value="parcels" size="xs">Parcels</Tabs.Tab>
        <Tabs.Tab value="comps" size="xs">Comps</Tabs.Tab>
        <Tabs.Tab value="edit" size="xs">Edit</Tabs.Tab>
        <ActionIcon size="sm" variant="subtle" ml="auto" aria-label="Close" onClick={ctx.close}>
          <IconX size={14} />
        </ActionIcon>
      </Tabs.List>
      <Tabs.Panel value="parcels">
        <ParcelPanel
          branchId={parcelsBranch}
          onFlyTo={(lat, lng, zoom) => ctx.map.flyTo(lng, lat, zoom)}
          onHighlightParcel={highlightParcel}
          onSubjectFound={(lat, lng) => setSubject({ lat, lng })}
          onAddToSelection={addToSelection}
        />
      </Tabs.Panel>
      <Tabs.Panel value="comps">
        <CompsPanel
          branchId={salesBranch}
          subjectLat={subject?.lat ?? null}
          subjectLng={subject?.lng ?? null}
          onFlyTo={(lat, lng, zoom) => ctx.map.flyTo(lng, lat, zoom)}
          onHighlightComps={highlightComps}
        />
      </Tabs.Panel>
      <Tabs.Panel value="edit">
        <ParcelEditPanel
          selectedParcels={selected.map((p) => p.apn)}
          onStartSplit={handleStartSplit}
          onStartMerge={handleStartMerge}
          onConfirmSplit={handleSplit}
          onConfirmMerge={handleMerge}
          onCancel={clearSelection}
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
