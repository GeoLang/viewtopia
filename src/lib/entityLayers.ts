/**
 * Read attribute data out of the active Cesium viewer's loaded data sources
 * (agent layers, imported GeoJSON, analysis results). Shared by the Data
 * Table and Charts panels.
 */
import { useEffect, useState } from 'react';
import { JulianDate } from 'cesium';
import type { DataSource, Entity } from 'cesium';
import { getActiveCesiumViewer } from '../viewer/registry';

export interface EntityLayerRef {
  index: number;
  name: string;
  count: number;
}

export function listEntityLayers(): EntityLayerRef[] {
  const viewer = getActiveCesiumViewer();
  if (!viewer) return [];
  const refs: EntityLayerRef[] = [];
  for (let i = 0; i < viewer.dataSources.length; i++) {
    const ds = viewer.dataSources.get(i);
    refs.push({
      index: i,
      name: ds.name || `Layer ${i + 1}`,
      count: ds.entities.values.length,
    });
  }
  return refs;
}

export function getEntityLayer(index: number): DataSource | null {
  const viewer = getActiveCesiumViewer();
  if (!viewer || index < 0 || index >= viewer.dataSources.length) return null;
  return viewer.dataSources.get(index);
}

/** current attribute values of an entity's property bag */
export function entityAttributes(entity: Entity): Record<string, unknown> {
  return entity.properties?.getValue(JulianDate.now()) ?? {};
}

export function flyToEntity(entity: Entity): void {
  const viewer = getActiveCesiumViewer();
  if (!viewer) return;
  viewer.selectedEntity = entity;
  viewer.flyTo(entity, { duration: 1.2 });
}

/** live list of the viewer's data sources, refreshed on add/remove */
export function useEntityLayers(): EntityLayerRef[] {
  const [layers, setLayers] = useState<EntityLayerRef[]>(() => listEntityLayers());

  useEffect(() => {
    const viewer = getActiveCesiumViewer();
    if (!viewer) return;
    const refresh = () => setLayers(listEntityLayers());
    viewer.dataSources.dataSourceAdded.addEventListener(refresh);
    viewer.dataSources.dataSourceRemoved.addEventListener(refresh);
    return () => {
      if (viewer.isDestroyed()) return;
      viewer.dataSources.dataSourceAdded.removeEventListener(refresh);
      viewer.dataSources.dataSourceRemoved.removeEventListener(refresh);
    };
  }, []);

  return layers;
}
