import { authHeaders, noticeRefusal } from '../../lib/apiAuth';

export async function newestAssetJob(assetId: string): Promise<Record<string, unknown> | null> {
  const response = await fetch(`/tiles/v1/assets/${assetId}/jobs`, { headers: authHeaders() });
  noticeRefusal(response.status);
  if (!response.ok) throw new Error(`The tiling job could not be read (HTTP ${response.status}).`);
  const jobs: unknown = await response.json();
  return Array.isArray(jobs) ? (jobs[0] ?? null) : null;
}

export function jobErrorText(job: Record<string, unknown> | null): string | null {
  const error = job?.error;
  return typeof error === 'string' && error ? error : null;
}
