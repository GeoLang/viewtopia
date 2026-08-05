/**
 * Runs the real vendored wasm module (initSync over the file bytes), so these
 * tests break when the artifact and the wrappers drift apart. Every wrapper
 * projects to meters and back, so the assertions are in degrees but the
 * parameters are metric.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { initSync } from '../../src/toolbox/wasm/topoi_wasm';
import { bboxOf, frameFor, projectFc, unprojectFc } from '../../src/toolbox/projection';
import { collect, explode } from '../../src/toolbox/multipart';
import {
  topoiBuffer,
  topoiCentroid,
  topoiClipRect,
  topoiConvexHull,
  topoiDissolve,
  topoiGrid,
  topoiMakeValid,
  topoiOverlay,
  topoiSimplify,
  topoiSpatialJoin,
  topoiValidate,
  topoiVoronoi,
} from '../../src/toolbox/topoi';

beforeAll(() => {
  // vitest rewrites import.meta.url under jsdom, so resolve from the repo root
  const wasmPath = join(process.cwd(), 'src/toolbox/wasm/topoi_wasm_bg.wasm');
  initSync({ module: readFileSync(wasmPath) });
});

const M_PER_DEG_LAT = 110540;
const M_PER_DEG_LON_EQUATOR = 111320;

function fc(features: GeoJSON.Feature[]): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features };
}

function point(x: number, y: number, properties: GeoJSON.GeoJsonProperties = {}): GeoJSON.Feature {
  return { type: 'Feature', properties, geometry: { type: 'Point', coordinates: [x, y] } };
}

function polygon(
  ring: [number, number][],
  properties: GeoJSON.GeoJsonProperties = {},
): GeoJSON.Feature {
  return { type: 'Feature', properties, geometry: { type: 'Polygon', coordinates: [ring] } };
}

function box(
  w: number,
  s: number,
  e: number,
  n: number,
  properties: GeoJSON.GeoJsonProperties = {},
): GeoJSON.Feature {
  return polygon(
    [
      [w, s],
      [e, s],
      [e, n],
      [w, n],
      [w, s],
    ],
    properties,
  );
}

/** every coordinate pair of a collection, in document order */
function allCoords(collection: GeoJSON.FeatureCollection): number[][] {
  const out: number[][] = [];
  const walk = (c: unknown) => {
    const arr = c as unknown[];
    if (typeof arr[0] === 'number') out.push(arr as number[]);
    else for (const inner of arr) walk(inner);
  };
  const geom = (g: GeoJSON.Geometry) => {
    if (g.type === 'GeometryCollection') g.geometries.forEach(geom);
    else walk(g.coordinates);
  };
  for (const f of collection.features) if (f.geometry) geom(f.geometry);
  return out;
}

function extent(collection: GeoJSON.FeatureCollection) {
  const [minX, minY, maxX, maxY] = bboxOf([collection]);
  return { lon: maxX - minX, lat: maxY - minY, minX, minY, maxX, maxY };
}

describe('the metric frame', () => {
  const mixed = fc([
    point(7.1, 45.2, { a: 1 }),
    {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: [
          [7, 45],
          [7.3, 45.4],
        ],
      },
    },
    {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [7, 45],
            [7.4, 45],
            [7.4, 45.4],
            [7, 45.4],
            [7, 45],
          ],
          [
            [7.1, 45.1],
            [7.2, 45.1],
            [7.2, 45.2],
            [7.1, 45.1],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'GeometryCollection',
        geometries: [
          { type: 'Point', coordinates: [7.25, 45.25] },
          {
            type: 'MultiPolygon',
            coordinates: [
              [
                [
                  [7, 45],
                  [7.1, 45],
                  [7.1, 45.1],
                  [7, 45],
                ],
              ],
            ],
          },
        ],
      },
    },
  ]);

  it('projects and unprojects back to the same degrees', () => {
    const frame = frameFor(bboxOf([mixed]));
    const round = unprojectFc(projectFc(mixed, frame), frame);

    const before = allCoords(mixed);
    const after = allCoords(round);
    expect(after).toHaveLength(before.length);
    for (let i = 0; i < before.length; i++) {
      expect(Math.abs(after[i][0] - before[i][0])).toBeLessThan(1e-9);
      expect(Math.abs(after[i][1] - before[i][1])).toBeLessThan(1e-9);
    }
    // the frame is centred on the inputs, so the origin lands inside them
    expect(frame.lon0).toBeCloseTo(7.2, 6);
    expect(frame.lat0).toBeCloseTo(45.2, 6);
  });

  it('keeps a third ordinate untouched', () => {
    const withZ = fc([
      { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [7, 45, 321] } },
    ]);
    const frame = frameFor(bboxOf([withZ]));
    expect(allCoords(unprojectFc(projectFc(withZ, frame), frame))[0][2]).toBe(321);
  });

  it('makes a buffer distance mean meters, not degrees', () => {
    const buffered = topoiBuffer(fc([point(7, 45)]), 1000, 16);
    const { lon, lat } = extent(buffered);

    // a 1000 m radius spans 2000 m north to south whatever the latitude
    expect(lat * M_PER_DEG_LAT).toBeCloseTo(2000, 6);
    // and the same 2000 m is more degrees of longitude than of latitude, by the
    // ratio of the two scales (~1/cos 45)
    const cos45 = Math.cos(Math.PI / 4);
    expect(lon / lat).toBeCloseTo(M_PER_DEG_LAT / (M_PER_DEG_LON_EQUATOR * cos45), 6);
    expect(lon / lat).toBeCloseTo(1 / cos45, 1);
    expect(lon * M_PER_DEG_LON_EQUATOR * cos45).toBeCloseTo(2000, 0);
  });
});

