import { describe, it, expect, vi, beforeEach } from 'vitest';

const snapshot = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));

vi.mock('../../src/actions/snapshot', () => ({
  buildViewerSnapshot: () => snapshot.value,
}));

import { INITIAL_PROMPT_MAX_CHARS, placeNamePrompt } from '../../src/speech/biasing';

const layer = (name: string) => ({ id: name, name, kind: 'geojson', visible: true });

beforeEach(() => {
  snapshot.value = { layers: [], project: null, live: null };
});

describe('the prompt that biases the recogniser', () => {
  it('names the layers on the map', () => {
    snapshot.value = {
      layers: [layer('River Thames'), layer('Ravensbourne')],
      project: null,
      live: null,
    };
    expect(placeNamePrompt()).toBe('River Thames, Ravensbourne');
  });

  it('puts the project and the live document first', () => {
    snapshot.value = {
      layers: [layer('Depots')],
      project: { id: 'p', name: 'Thames Tideway' },
      live: { documentId: 'd', name: 'Site walk' },
    };
    expect(placeNamePrompt()).toBe('Thames Tideway, Site walk, Depots');
  });

  it('says nothing when the map holds nothing worth biasing towards', () => {
    expect(placeNamePrompt()).toBe('');
  });

  it('drops names that bias nothing', () => {
    snapshot.value = {
      layers: [layer('Layer'), layer('untitled'), layer('12'), layer('Isleworth Ait')],
      project: null,
      live: null,
    };
    expect(placeNamePrompt()).toBe('Isleworth Ait');
  });

  it('names a place once however many layers carry it', () => {
    snapshot.value = {
      layers: [layer('Thames'), layer('thames'), layer('THAMES')],
      project: null,
      live: null,
    };
    expect(placeNamePrompt()).toBe('Thames');
  });

  it('stays inside the prompt whisper will read', () => {
    snapshot.value = {
      layers: Array.from({ length: 200 }, (_, i) => layer(`Barking Creek ${i}`)),
      project: null,
      live: null,
    };
    const prompt = placeNamePrompt();
    expect(prompt.length).toBeLessThanOrEqual(INITIAL_PROMPT_MAX_CHARS);
    // a whole name or none of it, never a name cut in half
    expect(prompt.endsWith(',')).toBe(false);
    expect(prompt).toMatch(/Barking Creek 0/);
  });
});
