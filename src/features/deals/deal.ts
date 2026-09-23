export type DealStatus = 'prospecting' | 'shortlisted' | 'letterOfIntent' | 'closed' | 'dropped';

interface DealStatusDefinition {
  label: string;
  next: readonly DealStatus[];
}

export const DEAL_STATUSES: Record<DealStatus, DealStatusDefinition> = {
  prospecting: { label: 'Prospecting', next: ['shortlisted', 'dropped'] },
  shortlisted: { label: 'Shortlisted', next: ['prospecting', 'letterOfIntent', 'dropped'] },
  letterOfIntent: { label: 'Letter of intent', next: ['shortlisted', 'closed', 'dropped'] },
  closed: { label: 'Closed', next: [] },
  dropped: { label: 'Dropped', next: ['prospecting'] },
};

export interface ShortlistedSite {
  featureId: string;
  label: string;
}

export interface Deal {
  name: string;
  status: DealStatus;
  shortlist: ShortlistedSite[];
  commentIds: string[];
}

export function startDeal(name: string): Deal {
  return { name, status: 'prospecting', shortlist: [], commentIds: [] };
}

export function changeDealStatus(deal: Deal, status: DealStatus): Deal {
  const current = DEAL_STATUSES[deal.status];
  if (!current.next.includes(status)) {
    throw new Error(`a deal in ${current.label} cannot move to ${DEAL_STATUSES[status].label}`);
  }
  return { ...deal, status };
}

export function addToShortlist(deal: Deal, sites: ShortlistedSite[]): Deal {
  const byFeatureId = new Map(deal.shortlist.map((site) => [site.featureId, site]));
  for (const site of sites) {
    if (!byFeatureId.has(site.featureId)) byFeatureId.set(site.featureId, site);
  }
  return { ...deal, shortlist: [...byFeatureId.values()] };
}

export function removeFromShortlist(deal: Deal, featureId: string): Deal {
  return { ...deal, shortlist: deal.shortlist.filter((site) => site.featureId !== featureId) };
}

export function attachComment(deal: Deal, commentId: string): Deal {
  if (deal.commentIds.includes(commentId)) return deal;
  return { ...deal, commentIds: [...deal.commentIds, commentId] };
}

export function detachComment(deal: Deal, commentId: string): Deal {
  return { ...deal, commentIds: deal.commentIds.filter((id) => id !== commentId) };
}

function isDealStatus(value: unknown): value is DealStatus {
  return typeof value === 'string' && Object.hasOwn(DEAL_STATUSES, value);
}

function requireList<Item>(value: unknown, field: string): Item[] {
  if (!Array.isArray(value)) throw new Error(`project file: deal ${field} is not a list`);
  return value;
}

export function readDeal(value: unknown): Deal {
  const saved = value as Partial<Deal> | null;
  if (!saved || typeof saved !== 'object' || typeof saved.name !== 'string') {
    throw new Error('project file: deal has no name');
  }
  if (!isDealStatus(saved.status)) {
    throw new Error(`project file: unknown deal status ${String(saved.status)}`);
  }
  return {
    name: saved.name,
    status: saved.status,
    shortlist: requireList<ShortlistedSite>(saved.shortlist, 'shortlist'),
    commentIds: requireList<string>(saved.commentIds, 'commentIds'),
  };
}
