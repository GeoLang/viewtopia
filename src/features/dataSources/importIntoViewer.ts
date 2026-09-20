/**
 * Files becoming layers. The files tab hands dropped and browsed files here,
 * and the chat's data.import_url fetches a URL and hands the result to the same
 * place, so a file imported either way is drawn the same.
 */
import { importFiles, type ImportStatus } from '../../lib/importFiles';
import { useAgentLayerStore } from '../../store/agentLayers';
import { featuresBounds, type LayerBounds } from '../../hooks/agentLayerBounds';
import { getViewBounds } from '../../lib/viewBounds';

const IMPORTED_LAYER_COLOR = '#38bdf8';

function insideCurrentView([west, south, east, north]: LayerBounds): boolean {
  const view = getViewBounds();
  return west >= view.west && east <= view.east && south >= view.south && north <= view.north;
}

/** Imported features join the agent layers, so every renderer draws them. */
export function addImportedLayer(name: string, geojson: GeoJSON.FeatureCollection): void {
  // a layer already on screen must not move the camera
  const bounds = featuresBounds(geojson.features ?? []);
  const fit = bounds !== null && !insideCurrentView(bounds);
  useAgentLayerStore
    .getState()
    .addLayer({ id: crypto.randomUUID(), name, color: IMPORTED_LAYER_COLOR, geojson }, fit);
}

/**
 * Fetch a file and import it under `fileName`, whose extension picks the
 * reader. Answers what the files tab would have shown about it.
 */
export async function importUrlIntoViewer(
  url: string,
  fileName: string,
): Promise<ImportStatus> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} answered HTTP ${response.status}`);
  const file = new File([await response.arrayBuffer()], fileName);
  // importFiles reports nothing for a file it sends to the tileset builder
  let status: ImportStatus = { text: `${fileName}: offered to the tileset builder`, failed: false };
  await importFiles([file], addImportedLayer, (reported) => {
    status = reported;
  });
  return status;
}
