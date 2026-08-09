import { notifications } from '@mantine/notifications';
import {
  ALL_IMPORT_FORMATS,
  VECTOR_IMPORT_FORMATS,
  parseImport,
} from './importGeoJson';
import { importVectorFiles } from '../duckdb/importVector';
import { timedImport, loadTimedImport } from './importTime';
import { applyProject, asProject } from '../features/project/projectFile';
import { addLocalPmtiles } from '../features/pmtiles/source';
import { useOgcLayerStore } from '../store/ogcLayers';
import { importOverlayFiles } from '../overlay/importOverlay';
import { OVERLAY_ACCEPT, overlayFileKind } from '../overlay/worldFile';

const extOf = (name: string) => '.' + name.split('.').pop()?.toLowerCase();

// .pmtiles and the overlay formats stay out of ALL_IMPORT_FORMATS: they become
// a tile layer and a draped image, neither of which is GeoJSON
export const ACCEPT_FORMATS = [...ALL_IMPORT_FORMATS, '.pmtiles', ...OVERLAY_ACCEPT];

export interface ImportStatus {
  text: string;
  failed: boolean;
}

export type ImportHandler = (name: string, geojson: GeoJSON.FeatureCollection) => void;
export type StatusHandler = (status: ImportStatus) => void;

// one batch, so shapefile sidecars dropped together stay together
async function handleVectorFiles(files: File[], onImport: ImportHandler, onStatus: StatusHandler) {
  const names = files.map((f) => f.name).join(', ');
  try {
    const { layers, problems } = await importVectorFiles(files);
    for (const layer of layers) {
      onImport(layer.name, layer.geojson);
      notifications.show({
        title: 'Imported',
        message: `${layer.name} — ${layer.geojson.features.length} features`,
        color: 'green',
      });
    }
    for (const problem of problems) {
      notifications.show({
        title: problem.level === 'warning' ? 'Imported with a gap' : 'Import failed',
        message: `${problem.file} — ${problem.message}`,
        color: problem.level === 'warning' ? 'yellow' : 'red',
      });
    }
    const summary = layers.length
      ? layers.map((l) => `${l.name}: ${l.geojson.features.length} features`).join(', ')
      : problems.map((p) => `${p.file}: ${p.message}`).join(', ');
    onStatus({ text: summary || `${names}: nothing to import`, failed: layers.length === 0 });
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'import failed';
    onStatus({ text: `${names}: ${reason}`, failed: true });
    notifications.show({ title: 'Import failed', message: `${names} — ${reason}`, color: 'red' });
  }
}

// the archive stays a tile source: registered on the pmtiles protocol and
// listed with the OGC layers, which only the MapLibre renderer draws
async function handlePmtilesFile(file: File, onStatus: StatusHandler) {
  try {
    const { url, info } = await addLocalPmtiles(file);
    const store = useOgcLayerStore.getState();
    const layer = store.addLayer(file.name.replace(/\.pmtiles$/i, ''), url, 'pmtiles');
    store.setPmtilesInfo(layer.id, info);
    const summary = `${info.kind} tiles, zoom ${info.minZoom}–${info.maxZoom}`;
    onStatus({ text: `${file.name}: ${summary}`, failed: false });
    notifications.show({ title: 'Imported', message: `${file.name} — ${summary}`, color: 'green' });
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'import failed';
    onStatus({ text: `${file.name}: ${reason}`, failed: true });
    notifications.show({ title: 'Import failed', message: `${file.name} — ${reason}`, color: 'red' });
  }
}

// one batch, so an image and its world file dropped together stay together
async function handleOverlayFiles(files: File[], onStatus: StatusHandler) {
  const names = files.map((f) => f.name).join(', ');
  try {
    const summary = await importOverlayFiles(files);
    onStatus({ text: summary, failed: false });
    notifications.show({ title: 'Overlay added', message: summary, color: 'green' });
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'overlay import failed';
    onStatus({ text: `${names}: ${reason}`, failed: true });
    notifications.show({
      title: 'Overlay import failed',
      message: `${names} — ${reason}`,
      color: 'red',
    });
  }
}

/** Route dropped or browsed files through every import path the app has. */
export async function importFiles(
  files: File[],
  onImport: ImportHandler,
  onStatus: StatusHandler = () => {},
) {
  const pmtilesFiles = files.filter((f) => extOf(f.name) === '.pmtiles');
  for (const file of pmtilesFiles) await handlePmtilesFile(file, onStatus);
  let rest = files.filter((f) => !pmtilesFiles.includes(f));

  // a .prj also rides with a shapefile, so the sidecars only count as overlay
  // ones when an image or PDF came with them
  const overlayFiles = rest.filter((f) => overlayFileKind(f.name) !== null);
  const hasPicture = overlayFiles.some((f) => {
    const kind = overlayFileKind(f.name);
    return kind === 'image' || kind === 'pdf';
  });
  if (hasPicture) {
    await handleOverlayFiles(overlayFiles, onStatus);
    rest = rest.filter((f) => !overlayFiles.includes(f));
  }

  const vectorFiles = rest.filter((f) => VECTOR_IMPORT_FORMATS.includes(extOf(f.name)));
  if (vectorFiles.length) await handleVectorFiles(vectorFiles, onImport, onStatus);

  for (const file of rest.filter((f) => !vectorFiles.includes(f))) {
    const ext = extOf(file.name);
    if (!ALL_IMPORT_FORMATS.includes(ext)) {
      onStatus({ text: `${file.name}: unsupported file`, failed: true });
      notifications.show({
        title: 'Unsupported file',
        message: `${file.name} — supported: ${ALL_IMPORT_FORMATS.join(', ')}`,
        color: 'red',
      });
      continue;
    }
    try {
      const text = await file.text();
      // a saved workspace is .json too, so open it instead of reading geometry
      const project = ext === '.json' ? asProject(text) : null;
      if (project) {
        applyProject(project);
        onStatus({ text: `${file.name}: project opened`, failed: false });
        notifications.show({
          title: 'Project opened',
          message: `${file.name} — ${project.name}`,
          color: 'green',
        });
        continue;
      }
      const collection = parseImport(file.name, text);
      const count = `${collection.features.length} features`;
      // timestamped data goes in as CZML so the clock can play it. with no
      // Cesium viewer it takes the plain-geometry path every renderer draws
      const timed = timedImport(collection);
      const onTimeline = timed ? await loadTimedImport(file.name, timed) : false;
      if (!onTimeline) onImport(file.name, collection);
      const summary = onTimeline
        ? `${count}, ${timed?.features.length} on the timeline`
        : timed
          ? `${count}, timeline needs CesiumJS`
          : count;
      onStatus({ text: `${file.name}: ${summary}`, failed: false });
      notifications.show({
        title: 'Imported',
        message: `${file.name} — ${summary}`,
        color: 'green',
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'parse error';
      onStatus({ text: `${file.name}: ${reason}`, failed: true });
      notifications.show({
        title: 'Import failed',
        message: `${file.name} — ${reason}`,
        color: 'red',
      });
    }
  }
}
