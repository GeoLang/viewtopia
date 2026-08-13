import { useAppStore, asRenderer, type Renderer, type Basemap, type CustomBasemap } from '../../store/app';
import { BASEMAP_OPTIONS } from '../../hooks/basemapTiles';
import {
  useAgentLayerStore,
  type AgentLayer,
  type AgentMarker,
  type AgentRasterLayer,
} from '../../store/agentLayers';
import { overlayImages } from '../../offline/db';
import { migrateLegacyChoropleth } from '../symbology/symbology';
import { useOgcLayerStore, loadPmtilesLayer, type OGCLayer } from '../../store/ogcLayers';
import { useSplitViewStore, type Pane } from '../../store/splitView';
import { captureCameraState, flyToCameraState, type CameraState } from '../../store/cameraViews';
import { getActiveCesiumViewer, getActiveMapLibre } from '../../viewer/registry';
import { getSharedCamera, setSharedCamera } from '../../hooks/sharedCamera';

/**
 * The whole workspace as one file: what is on screen and where the camera is.
 * Chat, settings, bookmarks and offline stores stay out, they belong to the
 * browser rather than to the map being shared.
 */
export interface ViewtopiaProject {
  app: 'viewtopia';
  schemaVersion: 1;
  name: string;
  savedAt: string;
  renderer: Renderer;
  basemap: Basemap;
  customBasemap?: CustomBasemap;
  /** name of the .pmtiles behind basemap 'local'; the file itself never travels */
  localBasemap?: { name: string };
  camera: CameraState;
  splitView?: { active: boolean; comparePanes: Pane[] };
  agentLayers: AgentLayer[];
  markers: AgentMarker[];
  ogcLayers: OGCLayer[];
  /** Draped images, without their bitmaps: those live in IndexedDB. */
  imageOverlays: ImageOverlayEntry[];
}

export type ImageOverlayEntry = Omit<AgentRasterLayer, 'url'>;

/** MapLibre zoom and Cesium height, the conversion the share link already uses. */
function heightFromZoom(zoom: number): number {
  return 4e7 / 2 ** zoom;
}

function zoomFromHeight(height: number): number {
  return Math.max(0, Math.log2(4e7 / Math.max(height || 1, 1)));
}

/**
 * Camera off the renderer that is on screen, falling back to the shared camera
 * when no viewer is live. Cesium pitch convention: 0 = horizon, -90 = down.
 */
function liveCamera(renderer: Renderer): CameraState {
  if (renderer === 'cesium') {
    const viewer = getActiveCesiumViewer();
    const cam = viewer ? captureCameraState(viewer) : null;
    if (cam) return cam;
  }
  if (renderer === 'maplibre') {
    const map = getActiveMapLibre();
    if (map) {
      const c = map.getCenter();
      return {
        lng: c.lng,
        lat: c.lat,
        height: heightFromZoom(map.getZoom()),
        heading: map.getBearing(),
        pitch: map.getPitch() - 90,
        roll: 0,
      };
    }
  }
  const shared = getSharedCamera();
  return {
    lng: shared.longitude,
    lat: shared.latitude,
    height: heightFromZoom(shared.zoom),
    heading: shared.bearing,
    pitch: shared.pitch - 90,
    roll: 0,
  };
}

export function serializeProject(name: string): ViewtopiaProject {
  const app = useAppStore.getState();
  const agent = useAgentLayerStore.getState();
  const split = useSplitViewStore.getState();
  return {
    app: 'viewtopia',
    schemaVersion: 1,
    name,
    savedAt: new Date().toISOString(),
    renderer: app.renderer,
    basemap: app.basemap,
    ...(app.basemap === 'custom' && app.customBasemap
      ? { customBasemap: app.customBasemap }
      : {}),
    ...(app.basemap === 'local' && app.localBasemap
      ? { localBasemap: { name: app.localBasemap.name } }
      : {}),
    camera: liveCamera(app.renderer),
    splitView: { active: split.active, comparePanes: split.comparePanes },
    agentLayers: agent.layers,
    markers: agent.markers,
    imageOverlays: agent.rasterLayers.map(({ url: _url, ...entry }) => entry),
    // a dropped .pmtiles is a browser File the protocol resolves in this
    // session only, so saving its entry would only produce a dead layer
    ogcLayers: useOgcLayerStore.getState().layers.filter((l) => !l.pmtiles?.local),
  };
}

