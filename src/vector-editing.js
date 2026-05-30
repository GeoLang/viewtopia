/**
 * Advanced vector editing — snapping, topology-aware editing, splitting,
 * merging, and undo/redo support for GeoJSON features.
 *
 * Adds CAD-like precision editing on top of the basic GeoJSON editor.
 */

/** Snap tolerance in pixels */
const DEFAULT_SNAP_TOLERANCE = 10;

/** Maximum undo history depth */
const MAX_UNDO_DEPTH = 50;

/** @typedef {{ type: string, coordinates: any }} Geometry */
/** @typedef {{ type: 'Feature', geometry: Geometry, properties: object, id?: string }} Feature */
/** @typedef {{ x: number, y: number }} PixelCoord */
/** @typedef {{ lat: number, lng: number }} LatLng */

/**
 * Undo/redo stack for feature editing.
 */
class EditHistory {
  constructor() {
    /** @type {string[]} */
    this.undoStack = [];
    /** @type {string[]} */
    this.redoStack = [];
  }

  /** Push current state */
  push(featureCollection) {
    this.undoStack.push(JSON.stringify(featureCollection));
    if (this.undoStack.length > MAX_UNDO_DEPTH) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  /** Undo last edit, returns previous state or null */
  undo(currentState) {
    if (this.undoStack.length === 0) return null;
    this.redoStack.push(JSON.stringify(currentState));
    return JSON.parse(this.undoStack.pop());
  }

  /** Redo last undone edit */
  redo(currentState) {
    if (this.redoStack.length === 0) return null;
    this.undoStack.push(JSON.stringify(currentState));
    return JSON.parse(this.redoStack.pop());
  }

  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }
}

/**
 * Snap engine — finds nearest vertices, edges, and intersections for precision editing.
 */
class SnapEngine {
  constructor(features, tolerance = DEFAULT_SNAP_TOLERANCE) {
    this.features = features;
    this.tolerance = tolerance;
  }

  /**
   * Find the best snap target for a given point.
   * @param {LatLng} point - Cursor position in map coordinates
   * @param {Function} project - Convert LatLng to pixel (x, y)
   * @param {string|null} excludeFeatureId - Skip this feature (being edited)
   * @returns {{ point: LatLng, type: string, featureId?: string } | null}
   */
  findSnap(point, project, excludeFeatureId = null) {
    const px = project(point);
    let best = null;
    let bestDist = this.tolerance;

    for (const feature of this.features) {
      if (feature.id === excludeFeatureId) continue;
      if (!feature.geometry) continue;

      const coords = this._extractCoords(feature.geometry);

      // Snap to vertices
      for (const coord of coords) {
        const cpx = project({ lat: coord[1], lng: coord[0] });
        const dist = Math.hypot(cpx.x - px.x, cpx.y - px.y);
        if (dist < bestDist) {
          bestDist = dist;
          best = { point: { lat: coord[1], lng: coord[0] }, type: 'vertex', featureId: feature.id };
        }
      }

      // Snap to edges (midpoints and perpendicular projection)
      const edges = this._extractEdges(feature.geometry);
      for (const edge of edges) {
        const projected = this._projectToEdge(point, edge[0], edge[1]);
        if (projected) {
          const ppx = project(projected);
          const dist = Math.hypot(ppx.x - px.x, ppx.y - px.y);
          if (dist < bestDist) {
            bestDist = dist;
            best = { point: projected, type: 'edge', featureId: feature.id };
          }
        }
      }
    }

    return best;
  }

  _extractCoords(geometry) {
    switch (geometry.type) {
      case 'Point': return [geometry.coordinates];
      case 'MultiPoint':
      case 'LineString': return geometry.coordinates;
      case 'MultiLineString':
      case 'Polygon': return geometry.coordinates.flat();
      case 'MultiPolygon': return geometry.coordinates.flat(2);
      default: return [];
    }
  }

  _extractEdges(geometry) {
    const edges = [];
    const rings = [];
    switch (geometry.type) {
      case 'LineString': rings.push(geometry.coordinates); break;
      case 'MultiLineString':
      case 'Polygon': geometry.coordinates.forEach(r => rings.push(r)); break;
      case 'MultiPolygon': geometry.coordinates.forEach(p => p.forEach(r => rings.push(r))); break;
    }
    for (const ring of rings) {
      for (let i = 0; i < ring.length - 1; i++) {
        edges.push([
          { lat: ring[i][1], lng: ring[i][0] },
          { lat: ring[i + 1][1], lng: ring[i + 1][0] }
        ]);
      }
    }
    return edges;
  }

