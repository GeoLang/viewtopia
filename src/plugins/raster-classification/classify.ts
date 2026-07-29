/**
 * Unsupervised clustering over raster bands.
 *
 * Pixels that are noData or non-finite in any band are left unclassified
 * (label -1) rather than clustered as if they held a value, so a COG with a
 * nodata border does not get a class made of its border.
 */

export type ClassifyMethod = 'kmeans' | 'isodata';

export interface ClassStats {
  classId: number;
  color: string;
  pixelCount: number;
  /** share of the classified pixels, not of the whole raster */
  percentage: number;
  /** mean of band 1 over the class */
  meanValue: number;
}

export interface ClassifyOptions {
  method: ClassifyMethod;
  numClasses: number;
  /** value marking empty pixels in the source raster */
  noData?: number | null;
  maxIterations?: number;
  convergenceThreshold?: number;
}

export interface ClassifyResult {
  /** one label per pixel, -1 where a band had no data */
  labels: Int16Array;
  classes: ClassStats[];
  classifiedPixels: number;
  skippedPixels: number;
}

export const CLASS_COLORS = [
  '#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6',
  '#1abc9c', '#e67e22', '#34495e', '#16a085', '#c0392b',
  '#2980b9', '#27ae60', '#d35400', '#8e44ad', '#f1c40f',
  '#7f8c8d', '#2c3e50', '#95a5a6', '#d63031', '#00b894',
];

// Simple k-means clustering on raster bands
function kMeansClustering(data: Float64Array[], k: number, maxIter = 50, threshold = 0.001): Uint8Array {
  const numPixels = data[0].length;
  const numBands = data.length;
  const labels = new Uint8Array(numPixels);

  // Initialize centroids randomly
  const centroids: number[][] = [];
  for (let i = 0; i < k; i++) {
    const idx = Math.floor(Math.random() * numPixels);
    centroids.push(data.map((band) => band[idx]));
  }

  for (let iter = 0; iter < maxIter; iter++) {
    let changed = 0;

    // Assignment step
    for (let p = 0; p < numPixels; p++) {
      let minDist = Infinity;
      let bestCluster = 0;
      for (let c = 0; c < k; c++) {
        let dist = 0;
        for (let b = 0; b < numBands; b++) {
          dist += (data[b][p] - centroids[c][b]) ** 2;
        }
        if (dist < minDist) {
          minDist = dist;
          bestCluster = c;
        }
      }
      if (labels[p] !== bestCluster) {
        labels[p] = bestCluster;
        changed++;
      }
    }

    // Update step
    const counts = new Array(k).fill(0);
    const sums = centroids.map(() => new Array(numBands).fill(0));
    for (let p = 0; p < numPixels; p++) {
      counts[labels[p]]++;
      for (let b = 0; b < numBands; b++) {
        sums[labels[p]][b] += data[b][p];
      }
    }
    for (let c = 0; c < k; c++) {
      if (counts[c] > 0) {
        for (let b = 0; b < numBands; b++) {
          centroids[c][b] = sums[c][b] / counts[c];
        }
      }
    }

    // Convergence check
    if (changed === 0 || changed < numPixels * threshold) break;
  }

  return labels;
}

// ISODATA extends k-means with split/merge
function isodataClustering(data: Float64Array[], initialK: number, maxIter = 30, threshold = 0.001): Uint8Array {
  // Simplified ISODATA: just k-means with some extra iterations for better convergence
  return kMeansClustering(data, initialK, maxIter * 2, threshold);
}

/** Cluster the pixels of one raster. Bands are the feature vector, one entry per band. */
export function classifyPixels(bands: ArrayLike<number>[], options: ClassifyOptions): ClassifyResult {
  if (bands.length === 0) throw new Error('classifyPixels needs at least one band');
  const {
    method,
    numClasses,
    noData = null,
    maxIterations = 50,
    convergenceThreshold = 0.001,
  } = options;
  const numPixels = bands[0].length;

  // pixels holding data in every band
  const valid: number[] = [];
  for (let p = 0; p < numPixels; p++) {
    let ok = true;
    for (const band of bands) {
      const v = band[p];
      if (!Number.isFinite(v) || (noData != null && v === noData)) {
        ok = false;
        break;
      }
    }
    if (ok) valid.push(p);
  }

  const labels = new Int16Array(numPixels).fill(-1);
  if (valid.length === 0) {
    return { labels, classes: [], classifiedPixels: 0, skippedPixels: numPixels };
  }

  const k = Math.max(1, Math.min(numClasses, valid.length));
  const packed = bands.map((band) => {
    const out = new Float64Array(valid.length);
    for (let i = 0; i < valid.length; i++) out[i] = band[valid[i]];
    return out;
  });

  const packedLabels =
    method === 'isodata'
      ? isodataClustering(packed, k, maxIterations, convergenceThreshold)
      : kMeansClustering(packed, k, maxIterations, convergenceThreshold);

  for (let i = 0; i < valid.length; i++) labels[valid[i]] = packedLabels[i];

  const counts = new Array(k).fill(0);
  const sums = new Array(k).fill(0);
  for (let i = 0; i < valid.length; i++) {
    counts[packedLabels[i]]++;
    sums[packedLabels[i]] += packed[0][i];
  }

  const classes: ClassStats[] = [];
  for (let c = 0; c < k; c++) {
    classes.push({
      classId: c + 1,
      color: CLASS_COLORS[c % CLASS_COLORS.length],
      pixelCount: counts[c],
      percentage: (counts[c] / valid.length) * 100,
      meanValue: counts[c] > 0 ? sums[c] / counts[c] : 0,
    });
  }

  return { labels, classes, classifiedPixels: valid.length, skippedPixels: numPixels - valid.length };
}
