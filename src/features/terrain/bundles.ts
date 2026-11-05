import {
  CesiumTerrainProvider,
  EllipsoidTerrainProvider,
  type TerrainProvider,
  type Viewer,
} from 'cesium';

export const TERRAIN_BUNDLE_LIST_URL = '/tiles/v1/terrain/bundles';

// cesium's fromUrl appends layer.json, so the trailing slash is what keeps it inside the bundle
export const terrainBundleUrl = (name: string) => `${TERRAIN_BUNDLE_LIST_URL}/${name}/`;

export async function terrainProviderFromLayerJson(url: string): Promise<CesiumTerrainProvider> {
  const layerJsonUrl = `${url}layer.json`;
  // tiletopia's max-age of 300 on layer.json keeps a deleted bundle at 200 in the browser cache
  const response = await fetch(layerJsonUrl, { cache: 'no-cache' });
  // cesium's fromUrl reads a 404 on layer.json as a heightmap tileset with no metadata and resolves
  if (!response.ok) {
    // tiletopia answers its refusals as plain text and nginx answers its errors as an html page
    const isPlainText = response.headers.get('content-type')?.startsWith('text/plain');
    const reason = isPlainText ? (await response.text()).trim() : '';
    throw new Error(reason || `${layerJsonUrl} answered HTTP ${response.status}`);
  }
  return CesiumTerrainProvider.fromUrl(url);
}

const bundleNameOfProvider = new WeakMap<TerrainProvider, string>();

export async function terrainBundleProvider(name: string): Promise<CesiumTerrainProvider> {
  const provider = await terrainProviderFromLayerJson(terrainBundleUrl(name));
  bundleNameOfProvider.set(provider, name);
  return provider;
}

export async function setTerrainBundle(viewer: Viewer, name: string): Promise<void> {
  try {
    viewer.terrainProvider = await terrainBundleProvider(name);
  } catch (failure) {
    // cesium's rejections carry the inner error on later lines, often as a bare "undefined"
    const message = (failure instanceof Error ? failure.message : String(failure)).split('\n')[0];
    throw new Error(`terrain ${name} did not load: ${message}`);
  }
}

export function removeTerrainBundle(viewer: Viewer, name: string): void {
  if (bundleNameOfProvider.get(viewer.terrainProvider) !== name) return;
  viewer.terrainProvider = new EllipsoidTerrainProvider();
}