describe('geometry tools', () => {
  it('buffer keeps properties and a negative distance erodes', () => {
    const grown = topoiBuffer(fc([box(7, 45, 7.1, 45.1, { name: 'plot', id: 3 })]), 500, 8);
    expect(grown.features).toHaveLength(1);
    expect(grown.features[0].properties).toEqual({ name: 'plot', id: 3 });
    const before = extent(fc([box(7, 45, 7.1, 45.1)]));
    const after = extent(grown);
    expect(after.minX).toBeLessThan(before.minX);
    expect(after.maxY).toBeGreaterThan(before.maxY);

    const eroded = topoiBuffer(fc([box(7, 45, 7.1, 45.1, { name: 'plot' })]), -1000, 8);
    expect(eroded.features).toHaveLength(1);
    expect(eroded.features[0].properties).toEqual({ name: 'plot' });
    expect(extent(eroded).minX).toBeGreaterThan(before.minX);

    // eroding past its own width leaves nothing, and the feature is dropped
    expect(topoiBuffer(fc([box(7, 45, 7.001, 45.001)]), -5000, 8).features).toHaveLength(0);
  });

  it('centroid replaces each geometry with its middle, properties intact', () => {
    const out = topoiCentroid(fc([box(7, 45, 7.1, 45.1, { k: 'z' })]));
    expect(out.features[0].geometry.type).toBe('Point');
    expect(out.features[0].properties).toEqual({ k: 'z' });
    const [x, y] = (out.features[0].geometry as GeoJSON.Point).coordinates;
    expect(x).toBeCloseTo(7.05, 9);
    expect(y).toBeCloseTo(45.05, 9);
  });

  it('convex hull wraps every coordinate in the collection into one polygon', () => {
    const out = topoiConvexHull(fc([point(7, 45), point(7.1, 45), point(7.05, 45.1), point(7.05, 45.02)]));
    expect(out.features).toHaveLength(1);
    const ring = (out.features[0].geometry as GeoJSON.Polygon).coordinates[0];
    // the interior point is not a vertex of the hull
    expect(ring).toHaveLength(4);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });

  it('simplify drops vertices inside the tolerance and keeps the corners', () => {
    const nearlyStraight = polygon(
      [
        [7, 45],
        [7.05, 45.000001],
        [7.1, 45],
        [7.1, 45.1],
        [7, 45.1],
        [7, 45],
      ],
      { k: 1 },
    );
    const out = topoiSimplify(fc([nearlyStraight]), 50);
    const ring = (out.features[0].geometry as GeoJSON.Polygon).coordinates[0];
    expect(ring).toHaveLength(5);
    expect(out.features[0].properties).toEqual({ k: 1 });
  });

  it('explode splits multi-part features and copies their properties', () => {
    const source = fc([
      {
        type: 'Feature',
        properties: { name: 'islands' },
        geometry: {
          type: 'MultiPolygon',
          coordinates: [
            [
              [
                [7, 45],
                [7.1, 45],
                [7.1, 45.1],
                [7, 45],
              ],
            ],
            [
              [
                [8, 45],
                [8.1, 45],
                [8.1, 45.1],
                [8, 45],
              ],
            ],
          ],
        },
      },
      point(9, 45, { name: 'single' }),
    ]);
    const out = explode(source);
    expect(out.features).toHaveLength(3);
    expect(out.features.map((f) => f.geometry?.type)).toEqual(['Polygon', 'Polygon', 'Point']);
    expect(out.features[0].properties).toEqual({ name: 'islands' });
    expect(out.features[1].properties).toEqual({ name: 'islands' });
  });

  it('collect merges one geometry type into a single multi-part feature', () => {
    const out = collect(fc([point(7, 45, { first: true }), point(8, 46, { first: false })]));
    expect(out.features).toHaveLength(1);
    const geometry = out.features[0].geometry as GeoJSON.MultiPoint;
    expect(geometry.type).toBe('MultiPoint');
    expect(geometry.coordinates).toEqual([
      [7, 45],
      [8, 46],
    ]);
    expect(out.features[0].properties).toEqual({ first: true });

    expect(() => collect(fc([point(7, 45), box(7, 45, 8, 46)]))).toThrow(
      /one geometry type, got Point, Polygon/,
    );
  });
});