  _projectToEdge(point, a, b) {
    const dx = b.lng - a.lng;
    const dy = b.lat - a.lat;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return null;
    let t = ((point.lng - a.lng) * dx + (point.lat - a.lat) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return { lat: a.lat + t * dy, lng: a.lng + t * dx };
  }
}

/**
 * Split a LineString at a given point.
 * @param {number[][]} coordinates - LineString coordinates
 * @param {number[]} splitPoint - [lng, lat] where to split
 * @returns {number[][][]} Two arrays of coordinates
 */
export function splitLineAtPoint(coordinates, splitPoint) {
  if (coordinates.length < 2) return [coordinates, []];

  let bestSegIdx = 0;
  let bestT = 0;
  let bestDist = Infinity;

  for (let i = 0; i < coordinates.length - 1; i++) {
    const a = coordinates[i];
    const b = coordinates[i + 1];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) continue;
    let t = ((splitPoint[0] - a[0]) * dx + (splitPoint[1] - a[1]) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const px = a[0] + t * dx;
    const py = a[1] + t * dy;
    const dist = Math.hypot(px - splitPoint[0], py - splitPoint[1]);
    if (dist < bestDist) {
      bestDist = dist;
      bestSegIdx = i;
      bestT = t;
    }
  }

  const a = coordinates[bestSegIdx];
  const b = coordinates[bestSegIdx + 1];
  const insertPt = [
    a[0] + bestT * (b[0] - a[0]),
    a[1] + bestT * (b[1] - a[1])
  ];

  const first = [...coordinates.slice(0, bestSegIdx + 1), insertPt];
  const second = [insertPt, ...coordinates.slice(bestSegIdx + 1)];
  return [first, second];
}

/**
 * Merge two LineStrings that share an endpoint.
 * @param {number[][]} line1 - First LineString coordinates
 * @param {number[][]} line2 - Second LineString coordinates
 * @param {number} tolerance - Distance tolerance for endpoint matching
 * @returns {number[][] | null} Merged coordinates or null if can't merge
 */
export function mergeLines(line1, line2, tolerance = 1e-6) {
  if (line1.length === 0 || line2.length === 0) return null;

  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  // Try all 4 endpoint combinations
  if (dist(line1[line1.length - 1], line2[0]) <= tolerance) {
    return [...line1, ...line2.slice(1)];
  }
  if (dist(line1[0], line2[line2.length - 1]) <= tolerance) {
    return [...line2, ...line1.slice(1)];
  }
  if (dist(line1[line1.length - 1], line2[line2.length - 1]) <= tolerance) {
    return [...line1, ...line2.slice(0, -1).reverse()];
  }
  if (dist(line1[0], line2[0]) <= tolerance) {
    return [...line1.reverse(), ...line2.slice(1)];
  }
  return null;
}

/**
 * Simplify a polygon by removing collinear vertices.
 * @param {number[][]} ring - Ring coordinates
 * @param {number} angleTolerance - Degrees tolerance for collinearity
 * @returns {number[][]} Simplified ring
 */
export function removeCollinearVertices(ring, angleTolerance = 1.0) {
  if (ring.length <= 4) return ring; // Minimum triangle + close
  const rad = angleTolerance * Math.PI / 180;
  const result = [ring[0]];

  for (let i = 1; i < ring.length - 1; i++) {
    const prev = ring[i - 1];
    const curr = ring[i];
    const next = ring[i + 1];
    const a1 = Math.atan2(curr[1] - prev[1], curr[0] - prev[0]);
    const a2 = Math.atan2(next[1] - curr[1], next[0] - curr[0]);
    const diff = Math.abs(a2 - a1);
    if (diff > rad && diff < Math.PI * 2 - rad) {
      result.push(curr);
    }
  }

  result.push(ring[ring.length - 1]);
  return result;
}

/**
 * Check if a polygon ring is valid (closed, no self-intersection).
 * @param {number[][]} ring - Ring coordinates
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateRing(ring) {
  const errors = [];

  if (ring.length < 4) {
    errors.push('Ring must have at least 4 coordinates (3 vertices + closing)');
  }

  // Check closure
  if (ring.length >= 2) {
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (Math.abs(first[0] - last[0]) > 1e-10 || Math.abs(first[1] - last[1]) > 1e-10) {
      errors.push('Ring is not closed');
    }
  }

  // Check self-intersection (O(n²) but fine for editing)
  for (let i = 0; i < ring.length - 1; i++) {
    for (let j = i + 2; j < ring.length - 1; j++) {
      if (i === 0 && j === ring.length - 2) continue; // Skip adjacent closure
      if (segmentsIntersect(ring[i], ring[i + 1], ring[j], ring[j + 1])) {
        errors.push(`Self-intersection between segments ${i} and ${j}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Test if two line segments intersect (proper intersection only).
 */
function segmentsIntersect(a1, a2, b1, b2) {
  const d1 = cross(b1, b2, a1);
  const d2 = cross(b1, b2, a2);
  const d3 = cross(a1, a2, b1);
  const d4 = cross(a1, a2, b2);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  return false;
}

function cross(o, a, b) {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

/**
 * Compute the area of a polygon ring (shoelface formula).
 * @param {number[][]} ring - Ring coordinates [lng, lat]
 * @returns {number} Signed area (positive = CCW, negative = CW)
 */
export function ringArea(ring) {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    area += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return area / 2;
}

/**
 * Ensure polygon ring has correct winding order.
 * Exterior rings should be CCW, holes CW (GeoJSON spec).
 * @param {number[][]} ring
 * @param {boolean} isHole
 * @returns {number[][]}
 */
export function enforceWinding(ring, isHole = false) {
  const area = ringArea(ring);
  if (isHole && area > 0) return [...ring].reverse();
  if (!isHole && area < 0) return [...ring].reverse();
  return ring;
}

// Export classes for use by other modules
export { EditHistory, SnapEngine };
