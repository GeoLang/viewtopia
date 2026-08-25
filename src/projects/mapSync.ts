/**
 * A project's map lives on the server, so every member opens the same one.
 *
 * The snapshot is the same `ViewtopiaProject` a saved project file holds, kept
 * under the project's `map` state key in ptolemy. IndexedDB keeps a copy as the
 * offline cache: on load the newer `savedAt` of the two wins, and a save the
 * network refused leaves `unpushed` set on the cached record, so it goes up
 * again on the next change, the next project switch, when the browser says it
 * is online, or when the app starts again after a reload.
 */
import { projectMaps, type ProjectMap } from '../offline/db';
import {
  applyProject,
  serializeProject,
  storeOverlayImages,
  type ViewtopiaProject,
} from '../features/project/projectFile';
import { useAppStore } from '../store/app';
import { useAgentLayerStore } from '../store/agentLayers';
import { useOgcLayerStore } from '../store/ogcLayers';
import { useSplitViewStore } from '../store/splitView';
import { subscribeSharedCamera } from '../hooks/sharedCamera';
import { deleteProjectAttachment, getProjectState, putProjectState } from './api';

export const MAP_STATE_KEY = 'map';

/** How long the map sits still before it goes to the server. */
export const SAVE_DEBOUNCE_MS = 4000;

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let unsavedMapSweep: Promise<void> | null = null;

