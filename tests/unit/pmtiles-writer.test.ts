import { describe, it, expect } from 'vitest';
import { PMTiles, TileType, type RangeResponse, type Source } from 'pmtiles';
import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import { geojsonToPmtiles } from '../../src/features/pmtiles/writer';

/**
 * The writer is proven by reading its archives back with the same pmtiles
 * library the map renders through, not by asserting on bytes.
 */

class BytesSource implements Source {
  constructor(private bytes: Uint8Array) {}
  getKey() {
    return 'in-memory';
  }
  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    return { data: this.bytes.slice(offset, offset + length).buffer as ArrayBuffer };
  }
}

const read = (bytes: Uint8Array) => new PMTiles(new BytesSource(bytes));

const venice: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { name: 'lagoon', risk: 3, flooded: true },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [12.2, 45.3],
            [12.5, 45.3],
            [12.5, 45.5],
            [12.2, 45.5],
            [12.2, 45.3],
          ],
        ],
      },
    },
  ],
};

/** Web-mercator tile containing a lon/lat at zoom z. */
function tileAt(lon: number, lat: number, z: number): [number, number] {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const rad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n);
  return [x, y];
}

async function decodeTile(archive: PMTiles, z: number, x: number, y: number) {
  const tile = await archive.getZxy(z, x, y);
  if (!tile) throw new Error(`tile ${z}/${x}/${y} missing`);
  return new VectorTile(new PbfReader(new Uint8Array(tile.data)));
}

describe('geojsonToPmtiles', () => {
  it('writes a header the reader accepts, with the data bounds', async () => {
    const archive = read(geojsonToPmtiles(venice, 'risk', { maxZoom: 4 }));
    const header = await archive.getHeader();

    expect(header.specVersion).toBe(3);
    expect(header.tileType).toBe(TileType.Mvt);
    expect(header.minZoom).toBe(0);
    expect(header.maxZoom).toBe(4);
    expect(header.clustered).toBe(true);
    expect(header.minLon).toBeCloseTo(12.2, 5);
    expect(header.maxLat).toBeCloseTo(45.5, 5);
  });

  it('names the layer and its field types in vector_layers', async () => {
    const archive = read(geojsonToPmtiles(venice, 'risk', { maxZoom: 2 }));
    const metadata = (await archive.getMetadata()) as {
      vector_layers: { id: string; fields: Record<string, string>; maxzoom: number }[];
    };

    expect(metadata.vector_layers).toHaveLength(1);
    expect(metadata.vector_layers[0].id).toBe('risk');
    expect(metadata.vector_layers[0].maxzoom).toBe(2);
    expect(metadata.vector_layers[0].fields).toEqual({
      name: 'String',
      risk: 'Number',
      flooded: 'Boolean',
    });
  });

  it('serves a decodable MVT with the feature and its properties at every zoom', async () => {
    const archive = read(geojsonToPmtiles(venice, 'risk', { maxZoom: 4 }));

    for (const z of [0, 4]) {
      const [x, y] = tileAt(12.35, 45.4, z);
      const tile = await decodeTile(archive, z, x, y);
      const layer = tile.layers.risk;
      expect(layer.length).toBe(1);
      const feature = layer.feature(0);
      expect(feature.properties).toMatchObject({ name: 'lagoon', risk: 3, flooded: true });
      // 3 is the MVT polygon type
      expect(feature.type).toBe(3);
    }
  });

  it('returns nothing for a tile outside the data', async () => {
    const archive = read(geojsonToPmtiles(venice, 'risk', { maxZoom: 4 }));
    // venice is in the north-east quadrant, so the far south-west is empty
    expect(await archive.getZxy(4, 0, 15)).toBeUndefined();
  });

  it('spills into leaf directories when the root would not fit, and still resolves tiles', async () => {
    // points spread across the world make many distinct tiles
    const points: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: Array.from({ length: 200 }, (_, i) => ({
        type: 'Feature' as const,
        properties: { i },
        geometry: {
          type: 'Point' as const,
          coordinates: [-170 + (i % 20) * 17, -80 + Math.floor(i / 20) * 16],
        },
      })),
    };
    const bytes = geojsonToPmtiles(points, 'pts', { maxZoom: 3, rootByteLimit: 64, leafEntries: 16 });
    const archive = read(bytes);
    const header = await archive.getHeader();
    expect(header.leafDirectoryLength).toBeGreaterThan(0);

    const [x, y] = tileAt(-170, -80, 3);
    const tile = await decodeTile(archive, 3, x, y);
    expect(tile.layers.pts.length).toBeGreaterThan(0);
  });

  it('refuses a layer with no features', () => {
    expect(() =>
      geojsonToPmtiles({ type: 'FeatureCollection', features: [] }, 'empty'),
    ).toThrow(/no features/);
  });
});
