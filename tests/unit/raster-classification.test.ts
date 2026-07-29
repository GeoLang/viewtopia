import { describe, it, expect, vi, afterEach } from 'vitest';
import { writeArrayBuffer } from 'geotiff';
import { classifyPixels } from '../../src/plugins/raster-classification/classify';
import { loadCogFromBuffer } from '../../src/raster/loader';

/**
 * The plugin clusters the pixels a COG actually holds, so the test writes a
 * real GeoTIFF, reads it back through the loader, and classifies that.
 */

/** two bands, left half dark, right half bright */
function twoToneTiff(width = 8, height = 8): ArrayBuffer {
  const bandA: number[][] = [];
  const bandB: number[][] = [];
  for (let y = 0; y < height; y++) {
    const rowA: number[] = [];
    const rowB: number[] = [];
    for (let x = 0; x < width; x++) {
      const bright = x >= width / 2;
      rowA.push(bright ? 200 : 20);
      rowB.push(bright ? 210 : 30);
    }
    bandA.push(rowA);
    bandB.push(rowB);
  }
  return writeArrayBuffer([bandA, bandB], {
    width,
    height,
    ModelPixelScale: [0.01, 0.01, 0],
    ModelTiepoint: [0, 0, 0, 10, 50, 0],
    GeographicTypeGeoKey: 4326,
    GeogCitationGeoKey: 'WGS 84',
  }) as ArrayBuffer;
}

afterEach(() => {
  vi.restoreAllMocks();
});

/** k-means seeds centroids at random pixels; pin them to one per group */
function seedCentroids(...fractions: number[]) {
  let i = 0;
  vi.spyOn(Math, 'random').mockImplementation(() => fractions[i++ % fractions.length]);
}

describe('classifyPixels', () => {
  it('separates two clusters of real pixel values', () => {
    const bandA = new Float32Array([10, 12, 11, 200, 205, 202]);
    const bandB = new Float32Array([20, 22, 21, 180, 185, 181]);
    seedCentroids(0.1, 0.9);

    const { labels, classes, classifiedPixels, skippedPixels } = classifyPixels([bandA, bandB], {
      method: 'kmeans',
      numClasses: 2,
    });

    expect(classifiedPixels).toBe(6);
    expect(skippedPixels).toBe(0);
    // the three low pixels share a label, the three high pixels share the other
    expect(labels[0]).toBe(labels[1]);
    expect(labels[1]).toBe(labels[2]);
    expect(labels[3]).toBe(labels[4]);
    expect(labels[4]).toBe(labels[5]);
    expect(labels[0]).not.toBe(labels[3]);

    expect(classes).toHaveLength(2);
    expect(classes.map((c) => c.pixelCount).sort()).toEqual([3, 3]);
    expect(classes.reduce((sum, c) => sum + c.percentage, 0)).toBeCloseTo(100);
    const means = classes.map((c) => Math.round(c.meanValue)).sort((a, b) => a - b);
    expect(means).toEqual([11, 202]);
  });

  it('leaves nodata and non-finite pixels unclassified', () => {
    const band = new Float32Array([10, -9999, 12, Number.NaN, 200, 205]);
    seedCentroids(0.1, 0.9);

    const { labels, classes, classifiedPixels, skippedPixels } = classifyPixels([band], {
      method: 'kmeans',
      numClasses: 2,
      noData: -9999,
    });

    expect(labels[1]).toBe(-1);
    expect(labels[3]).toBe(-1);
    expect(classifiedPixels).toBe(4);
    expect(skippedPixels).toBe(2);
    // the skipped pixels are out of the counts, not folded into a class
    expect(classes.reduce((sum, c) => sum + c.pixelCount, 0)).toBe(4);
  });

  it('clusters a single band on one dimension', () => {
    const band = new Float32Array([1, 2, 3, 90, 91, 92]);
    seedCentroids(0.1, 0.9);

    const { labels, classes } = classifyPixels([band], { method: 'isodata', numClasses: 2 });

    expect(labels[0]).toBe(labels[2]);
    expect(labels[0]).not.toBe(labels[5]);
    expect(classes).toHaveLength(2);
  });
});

describe('classification of a loaded GeoTIFF', () => {
  it('classifies the pixels the loader read from the file', async () => {
    const loaded = await loadCogFromBuffer(twoToneTiff(), { maxDimension: 512 });

    expect(loaded.metadata.width).toBe(8);
    expect(loaded.metadata.height).toBe(8);
    expect(loaded.metadata.bands).toBe(2);

    seedCentroids(0.1, 0.9);
    const { labels, classes, classifiedPixels } = classifyPixels(loaded.bands, {
      method: 'kmeans',
      numClasses: 2,
    });

    expect(classifiedPixels).toBe(64);
    // the dark left half and the bright right half end up in different classes
    expect(labels[0]).toBe(labels[3]);
    expect(labels[4]).toBe(labels[7]);
    expect(labels[0]).not.toBe(labels[4]);
    expect(classes.map((c) => c.pixelCount).sort()).toEqual([32, 32]);
  });

  it('downsamples a raster above the read cap', async () => {
    const loaded = await loadCogFromBuffer(twoToneTiff(64, 64), { maxDimension: 16 });

    expect(loaded.metadata.width).toBe(16);
    expect(loaded.metadata.height).toBe(16);
    expect(loaded.bands[0].length).toBe(16 * 16);
  });
});
