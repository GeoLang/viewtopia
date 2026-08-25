import { describe, it, expect, beforeEach } from 'vitest';
import { useDrawStore } from '../../src/store/draw';

const SQUARE: GeoJSON.Geometry = {
  type: 'Polygon',
  coordinates: [[[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]]],
};

function edit(geometry: GeoJSON.Geometry): void {
  useDrawStore.getState().startVertexEdit(geometry);
}

function edited(): GeoJSON.Geometry {
  const { vertexEdit } = useDrawStore.getState();
  if (!vertexEdit) throw new Error('no vertex edit is open');
  return vertexEdit.geometry;
}

beforeEach(() => {
  useDrawStore.setState({ mode: null, features: [], pending: [], vertexEdit: null });
});

describe('dragging one vertex', () => {
  it('moves the vertex the path names', () => {
    edit(SQUARE);
    useDrawStore.getState().moveVertex([0, 1], [9, 8]);
    expect(edited()).toEqual({
      type: 'Polygon',
      coordinates: [[[0, 0], [9, 8], [4, 4], [0, 4], [0, 0]]],
    });
  });

  it('moves a ring\'s closing vertex with its first', () => {
    edit(SQUARE);
    useDrawStore.getState().moveVertex([0, 0], [-1, -2]);
    expect(edited()).toEqual({
      type: 'Polygon',
      coordinates: [[[-1, -2], [4, 0], [4, 4], [0, 4], [-1, -2]]],
    });
  });

  it('moves the closing vertex and its first together', () => {
    edit(SQUARE);
    useDrawStore.getState().moveVertex([0, 4], [-1, -2]);
    expect(edited()).toEqual({
      type: 'Polygon',
      coordinates: [[[-1, -2], [4, 0], [4, 4], [0, 4], [-1, -2]]],
    });
  });

  it('leaves an open line\'s other end alone', () => {
    edit({ type: 'LineString', coordinates: [[0, 0], [1, 1], [0, 0]] });
    useDrawStore.getState().moveVertex([0], [5, 5]);
    expect(edited()).toEqual({ type: 'LineString', coordinates: [[5, 5], [1, 1], [0, 0]] });
  });

  it('reaches into the ring of a multipolygon', () => {
    edit({
      type: 'MultiPolygon',
      coordinates: [
        [[[0, 0], [1, 0], [1, 1], [0, 0]]],
        [[[5, 5], [6, 5], [6, 6], [5, 5]]],
      ],
    });
    useDrawStore.getState().moveVertex([1, 0, 1], [7, 7]);
    expect(edited()).toEqual({
      type: 'MultiPolygon',
      coordinates: [
        [[[0, 0], [1, 0], [1, 1], [0, 0]]],
        [[[5, 5], [7, 7], [6, 6], [5, 5]]],
      ],
    });
  });

  it('reaches into one member of a collection', () => {
    edit({
      type: 'GeometryCollection',
      geometries: [
        { type: 'Point', coordinates: [1, 2] },
        { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
      ],
    });
    useDrawStore.getState().moveVertex([1, 1], [3, 4]);
    expect(edited()).toEqual({
      type: 'GeometryCollection',
      geometries: [
        { type: 'Point', coordinates: [1, 2] },
        { type: 'LineString', coordinates: [[0, 0], [3, 4]] },
      ],
    });
  });

  it('moves a bare point', () => {
    edit({ type: 'Point', coordinates: [1, 2] });
    useDrawStore.getState().moveVertex([], [3, 4]);
    expect(edited()).toEqual({ type: 'Point', coordinates: [3, 4] });
  });

  it('keeps the elevation the moved position had', () => {
    edit({ type: 'LineString', coordinates: [[0, 0, 10], [1, 1, 20]] });
    useDrawStore.getState().moveVertex([1], [3, 4]);
    expect(edited()).toEqual({ type: 'LineString', coordinates: [[0, 0, 10], [3, 4, 20]] });
  });

  it('leaves the geometry alone when the path names no vertex', () => {
    edit(SQUARE);
    useDrawStore.getState().moveVertex([0, 9], [3, 4]);
    expect(edited()).toEqual(SQUARE);
  });

  it('replaces the geometry rather than editing it in place', () => {
    edit(SQUARE);
    useDrawStore.getState().moveVertex([0, 1], [9, 8]);
    expect(SQUARE.type === 'Polygon' && SQUARE.coordinates[0][1]).toEqual([4, 0]);
    expect(edited()).not.toBe(SQUARE);
  });

  it('gives up the vertex edit when a draw mode is set, and the reverse', () => {
    edit(SQUARE);
    useDrawStore.getState().setMode('polygon');
    expect(useDrawStore.getState().vertexEdit).toBeNull();

    useDrawStore.getState().addPendingPoint(1, 1);
    edit(SQUARE);
    expect(useDrawStore.getState().mode).toBeNull();
    expect(useDrawStore.getState().pending).toEqual([]);

    useDrawStore.getState().stopVertexEdit();
    expect(useDrawStore.getState().vertexEdit).toBeNull();
  });
});