/** When either side has no snapshot, or a `savedAt` that is not a date. */
function savedAtMillis(snapshot: ViewtopiaProject | undefined): number {
  const parsed = Date.parse(snapshot?.savedAt ?? '');
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Which of the cached map and the server's map is the one to draw. A tie goes
 * to the server, so a browser that pushed its own snapshot and read it back
 * does not treat the round trip as a conflict.
 */
export function newerSnapshot(
  cached: ViewtopiaProject | undefined,
  server: ViewtopiaProject | undefined,
): ViewtopiaProject | undefined {
  if (!server) return cached;
  if (!cached) return server;
  return savedAtMillis(server) >= savedAtMillis(cached) ? server : cached;
}

/**
 * Put the project's map on screen: whichever of the cache and the server is
 * newer. A project nobody has left a map in keeps what is on screen, so
 * switching into a fresh one never throws work away.
 *
 * A cache that wins is a save this browser made while the server was out of
 * reach, so it goes up here.
 */
export async function loadProjectMap(projectId: string): Promise<void> {
  const cachedEntry = await projectMaps.get(projectId);
  const cached = cachedEntry?.map;
  let server: ViewtopiaProject | undefined;
  try {
    server = (await getProjectState<ViewtopiaProject>(projectId, MAP_STATE_KEY))?.value;
  } catch (failure) {
    console.warn('could not read the project map from the server', failure);
  }

  const winner = newerSnapshot(cached, server);
  if (!winner) return;
  if (winner === server) {
    await projectMaps.put({ id: projectId, map: winner, unpushed: false });
  } else {
    await pushMap({ ...cachedEntry, id: projectId, map: winner, unpushed: true });
  }
  applyProject(winner, projectId);
}

/**
 * Write what is on screen to the cache and to the server. A server that refuses
 * leaves the cache written and the project queued for the next push.
 */
export async function saveProjectMap(projectId: string, name: string): Promise<void> {
  await storeOverlayImages(projectId).catch((failure: unknown) => {
    console.warn('could not upload an overlay bitmap', failure);
  });
  const map = serializeProject(name);
  const previous = await projectMaps.get(projectId);
  const entry = {
    id: projectId,
    map,
    unpushed: true,
    droppedAttachmentIds: droppedAttachmentIds(previous, map),
  };
  // cache first, so a push that hangs or fails cannot lose what is on screen
  await projectMaps.put(entry);
  await pushMap(entry);
}

function overlayAttachmentIds(snapshot: ViewtopiaProject | undefined): string[] {
  return (snapshot?.imageOverlays ?? []).flatMap((overlay) => overlay.attachmentId ?? []);
}

/**
 * Attachments the server's snapshot may still name and this one does not:
 * what the last save left waiting, plus what the cached map drew and this map
 * dropped. Kept on the record because a retry has no earlier snapshot to diff.
 */
function droppedAttachmentIds(previous: ProjectMap | undefined, map: ViewtopiaProject): string[] {
  const kept = new Set(overlayAttachmentIds(map));
  const candidates = new Set([
    ...(previous?.droppedAttachmentIds ?? []),
    ...overlayAttachmentIds(previous?.map),
  ]);
  return [...candidates].filter((attachmentId) => !kept.has(attachmentId));
}

/**
 * Drop the ptolemy attachments the map has stopped drawing. Only after the
 * server took the snapshot that stopped naming them, so another member never
 * reads a snapshot pointing at an attachment that is already gone.
 */
async function deleteDroppedAttachments(attachmentIds: string[]): Promise<void> {
  for (const attachmentId of attachmentIds) {
    await deleteProjectAttachment(attachmentId).catch((failure: unknown) => {
      console.warn('could not delete the attachment behind a removed overlay', failure);
    });
  }
}

async function pushMap(entry: ProjectMap): Promise<void> {
  const dropped = entry.droppedAttachmentIds ?? [];
  try {
    await putProjectState(entry.id, MAP_STATE_KEY, entry.map);
  } catch (failure) {
    console.warn('could not save the project map to the server', failure);
    await projectMaps.put({ ...entry, unpushed: true, droppedAttachmentIds: dropped });
    return;
  }
  await projectMaps.put({ ...entry, unpushed: false, droppedAttachmentIds: [] });
  await deleteDroppedAttachments(dropped);
}

async function pushEveryUnsavedMap(): Promise<void> {
  const cached = await projectMaps.getAll();
  for (const entry of cached) {
    if (entry.unpushed) await pushMap(entry);
  }
}

/** Push every cached map the server has not accepted yet. */
export function pushUnsavedMaps(): Promise<void> {
  // two sweeps at once would each read the flag and push the same snapshot
  unsavedMapSweep ??= pushEveryUnsavedMap().finally(() => {
    unsavedMapSweep = null;
  });
  return unsavedMapSweep;
}

/** For a test that needs the queue empty before it starts. */
export function forgetUnsavedMaps(): void {
  void projectMaps.clear();
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
}

/**
 * Save the active project's map once the map stops changing. Every change
 * restarts the wait, and each save also retries whatever the server refused
 * earlier.
 */
export function scheduleMapSave(activeProject: () => { id: string; name: string } | null): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const project = activeProject();
    const save = project ? saveProjectMap(project.id, project.name) : Promise.resolve();
    void save.then(pushUnsavedMaps).catch((failure: unknown) => {
      console.warn('could not save the project map', failure);
    });
  }, SAVE_DEBOUNCE_MS);
}

/**
 * Watch everything `serializeProject` reads and start the debounce when any of
 * it changes. Returns the unsubscribe, which only a test uses: the app starts
 * this once and keeps it for the session.
 *
 * Starting also pushes every cached map a previous session left unpushed, which
 * is what carries a change made offline across a reload.
 */
export function watchMapForSaving(
  activeProject: () => { id: string; name: string } | null,
): () => void {
  void pushUnsavedMaps();
  const onChange = () => scheduleMapSave(activeProject);
  const stops = [
    useAppStore.subscribe(onChange),
    useAgentLayerStore.subscribe(onChange),
    useOgcLayerStore.subscribe(onChange),
    useSplitViewStore.subscribe(onChange),
    subscribeSharedCamera(onChange),
  ];
  const onOnline = () => {
    void pushUnsavedMaps();
  };
  window.addEventListener('online', onOnline);
  return () => {
    for (const stop of stops) stop();
    window.removeEventListener('online', onOnline);
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
  };
}
