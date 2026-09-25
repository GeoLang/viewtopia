import { beforeEach, describe, expect, it } from 'vitest';
import {
  getSharedCamera,
  setSharedCamera,
  subscribeSharedCamera,
  type SharedCamera,
} from '../../src/hooks/sharedCamera';

const DEFAULT_CAMERA: SharedCamera = {
  longitude: 0,
  latitude: 20,
  zoom: 2,
  pitch: 0,
  bearing: 0,
};

const ICELAND: SharedCamera = {
  longitude: -21.9,
  latitude: 64.14,
  zoom: 6,
  pitch: 0,
  bearing: 0,
};

beforeEach(() => {
  // one camera for the whole process
  setSharedCamera({ longitude: 12, latitude: 34, zoom: 5, pitch: 10, bearing: 20 });
  setSharedCamera(DEFAULT_CAMERA);
});

describe('shared camera', () => {
  it('does not notify when a resize republishes the camera already shared', () => {
    let local = { ...ICELAND };
    const seen: SharedCamera[] = [];
    const unsubscribe = subscribeSharedCamera((camera) => {
      seen.push(camera);
      local = { ...camera };
    });

    // latitude float from the nightly failure
    setSharedCamera({
      longitude: 0,
      latitude: 20.000000000000004,
      zoom: 2,
      pitch: 0,
      bearing: 0,
    });

    expect(seen).toEqual([]);
    expect(local).toEqual(ICELAND);
    expect(getSharedCamera()).toEqual(DEFAULT_CAMERA);
    unsubscribe();
  });

  it('notifies when the camera actually moves', () => {
    const seen: number[] = [];
    const unsubscribe = subscribeSharedCamera((camera) => seen.push(camera.longitude));

    setSharedCamera(ICELAND);

    expect(seen).toEqual([ICELAND.longitude]);
    expect(getSharedCamera()).toEqual(ICELAND);
    unsubscribe();
  });
});
