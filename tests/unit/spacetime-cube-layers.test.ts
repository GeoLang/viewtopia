import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSpaceTimeStore } from '../../src/features/spacetime/store';
import { useDeckLayersStore } from '../../src/hooks/deckLayers';
import { useSpaceTimeDeckLayers } from '../../src/hooks/useSpaceTimeDeckLayers';
import { useSpaceTimeCubeCamera, CUBE_VIEW_PITCH } from '../../src/hooks/useSpaceTimeCubeCamera';
import type { Entity, SpaceTimeEvent, Track } from '../../src/features/spacetime/types';

const ENTITY_ID = 'entity-1';

function entity(): Entity {
  return {
    id: ENTITY_ID,
    name: 'Alice',
    kind: 'person',
    aliases: [],
    color: '#a78bfa',
    properties: {},
    createdAt: 0,
    updatedAt: 0,
  };
}

function events(): SpaceTimeEvent[] {
  return [0, 1000, 2000, 3000, 4000].map((timestamp, i) => ({
    id: `e${timestamp}`,
    entityId: ENTITY_ID,
    timestamp,
    lng: -122.4 + i * 0.01,
    lat: 37.7 + i * 0.01,
  }));
}

function loadTrack(): Track {
  const track: Track = { id: 'track-1', entityId: ENTITY_ID, events: events() };
  useSpaceTimeStore.setState({
    entities: new Map([[ENTITY_ID, entity()]]),
    tracks: [track],
    timeRange: { min: 0, max: 4000 },
    currentTime: 4000,
    trailDuration: 0,
    cubeView: false,
  });
  return track;
}

function spacetimeLayers() {
  return useDeckLayersStore.getState().groups.spacetime ?? [];
}

function layerIds() {
  return spacetimeLayers().map((l) => l.id);
}

function layerById(id: string) {
  const layer = spacetimeLayers().find((l) => l.id === id);
  if (!layer) throw new Error(`no ${id} layer`);
  return layer;
}

describe('spacetime deck layers', () => {
  beforeEach(() => {
    useDeckLayersStore.setState({ groups: {} });
    loadTrack();
  });

  it('draws no cube furniture until cube view is on', () => {
    renderHook(() => useSpaceTimeDeckLayers());
    expect(layerIds()).not.toContain('spacetime-sweep-plane');
    expect(layerIds()).not.toContain('spacetime-shadows');
    expect(layerIds()).toContain('spacetime-paths');
  });

  it('adds the sweep plane and ground shadows in cube view', () => {
    useSpaceTimeStore.setState({ cubeView: true });
    renderHook(() => useSpaceTimeDeckLayers());
    expect(layerIds()).toContain('spacetime-sweep-plane');
    expect(layerIds()).toContain('spacetime-shadows');
  });

  it('flattens the ground shadow to elevation zero', () => {
    useSpaceTimeStore.setState({ cubeView: true });
    renderHook(() => useSpaceTimeDeckLayers());
    const shadows = layerById('spacetime-shadows');
    const path = (shadows.props.data as { path: [number, number, number][] }[])[0].path;
    expect(path.every((point) => point[2] === 0)).toBe(true);
    expect(path).toHaveLength(5);
  });

  it('puts the sweep plane at the playhead elevation', () => {
    useSpaceTimeStore.setState({ cubeView: true, currentTime: 2000 });
    renderHook(() => useSpaceTimeDeckLayers());
    const plane = layerById('spacetime-sweep-plane');
    const polygon = (plane.props.data as { polygon: [number, number, number][] }[])[0].polygon;
    expect(polygon[0][2]).toBe(25000);
  });

  it('clips paths and points to the trail window', () => {
    useSpaceTimeStore.setState({ currentTime: 3000, trailDuration: 1000 });
    renderHook(() => useSpaceTimeDeckLayers());
    const paths = layerById('spacetime-paths');
    const path = (paths.props.data as { path: [number, number, number][] }[])[0].path;
    expect(path).toHaveLength(2);

    const points = layerById('spacetime-points');
    expect((points.props.data as unknown[]).length).toBe(2);
  });

  it('keeps the playhead marker even when the window excludes its event', () => {
    useSpaceTimeStore.setState({ currentTime: 0, trailDuration: 1 });
    renderHook(() => useSpaceTimeDeckLayers());
    expect(layerIds()).toContain('spacetime-current');
  });
});

describe('cube camera', () => {
  it('pitches on entry and restores the pitch on exit', () => {
    const eased: { pitch?: number }[] = [];
    const map = {
      getPitch: () => 17,
      easeTo: (options: { pitch?: number }) => eased.push(options),
    };
    const mapRef = { current: map as never };

    useSpaceTimeStore.setState({ cubeView: false });
    const { rerender } = renderHook(() => useSpaceTimeCubeCamera(mapRef));
    expect(eased).toHaveLength(0);

    useSpaceTimeStore.setState({ cubeView: true });
    rerender();
    expect(eased.at(-1)?.pitch).toBe(CUBE_VIEW_PITCH);

    useSpaceTimeStore.setState({ cubeView: false });
    rerender();
    expect(eased.at(-1)?.pitch).toBe(17);
  });
});