const KNOWN_BASEMAPS: string[] = [...BASEMAP_OPTIONS.map((o) => o.value), 'custom', 'local'];

/** Saved compare panes, minus any naming a renderer or basemap the app no longer has. */
function readComparePanes(saved: unknown): Pane[] {
  const list = Array.isArray(saved) ? saved : [];
  return list.flatMap((entry: Partial<Pane>) => {
    const renderer = asRenderer(entry.renderer);
    if (!renderer || !KNOWN_BASEMAPS.includes(entry.basemap as string)) return [];
    return [{ renderer, basemap: entry.basemap as Basemap }];
  });
}

function requireArray(value: unknown, field: string): unknown[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`project file: ${field} is not a list`);
  return value;
}

function readCamera(value: unknown): CameraState {
  const c = value as Partial<CameraState> | undefined;
  if (!c || !Number.isFinite(c.lng) || !Number.isFinite(c.lat)) {
    throw new Error('project file: missing or invalid camera');
  }
  return {
    lng: c.lng as number,
    lat: c.lat as number,
    height: Number.isFinite(c.height) ? (c.height as number) : 1e6,
    heading: c.heading ?? 0,
    pitch: c.pitch ?? -30,
    roll: c.roll ?? 0,
  };
}

export function parseProject(text: string): ViewtopiaProject {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('project file: not valid JSON');
  }
  const p = raw as Partial<ViewtopiaProject> | null;
  if (!p || typeof p !== 'object' || p.app !== 'viewtopia') {
    throw new Error('not a Viewtopia project file');
  }
  if (p.schemaVersion !== 1) {
    throw new Error(`project file: unsupported schema version ${String(p.schemaVersion)}`);
  }
  const renderer = asRenderer(p.renderer);
  if (!renderer) throw new Error(`project file: unknown renderer ${String(p.renderer)}`);
  if (typeof p.basemap !== 'string' || !KNOWN_BASEMAPS.includes(p.basemap)) {
    throw new Error(`project file: unknown basemap ${String(p.basemap)}`);
  }

  return {
    app: 'viewtopia',
    schemaVersion: 1,
    name: typeof p.name === 'string' ? p.name : 'workspace',
    savedAt: typeof p.savedAt === 'string' ? p.savedAt : '',
    renderer,
    basemap: p.basemap,
    ...(p.customBasemap ? { customBasemap: p.customBasemap } : {}),
    ...(p.localBasemap?.name ? { localBasemap: { name: p.localBasemap.name } } : {}),
    camera: readCamera(p.camera),
    ...(p.splitView
      ? {
          splitView: {
            active: !!p.splitView.active,
            comparePanes: readComparePanes(p.splitView.comparePanes),
          },
        }
      : {}),
    agentLayers: (requireArray(p.agentLayers, 'agentLayers') as AgentLayer[]).map(
      migrateLegacyChoropleth,
    ),
    markers: requireArray(p.markers, 'markers') as AgentMarker[],
    ogcLayers: requireArray(p.ogcLayers, 'ogcLayers') as OGCLayer[],
    imageOverlays: requireArray(p.imageOverlays, 'imageOverlays') as ImageOverlayEntry[],
  };
}

/** Keep the bitmaps the saved file will ask for by id when it is opened. */
export async function storeOverlayImages(): Promise<void> {
  for (const layer of useAgentLayerStore.getState().rasterLayers) {
    await overlayImages.put({ id: layer.id, dataUrl: layer.url });
  }
}

