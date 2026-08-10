import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import {
  Cartesian2,
  Cartesian3,
  Color,
  GeoJsonDataSource,
  HeadingPitchRange,
  type ImageryLayer,
  Math as CesiumMath,
  Rectangle,
  SingleTileImageryProvider,
  VerticalOrigin,
  type Viewer,
} from 'cesium';
import { useAgentLayerStore, layerColor, layerStyle, visibleLayers } from '../store/agentLayers';
import { useAppStore } from '../store/app';
import { bboxOfCorners, cornersAxisAligned } from '../overlay/georeference';
import { OVERLAY_ENTITY_PREFIX, quadOverlayEntity } from '../overlay/cesiumQuad';

const PREFIX = 'agent-layer-';
const MARKER_PREFIX = 'agent-marker-';

/** Draws the agent's ui_spec layers and markers on Cesium, re-applying after a renderer switch. */
export function useAgentLayersCesium(viewerRef: MutableRefObject<Viewer | null>) {
  const layers = useAgentLayerStore((s) => s.layers);
  const rasterLayers = useAgentLayerStore((s) => s.rasterLayers);
  const markers = useAgentLayerStore((s) => s.markers);
  const generation = useAgentLayerStore((s) => s.generation);
  const renderer = useAppStore((s) => s.renderer);
  const activeTab = useAppStore((s) => s.activeTab);
  const framedRef = useRef(-1);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    // drop our markers, then redraw from the store
    for (const e of viewer.entities.values.filter((e) => e.id.startsWith(MARKER_PREFIX))) {
      viewer.entities.remove(e);
    }
    for (const m of markers) {
      viewer.entities.add({
        id: `${MARKER_PREFIX}${m.id}`,
        position: Cartesian3.fromDegrees(m.lon, m.lat),
        point: { pixelSize: 10, color: Color.fromCssColorString(m.color) },
        label: m.label
          ? {
              text: m.label,
              font: '14px sans-serif',
              verticalOrigin: VerticalOrigin.BOTTOM,
              pixelOffset: new Cartesian2(0, -12),
            }
          : undefined,
      });
    }
  }, [markers, viewerRef, renderer, activeTab]);

  // imagery layers live outside the dataSources collection, so they are added
  // and taken off by hand rather than swept by name like the vector ones
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    let cancelled = false;
    const added: ImageryLayer[] = [];

    // a rectangle goes on as imagery, which follows the terrain. a quad cannot
    // be imagery at all, so it goes on as a textured polygon at ground level
    const drawn = rasterLayers.filter((layer) => layer.visible);
    for (const layer of drawn.filter((layer) => !cornersAxisAligned(layer.corners))) {
      viewer.entities.add(quadOverlayEntity(layer));
    }

    const apply = async () => {
      for (const layer of drawn.filter((layer) => cornersAxisAligned(layer.corners))) {
        const provider = await SingleTileImageryProvider.fromUrl(layer.url, {
          rectangle: Rectangle.fromDegrees(...bboxOfCorners(layer.corners)),
        });
        if (cancelled || viewer.isDestroyed()) return;
        const imagery = viewer.imageryLayers.addImageryProvider(provider);
        imagery.alpha = layer.opacity;
        added.push(imagery);
      }
    };

    void apply();
    return () => {
      cancelled = true;
      if (viewer.isDestroyed()) return;
      for (const imagery of added) {
        if (viewer.imageryLayers.contains(imagery)) viewer.imageryLayers.remove(imagery, true);
      }
      for (const entity of viewer.entities.values.filter((e) =>
        e.id.startsWith(OVERLAY_ENTITY_PREFIX),
      )) {
        viewer.entities.remove(entity);
      }
    };
  }, [rasterLayers, viewerRef, renderer, activeTab]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    let cancelled = false;

    const apply = async () => {
      for (let i = viewer.dataSources.length - 1; i >= 0; i--) {
        const ds = viewer.dataSources.get(i);
        if (ds.name?.startsWith(PREFIX)) viewer.dataSources.remove(ds);
      }

      let last: GeoJsonDataSource | undefined;
      for (const layer of visibleLayers(layers)) {
        const style = layerStyle(layer);
        const color = Color.fromCssColorString(layerColor(layer));
        const ds = await GeoJsonDataSource.load(layer.geojson, {
          stroke: style.stroked ? color : color.withAlpha(0),
          fill: color.withAlpha(style.filled ? style.opacity : 0),
          strokeWidth: style.lineWidth,
          markerColor: color,
        });
        if (cancelled || viewer.isDestroyed()) return;
        ds.name = `${PREFIX}${layer.id}`;
        await viewer.dataSources.add(ds);
        last = ds;
      }

      // Frame only when a new spec arrives, never on a plain renderer switch.
      // Top-down, matching MapLibre's fitBounds: the shared camera stores the
      // camera's ground point as the look-at center, which only holds untilted,
      // so a tilted frame here would shift the view on every renderer switch.
      if (last && framedRef.current !== generation) {
        framedRef.current = generation;
        await viewer
          .flyTo(last, { offset: new HeadingPitchRange(0, CesiumMath.toRadians(-90), 0) })
          .catch(() => undefined);
      }
    };

    void apply();
    return () => {
      cancelled = true;
    };
  }, [layers, generation, viewerRef, renderer, activeTab]);
}
