import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addToShortlist,
  attachComment,
  changeDealStatus,
  type Deal,
  detachComment,
  removeFromShortlist,
  startDeal,
} from '../../src/features/deals/deal';
import { useDealStore } from '../../src/features/deals/store';
import { applyProject, parseProject, serializeProject } from '../../src/features/project/projectFile';

const corner = { featureId: 'parcel-1', label: '100 King St W' };
const midblock = { featureId: 'parcel-2', label: '120 King St W' };
const waterfront = { featureId: 'parcel-3', label: '1 Queens Quay' };

const offerStage: Deal = {
  name: 'Queen West expansion',
  status: 'letterOfIntent',
  shortlist: [corner, midblock],
  commentIds: ['thread-1'],
};

// applyProject polls for a Cesium viewer that never arrives in jsdom
const CAMERA_POLL_MS = 4200;

describe('deal status', () => {
  it('starts in prospecting with nothing on it', () => {
    expect(startDeal('Queen West expansion')).toEqual({
      name: 'Queen West expansion',
      status: 'prospecting',
      shortlist: [],
      commentIds: [],
    });
  });

  it('walks forward from prospecting to closed', () => {
    let deal = startDeal('Queen West expansion');
    deal = changeDealStatus(deal, 'shortlisted');
    deal = changeDealStatus(deal, 'letterOfIntent');
    deal = changeDealStatus(deal, 'closed');
    expect(deal.status).toBe('closed');
  });

  it('refuses to skip from prospecting straight to closed', () => {
    expect(() => changeDealStatus(startDeal('d'), 'closed')).toThrow(/Prospecting.*Closed/);
  });

  it('keeps a closed deal closed', () => {
    const closed: Deal = { ...offerStage, status: 'closed' };
    expect(() => changeDealStatus(closed, 'dropped')).toThrow();
    expect(() => changeDealStatus(closed, 'prospecting')).toThrow();
  });

  it('reopens a dropped deal into prospecting only', () => {
    const dropped: Deal = { ...offerStage, status: 'dropped' };
    expect(changeDealStatus(dropped, 'prospecting').status).toBe('prospecting');
    expect(() => changeDealStatus(dropped, 'letterOfIntent')).toThrow();
  });

  it('leaves the deal it was given untouched', () => {
    const deal = startDeal('d');
    changeDealStatus(deal, 'shortlisted');
    expect(deal.status).toBe('prospecting');
  });
});

describe('shortlist', () => {
  it('appends new sites in order and skips ones already on it', () => {
    const deal = addToShortlist(offerStage, [midblock, waterfront, waterfront]);
    expect(deal.shortlist).toEqual([corner, midblock, waterfront]);
  });

  it('removes one site by feature id', () => {
    expect(removeFromShortlist(offerStage, 'parcel-1').shortlist).toEqual([midblock]);
  });
});

describe('comments by reference', () => {
  it('attaches a thread once however often it is attached', () => {
    const deal = attachComment(attachComment(offerStage, 'thread-2'), 'thread-2');
    expect(deal.commentIds).toEqual(['thread-1', 'thread-2']);
  });

  it('detaches a thread', () => {
    expect(detachComment(offerStage, 'thread-1').commentIds).toEqual([]);
  });
});

describe('deal in the project file', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useDealStore.setState({ deal: null });
  });

  afterEach(() => {
    vi.advanceTimersByTime(CAMERA_POLL_MS);
    vi.useRealTimers();
    useDealStore.setState({ deal: null });
  });

  it('round trips name, status, shortlist and comment ids', () => {
    useDealStore.getState().setDeal(offerStage);
    const saved = JSON.stringify(serializeProject('toronto'));
    useDealStore.setState({ deal: null });

    applyProject(parseProject(saved));

    expect(useDealStore.getState().deal).toEqual(offerStage);
  });

  it('writes no deal key when the project has no deal', () => {
    expect(serializeProject('toronto')).not.toHaveProperty('deal');
  });

  it('clears the deal on screen when the opened project has none', () => {
    const withoutDeal = JSON.stringify(serializeProject('other'));
    useDealStore.getState().setDeal(offerStage);

    applyProject(parseProject(withoutDeal));

    expect(useDealStore.getState().deal).toBeNull();
  });

  it('rejects a deal with a status it does not know', () => {
    const saved = { ...serializeProject('toronto'), deal: { ...offerStage, status: 'escrow' } };
    expect(() => parseProject(JSON.stringify(saved))).toThrow(/unknown deal status escrow/);
  });

  it('rejects a deal whose shortlist is not a list', () => {
    const saved = { ...serializeProject('toronto'), deal: { ...offerStage, shortlist: 'parcel-1' } };
    expect(() => parseProject(JSON.stringify(saved))).toThrow(/shortlist is not a list/);
  });
});
