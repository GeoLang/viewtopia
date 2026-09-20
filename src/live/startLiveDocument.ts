import { useProjectsStore } from '../projects/projectsStore';
import { createLiveDocument } from './api';
import { captureStateForNewDocument } from './documentBridge';
import { useLiveStore } from './liveStore';
import type { LiveDocumentSummary } from './types';

const DEFAULT_LIVE_MAP_NAME = 'Untitled live map';

// agora refuses an attach from a project viewer, so their document starts unattached
function projectForNewDocument(): string | null {
  const { items, activeProjectId } = useProjectsStore.getState();
  const activeRole = items.find((project) => project.id === activeProjectId)?.role;
  return activeRole === 'owner' || activeRole === 'editor' ? activeProjectId : null;
}

export async function startLiveDocument(name: string): Promise<LiveDocumentSummary> {
  const created = await createLiveDocument(
    name.trim() || DEFAULT_LIVE_MAP_NAME,
    projectForNewDocument(),
  );
  // the document starts from what this browser already has on screen
  captureStateForNewDocument();
  useLiveStore.getState().connect({ documentId: created.id });
  return created;
}
