import { useEffect } from 'react';
import type { MutableRefObject } from 'react';
import {
  UrlTemplateImageryProvider,
  WebMapServiceImageryProvider,
  Viewer,
  type ImageryProvider,
} from 'cesium';
import { useOgcLayerStore, wmsLayerNames, type OGCLayer } from '../store/ogcLayers';
import { useAppStore } from '../store/app';

function imageryProvider(layer: OGCLayer): ImageryProvider {
  if (layer.type === 'xyz') {
    return new UrlTemplateImageryProvider({ url: layer.url, credit: layer.name });
  }
  // Cesium merges its GetMap parameters into the pasted URL's own query, so a
  // service URL carrying extras keeps them.
  return new WebMapServiceImageryProvider({
    url: layer.url,
    layers: wmsLayerNames(layer),
    parameters: { transparent: true, format: 'image/png' },
    credit: layer.name,
  });
}

/** Drapes the user's OGC/XYZ services over the Cesium globe as imagery layers. */
export function useOgcLayersCesium(viewerRef: MutableRefObject<Viewer | null>) {
  const layers = useOgcLayerStore((s) => s.layers);
  const renderer = useAppStore((s) => s.renderer);
  const activeTab = useAppStore((s) => s.activeTab);
  // a basemap swap calls imageryLayers.removeAll(), taking ours with it
  const basemap = useAppStore((s) => s.basemap);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    const added = layers.map((layer) =>
      viewer.imageryLayers.addImageryProvider(imageryProvider(layer)),
    );
    return () => {
      if (viewer.isDestroyed()) return;
      for (const imagery of added) {
        if (viewer.imageryLayers.contains(imagery)) viewer.imageryLayers.remove(imagery, true);
      }
    };
  }, [layers, viewerRef, renderer, activeTab, basemap]);
}