describe('overlay tools', () => {
  const a = fc([box(7, 45, 7.2, 45.2, { left: 'A' })]);
  const b = fc([box(7.1, 45.1, 7.3, 45.3, { right: 'B' })]);

  it('intersection returns the shared part carrying both sets of properties', () => {
    const out = topoiOverlay(a, b, 'intersection');
    expect(out.features).toHaveLength(1);
    expect(out.features[0].properties).toEqual({ left: 'A', right: 'B' });
    const { minX, minY, maxX, maxY } = extent(out);
    expect(minX).toBeCloseTo(7.1, 6);
    expect(minY).toBeCloseTo(45.1, 6);
    expect(maxX).toBeCloseTo(7.2, 6);
    expect(maxY).toBeCloseTo(45.2, 6);
  });

  it('difference keeps only the first layer and its properties', () => {
    const out = topoiOverlay(a, b, 'difference');
    expect(out.features).toHaveLength(1);
    expect(out.features[0].properties).toEqual({ left: 'A' });
    // the corner b covered is gone, so the remainder is no longer a rectangle
    const ring = (out.features[0].geometry as GeoJSON.Polygon).coordinates[0];
    expect(ring.length).toBeGreaterThan(5);
  });

  it('clip cuts a line down to the polygons of the second layer', () => {
    const line = fc([
      {
        type: 'Feature',
        properties: { id: 'l' },
        geometry: {
          type: 'LineString',
          coordinates: [
            [6.9, 45.1],
            [7.3, 45.1],
          ],
        },
      },
    ]);
    const out = topoiOverlay(line, a, 'clip');
    expect(out.features).toHaveLength(1);
    expect(out.features[0].properties).toEqual({ id: 'l' });
    const { minX, maxX } = extent(out);
    expect(minX).toBeCloseTo(7, 6);
    expect(maxX).toBeCloseTo(7.2, 6);
  });

  it('clipping to an extent splits a concave polygon into two parts', () => {
    // a U opening east: the right half of the extent catches the two arms only
    const u = polygon([
      [0, 0],
      [3, 0],
      [3, 1],
      [1, 1],
      [1, 2],
      [3, 2],
      [3, 3],
      [0, 3],
      [0, 0],
    ]);
    const out = topoiClipRect(fc([u]), [2, -1, 4, 4]);

    expect(out.features).toHaveLength(1);
    const geometry = out.features[0].geometry as GeoJSON.MultiPolygon;
    expect(geometry.type).toBe('MultiPolygon');
    expect(geometry.coordinates).toHaveLength(2);
    for (const [ring] of geometry.coordinates) {
      for (const [x] of ring) expect(x).toBeGreaterThanOrEqual(2 - 1e-6);
    }
  });
});

describe('aggregate tools', () => {
  const parcels = fc([
    box(7, 45, 7.1, 45.1, { region: 'x' }),
    box(7.1, 45, 7.2, 45.1, { region: 'x' }),
    box(7.3, 45, 7.4, 45.1, { region: 'y' }),
  ]);

  it('dissolve groups by a field and unions each group', () => {
    const out = topoiDissolve(parcels, 'region');
    expect(out.features).toHaveLength(2);
    expect(out.features.map((f) => f.properties?.region).sort()).toEqual(['x', 'y']);

    const x = out.features.find((f) => f.properties?.region === 'x');
    if (!x) throw new Error('no group x');
    // the two touching boxes merged, so the group spans both
    const { minX, maxX } = extent(fc([x]));
    expect(minX).toBeCloseTo(7, 6);
    expect(maxX).toBeCloseTo(7.2, 6);
    expect((x.geometry as GeoJSON.Polygon).coordinates[0]).toHaveLength(5);
  });

  it('dissolve without a field merges everything into one feature', () => {
    const out = topoiDissolve(fc([parcels.features[0], parcels.features[1]]), null);
    expect(out.features).toHaveLength(1);
    expect(out.features[0].properties).toEqual({});
  });

  it('dissolve refuses features that are not polygons', () => {
    expect(() => topoiDissolve(fc([point(7, 45)]), null)).toThrow();
  });
});

