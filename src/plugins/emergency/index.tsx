/**
 * Emergency Management Plugin — Incident dispatch and evacuation routing.
 */

import { useState } from 'react';
import { Stack, Text } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { IncidentPanel } from '../../components/tools/IncidentPanel';
import type { IncidentSelection } from '../../components/tools/IncidentPanel';
import { assemblyPointsOf, evacRadiusOf, evacuationPlan, walkingRoute } from './api';
import type { PluginDefinition, PluginContext } from '../sdk';

const DANGER_LAYER = 'incident-affected-area';
const ASSEMBLY_LAYER = 'incident-assembly-points';
const ROUTES_LAYER = 'incident-evac-routes';

const NO_COORDS = 'incident has no lat/lng in API';
const NO_ASSEMBLY = 'no assembly_points on this incident: the evacuate endpoint needs at least one';

function EmergencyPanel({ ctx }: { ctx: PluginContext }) {
  const [areaNote, setAreaNote] = useState<string | null>(null);
  const [routeNote, setRouteNote] = useState<string | null>(null);

  const showAffectedArea = async (incident: IncidentSelection) => {
    const { lat, lng } = incident;
    if (lat == null || lng == null) {
      ctx.map.removeLayer(DANGER_LAYER);
      ctx.map.removeLayer(ASSEMBLY_LAYER);
      setAreaNote(NO_COORDS);
      return;
    }
    const assemblyPoints = assemblyPointsOf(incident.properties);
    if (assemblyPoints.length === 0) {
      ctx.map.removeLayer(DANGER_LAYER);
      ctx.map.removeLayer(ASSEMBLY_LAYER);
      setAreaNote(NO_ASSEMBLY);
      return;
    }

    const radiusM = evacRadiusOf(incident.properties, ctx.settings.get('defaultEvacRadius', 1000));
    try {
      const plan = await evacuationPlan({ lat, lng, radiusM, assemblyPoints });
      setAreaNote(null);
      ctx.map.addGeoJsonLayer(DANGER_LAYER, plan.danger_zone_geojson, {
        color: '#fa5252',
        opacity: 0.35,
        lineWidth: 2,
        filled: true,
        stroked: true,
      });
      ctx.map.addGeoJsonLayer(
        ASSEMBLY_LAYER,
        {
          type: 'FeatureCollection',
          features: plan.assembly_points.map((p): GeoJSON.Feature => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
            properties: { id: p.id, capacity: p.capacity, distance_m: p.distance_m },
          })),
        },
        { color: '#2f9e44', lineWidth: 2 },
      );
      ctx.map.flyTo(lng, lat, 14);
    } catch (e) {
      setAreaNote(e instanceof Error ? e.message : 'evacuate request failed');
    }
  };

  const showEvacRoutes = async (incident: IncidentSelection) => {
    const { lat, lng } = incident;
    if (lat == null || lng == null) {
      ctx.map.removeLayer(ROUTES_LAYER);
      setRouteNote(NO_COORDS);
      return;
    }
    const assemblyPoints = assemblyPointsOf(incident.properties);
    if (assemblyPoints.length === 0) {
      ctx.map.removeLayer(ROUTES_LAYER);
      setRouteNote(NO_ASSEMBLY);
      return;
    }

    try {
      const routes = await Promise.all(
        assemblyPoints.map(async (p) => ({ point: p, path: await walkingRoute({ lat, lng }, p) })),
      );
      const features = routes
        .filter((r) => r.path.length > 1)
        .map((r): GeoJSON.Feature => ({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: r.path },
          properties: { to: r.point.id },
        }));
      if (features.length === 0) {
        ctx.map.removeLayer(ROUTES_LAYER);
        setRouteNote('router returned no path to any assembly point');
        return;
      }
      setRouteNote(null);
      ctx.map.addGeoJsonLayer(
        ROUTES_LAYER,
        { type: 'FeatureCollection', features },
        { color: '#f59f00', lineWidth: 3, filled: false, stroked: true },
      );
    } catch (e) {
      setRouteNote(e instanceof Error ? e.message : 'route request failed');
    }
  };

  return (
    <Stack gap={4}>
      <IncidentPanel onClose={ctx.close} onShowEvacRoutes={showEvacRoutes} onShowAffectedArea={showAffectedArea} />
      {areaNote && <Text size="xs" c="dimmed" ta="center">{areaNote}</Text>}
      {routeNote && <Text size="xs" c="dimmed" ta="center">{routeNote}</Text>}
    </Stack>
  );
}

const plugin: PluginDefinition = {
  id: 'emergency',
  name: 'Emergency',
  description: 'Incident management, dispatch, and evacuation route planning',
  version: '1.0.0',
  author: 'TileTopia-HQ',
  icon: <IconAlertTriangle size={14} />,
  category: 'plugins',
  Panel: EmergencyPanel,
  settings: [
    { key: 'incidentBranchId', label: 'Incidents Branch ID', type: 'text', description: 'Branch containing incident features' },
    { key: 'defaultEvacRadius', label: 'Default Evac Radius (m)', type: 'number', defaultValue: 1000, min: 100, max: 10000 },
    { key: 'sirenSound', label: 'Enable Alert Sound', type: 'boolean', defaultValue: false },
  ],
};

export default plugin;