/**
 * Put back the overlays whose bitmaps this browser still holds. A project saved
 * on another machine has no picture here, so those are dropped rather than
 * drawn blank.
 */
export async function restoreImageOverlays(entries: ImageOverlayEntry[]): Promise<void> {
  for (const entry of entries) {
    const image = await overlayImages.get(entry.id);
    if (!image) {
      console.warn(`image overlay "${entry.name}" skipped: its picture is not in this browser`);
      continue;
    }
    useAgentLayerStore.getState().addRasterLayer({ ...entry, url: image.dataUrl });
  }
}

/** Seed the shared camera, then fly the Cesium viewer once it exists. */
function applyCamera(cam: CameraState): void {
  setSharedCamera({
    longitude: cam.lng,
    latitude: cam.lat,
    zoom: zoomFromHeight(cam.height),
    bearing: cam.heading || 0,
    pitch: (cam.pitch || 0) + 90,
  });
  let tries = 0;
  const timer = setInterval(() => {
    const viewer = getActiveCesiumViewer();
    if (viewer) {
      flyToCameraState(viewer, cam, { reduceMotion: true });
      clearInterval(timer);
    } else if (++tries > 40) {
      clearInterval(timer);
    }
  }, 100);
}

/**
 * A saved service back under its own id, which a WFS layer's features are filed
 * against. The saved archive info is dropped and read again: the pmtiles
 * protocol only resolves a url it was given a source for in this session.
 */
function restoreOgcLayer(saved: OGCLayer): void {
  const { pmtiles: _stale, ...layer } = saved;
  useOgcLayerStore.getState().putLayer(layer);
  if (layer.type !== 'pmtiles') return;
  void loadPmtilesLayer(layer).catch((failure) => {
    console.warn(`layer "${layer.name}" could not read its pmtiles archive`, failure);
  });
}

export function applyProject(project: ViewtopiaProject): void {
  const app = useAppStore.getState();
  app.setRenderer(project.renderer);
  if (project.basemap === 'custom' && project.customBasemap) {
    app.setCustomBasemap(project.customBasemap);
  } else if (project.basemap === 'local' && project.localBasemap) {
    // the archive is a file on whoever saved this, so it is asked for by name
    // unless this browser already has that one open
    const open = app.localBasemap;
    app.setLocalBasemap(
      open?.name === project.localBasemap.name
        ? open
        : { name: project.localBasemap.name, status: 'needs-file' },
    );
  } else {
    app.setBasemap(project.basemap);
  }

  if (project.splitView) {
    const split = useSplitViewStore.getState();
    // a file saved before panes had their own basemap carries no pane list
    if (project.splitView.comparePanes.length > 0) {
      split.setComparePanes(project.splitView.comparePanes);
    }
    split.setActive(project.splitView.active);
  }

  useAgentLayerStore.getState().setLayers(project.agentLayers);
  useAgentLayerStore.getState().setMarkers(project.markers);
  useAgentLayerStore.setState({ rasterLayers: [], editingRasterId: null });
  void restoreImageOverlays(project.imageOverlays);

  const ogc = useOgcLayerStore.getState();
  for (const layer of [...ogc.layers]) ogc.removeLayer(layer.id);
  for (const saved of project.ogcLayers) restoreOgcLayer(saved);

  applyCamera(project.camera);
}

/** A project if the text is one, else null. Throws when it is one but unreadable. */
export function asProject(text: string): ViewtopiaProject | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const p = raw as { app?: unknown; schemaVersion?: unknown } | null;
  if (!p || typeof p !== 'object') return null;
  if (p.app !== 'viewtopia' || typeof p.schemaVersion !== 'number') return null;
  return parseProject(text);
}

function slug(name: string): string {
  const s = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return s || 'workspace';
}

export async function saveProjectFile(name: string): Promise<void> {
  await storeOverlayImages();
  const blob = new Blob([JSON.stringify(serializeProject(name), null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slug(name)}.viewtopia.json`;
  a.click();
  URL.revokeObjectURL(url);
}