describe('generate tools', () => {
  it('voronoi returns one cell per point, each keeping its properties', () => {
    const sites = fc([point(7.02, 45.02, { site: 'a' }), point(7.08, 45.08, { site: 'b' })]);
    const out = topoiVoronoi(sites, [7, 45, 7.1, 45.1]);

    expect(out.features).toHaveLength(2);
    expect(out.features.map((f) => f.properties?.site).sort()).toEqual(['a', 'b']);
    for (const f of out.features) expect(f.geometry.type).toBe('Polygon');
    // cells stay inside the envelope
    const { minX, minY, maxX, maxY } = extent(out);
    expect(minX).toBeGreaterThanOrEqual(7 - 1e-6);
    expect(minY).toBeGreaterThanOrEqual(45 - 1e-6);
    expect(maxX).toBeLessThanOrEqual(7.1 + 1e-6);
    expect(maxY).toBeLessThanOrEqual(45.1 + 1e-6);
  });

  it('voronoi refuses a non-point input', () => {
    expect(() => topoiVoronoi(fc([box(7, 45, 7.1, 45.1)]), [7, 45, 7.1, 45.1])).toThrow();
  });

  it('grids cover the extent with metric cells and an id per cell', () => {
    // 0.01 degrees is 787 m of longitude at 45N but 1105 m of latitude, so a
    // 200 m cell needs 4 columns and 6 rows
    const square = topoiGrid([7, 45, 7.01, 45.01], 200, 'square');
    expect(square.features).toHaveLength(24);
    expect(square.features.map((f) => f.properties?.cell_id)).toEqual(
      Array.from({ length: 24 }, (_, i) => i),
    );
    const cell = extent(fc([square.features[0]]));
    expect(cell.lon * M_PER_DEG_LON_EQUATOR * Math.cos((45.005 * Math.PI) / 180)).toBeCloseTo(200, 3);
    expect(cell.lat * M_PER_DEG_LAT).toBeCloseTo(200, 3);

    // hexagons of the same size tile the box in fewer, wider cells
    const hex = topoiGrid([7, 45, 7.01, 45.01], 200, 'hex');
    expect(hex.features).toHaveLength(15);
    for (const f of hex.features) {
      expect((f.geometry as GeoJSON.Polygon).coordinates[0]).toHaveLength(7);
      expect(typeof f.properties?.cell_id).toBe('number');
    }
  });
});

describe('the spatial join', () => {
  const zones = fc([box(7, 45, 7.1, 45.1, { zone: 'north' })]);

  it('intersects copies the source properties onto the features it covers', () => {
    const targets = fc([point(7.05, 45.05, { id: 1 }), point(9, 45, { id: 2 })]);
    const out = topoiSpatialJoin(targets, zones, 'intersects', 'src_');

    expect(out.features.map((f) => f.properties)).toEqual([
      { id: 1, zone: 'north' },
      { id: 2 },
    ]);
  });

  it('the prefix only kicks in where the keys collide', () => {
    const targets = fc([point(7.05, 45.05, { zone: 'mine' })]);
    expect(topoiSpatialJoin(targets, zones, 'intersects', 'src_').features[0].properties).toEqual({
      zone: 'mine',
      src_zone: 'north',
    });
  });

  it('nearest picks the closest source by centroid distance', () => {
    const targets = fc([point(7.05, 45.05, { id: 1 })]);
    const sources = fc([point(7.06, 45.05, { zone: 'near' }), point(8, 45, { zone: 'far' })]);
    expect(topoiSpatialJoin(targets, sources, 'nearest', 's_').features[0].properties).toEqual({
      id: 1,
      zone: 'near',
    });
  });
});

describe('quality tools', () => {
  const bowtie = fc([
    polygon([
      [7, 45],
      [7.01, 45.01],
      [7, 45.01],
      [7.01, 45],
      [7, 45],
    ]),
  ]);

  it('validate names the issue per feature', () => {
    const report = topoiValidate(bowtie);
    expect(report.valid).toBe(false);
    expect(report.invalid).toHaveLength(1);
    expect(report.invalid[0].feature).toBe(0);
    expect(report.invalid[0].issues[0].kind).toBe('self_intersection');
    expect(report.invalid[0].issues[0].message).toMatch(/crosses itself/);

    expect(topoiValidate(fc([box(7, 45, 7.01, 45.01)]))).toEqual({ valid: true, invalid: [] });
  });

  it('make valid repairs the bowtie into two triangles that validate clean', () => {
    const fixed = topoiMakeValid(bowtie);
    expect(fixed.features).toHaveLength(1);
    const geometry = fixed.features[0].geometry as GeoJSON.MultiPolygon;
    expect(geometry.type).toBe('MultiPolygon');
    expect(geometry.coordinates).toHaveLength(2);
    expect(topoiValidate(fixed).valid).toBe(true);
  });

  it('make valid fails loudly when the geometry has nothing left', () => {
    const collapsed = fc([
      polygon([
        [7, 45],
        [7, 45],
        [7, 45],
        [7, 45],
      ]),
    ]);
    expect(() => topoiMakeValid(collapsed)).toThrow(/no area left/);
  });
});
