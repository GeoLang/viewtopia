export const FIRST_RUN_DISMISSED_KEY = 'viewtopia-first-run';

// read before the app store's first persist write can create the key
export const returningVisitor = localStorage.getItem('viewtopia-app') !== null;

/** What a profile has done, against the three things the guidance points at. */
export interface FirstRunProgress {
  dismissed: boolean;
  layerCount: number;
  activeProjectId: string | null;
  liveDocumentId: string | null;
}

export function firstRunDismissed(): boolean {
  return localStorage.getItem(FIRST_RUN_DISMISSED_KEY) !== null;
}

export function dismissFirstRun(): void {
  localStorage.setItem(FIRST_RUN_DISMISSED_KEY, 'dismissed');
}

/**
 * Guidance shows on a profile that has imported nothing, opened no project and
 * joined no live session. Doing any one of them retires it, as does dismissing
 * it, and it never comes back.
 */
export function firstRunVisible(progress: FirstRunProgress): boolean {
  return (
    !progress.dismissed &&
    progress.layerCount === 0 &&
    progress.activeProjectId === null &&
    progress.liveDocumentId === null
  );
}
