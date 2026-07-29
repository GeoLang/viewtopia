/**
 * Logistics Plugin — Fleet tracking and delivery optimization.
 */

import { IconTruck } from '@tabler/icons-react';
import { FleetPanel } from '../../components/tools/FleetPanel';
import { DeliveryPanel } from '../../components/tools/DeliveryPanel';
import { Tabs } from '@mantine/core';
import type { PluginDefinition, PluginContext } from '../sdk';

const STOPS_LAYER = 'logistics-route-stops';
const SEQUENCE_LAYER = 'logistics-route-sequence';

function LogisticsPanel({ ctx }: { ctx: PluginContext }) {
  // itinera's optimizer returns the visit order and a haversine distance, no road
  // geometry, so the line is the straight-line sequence between stops.
  const showRoute = (stops: Array<{ lat: number; lng: number }>) => {
    if (stops.length === 0) {
      ctx.map.removeLayer(STOPS_LAYER);
      ctx.map.removeLayer(SEQUENCE_LAYER);
      return;
    }
    const coords = stops.map((s): [number, number] => [s.lng, s.lat]);

    ctx.map.addGeoJsonLayer(
      STOPS_LAYER,
      {
        type: 'FeatureCollection',
        features: coords.map((c, i) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: c },
          properties: { sequence: i + 1 },
        })),
      },
      { color: '#f76707', lineWidth: 2 },
    );

    if (coords.length > 1) {
      ctx.map.addGeoJsonLayer(
        SEQUENCE_LAYER,
        {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: coords },
          properties: { geometry_source: 'straight lines between optimized stops' },
        },
        { color: '#f76707', lineWidth: 3, filled: false },
      );
    }

    const lngs = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    ctx.map.fitBounds([
      Math.min(...lngs),
      Math.min(...lats),
      Math.max(...lngs),
      Math.max(...lats),
    ]);
  };

  return (
    <Tabs defaultValue="fleet">
      <Tabs.List>
        <Tabs.Tab value="fleet" size="xs">Fleet</Tabs.Tab>
        <Tabs.Tab value="delivery" size="xs">Delivery</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="fleet"><FleetPanel onClose={ctx.close} onFlyTo={(lat, lng) => ctx.map.flyTo(lng, lat)} onTrackVehicle={() => {}} /></Tabs.Panel>
      <Tabs.Panel value="delivery"><DeliveryPanel onClose={ctx.close} onFlyTo={(lat, lng) => ctx.map.flyTo(lng, lat)} onShowRoute={showRoute} /></Tabs.Panel>
    </Tabs>
  );
}

const plugin: PluginDefinition = {
  id: 'logistics',
  name: 'Logistics',
  description: 'Real-time fleet tracking and multi-stop delivery route optimization',
  version: '1.0.0',
  author: 'TileTopia-HQ',
  icon: <IconTruck size={14} />,
  category: 'plugins',
  Panel: LogisticsPanel,
  settings: [
    { key: 'maxStops', label: 'Max Delivery Stops', type: 'number', defaultValue: 50, min: 2, max: 500 },
  ],
};

export default plugin;
