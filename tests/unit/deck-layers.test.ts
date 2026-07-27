import { describe, it, expect, beforeEach } from 'vitest';
import { ScatterplotLayer } from '@deck.gl/layers';
import { useDeckLayersStore, composedDeckLayers } from '../../src/hooks/deckLayers';

const layer = (id: string) =>
  new ScatterplotLayer({ id, data: [{ position: [0, 0] }], getRadius: 7 });

describe('deck layer groups', () => {
  beforeEach(() => {
    useDeckLayersStore.setState({ groups: {} });
  });

  it('merges every group instead of clobbering', () => {
    const store = useDeckLayersStore.getState();
    store.setGroup('a', [layer('a1'), layer('a2')]);
    store.setGroup('b', [layer('b1')]);

    const ids = composedDeckLayers(useDeckLayersStore.getState().groups).map((l) => l.id);
    expect(ids.sort()).toEqual(['a1', 'a2', 'b1']);

    // an emptied group drops only its own contribution
    store.setGroup('a', []);
    expect(composedDeckLayers(useDeckLayersStore.getState().groups).map((l) => l.id)).toEqual([
      'b1',
    ]);
  });

  it('hands out fresh instances, since a Layer belongs to one Deck', () => {
    const original = layer('a1');
    useDeckLayersStore.getState().setGroup('a', [original]);

    const first = composedDeckLayers(useDeckLayersStore.getState().groups);
    const second = composedDeckLayers(useDeckLayersStore.getState().groups);

    expect(first[0]).not.toBe(original);
    expect(second[0]).not.toBe(first[0]);
    // ...carrying the same identity and props, so deck still matches them up
    expect(first[0].id).toBe('a1');
    expect(first[0].props.getRadius).toBe(7);
    expect(first[0].props.data).toBe(original.props.data);
  });
});
