export type BackendName = 'ptolemy' | 'tiletopia' | 'agora' | 'geolang';

export interface Backend {
  /** what a user sees in an error message or the header status list */
  label: string;
  /** browser-facing path, rewritten to the service by the platform nginx */
  healthPath: string;
}

export const BACKENDS: Record<BackendName, Backend> = {
  ptolemy: { label: 'ptolemy (data)', healthPath: '/api/v1/health' },
  tiletopia: { label: 'tiletopia (tiles)', healthPath: '/tiles/v1/health' },
  agora: { label: 'agora (live)', healthPath: '/agora/health' },
  geolang: { label: 'geolang (agent)', healthPath: '/agent/health' },
};

/** status 0 is a fetch that never got a response */
const UNREACHABLE_STATUSES = new Set([0, 502, 503, 504]);

export function isUnreachableStatus(status: number): boolean {
  return UNREACHABLE_STATUSES.has(status);
}

export function unreachableMessage(backend: BackendName, status: number): string {
  const { label } = BACKENDS[backend];
  return status === 0 ? `${label} is unreachable` : `${label} is unreachable (${status})`;
}
