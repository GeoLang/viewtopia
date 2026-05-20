/**
 * Conflict Resolution — three-way merge for offline-first sync.
 *
 * Strategy (mirrors geogit's merge.rs):
 *
 * 1. Each feature stores a `baseVersion` — the state when it was last synced
 * 2. Local edits modify the feature in IndexedDB
 * 3. On sync, we fetch the server's current version
 * 4. Three-way merge: base → local changes vs base → server changes
 * 5. Auto-resolve where possible, surface conflicts to user
 *
 * Resolution strategies:
 * - FastForward: only one side changed → take that side
 * - ColumnMerge: both sides changed different properties → merge both
 * - Conflict: both sides changed same property → user decides (ours/theirs/manual)
 */

export type ConflictType = 'both-modified' | 'modify-delete' | 'both-added';

export type ConflictStrategy = 'ours' | 'theirs' | 'manual';

export interface FeatureVersion {
  id: string;
  properties: Record<string, unknown>;
  geometry?: GeoJSON.Geometry;
  updatedAt: number;
}

export interface MergeConflict {
  featureId: string;
  conflictType: ConflictType;
  /** The common ancestor (state at last sync) */
  base: FeatureVersion | null;
  /** Our local version */
  ours: FeatureVersion | null;
  /** The server's version */
  theirs: FeatureVersion | null;
  /** Which properties conflict (both sides changed same property differently) */
  conflictingProperties: string[];
}

export interface MergeResult {
  /** Auto-resolved features (no user input needed) */
  resolved: Array<{
    featureId: string;
    resolution: 'fast-forward' | 'identical' | 'column-merge';
    mergedProperties: Record<string, unknown>;
    mergedGeometry?: GeoJSON.Geometry;
  }>;
  /** Conflicts requiring user input */
  conflicts: MergeConflict[];
}

/**
 * Three-way merge: given base, ours, and theirs — produce merged result or conflict.
 */
export function threeWayMerge(
  base: FeatureVersion | null,
  ours: FeatureVersion | null,
  theirs: FeatureVersion | null,
): MergeResult {
  const resolved: MergeResult['resolved'] = [];
  const conflicts: MergeConflict[] = [];

  const featureId = ours?.id || theirs?.id || base?.id || 'unknown';

  // Case: both null — nothing to do
  if (!ours && !theirs) {
    return { resolved, conflicts };
  }

  // Case: only one side exists (fast-forward)
  if (ours && !theirs) {
    resolved.push({
      featureId,
      resolution: 'fast-forward',
      mergedProperties: ours.properties,
      mergedGeometry: ours.geometry,
    });
    return { resolved, conflicts };
  }
  if (!ours && theirs) {
    resolved.push({
      featureId,
      resolution: 'fast-forward',
      mergedProperties: theirs.properties,
      mergedGeometry: theirs.geometry,
    });
    return { resolved, conflicts };
  }

  // Both exist — need to compare
  const ourProps = ours!.properties;
  const theirProps = theirs!.properties;
  const baseProps = base?.properties || {};

  // Check for identical changes
  if (JSON.stringify(ourProps) === JSON.stringify(theirProps) &&
      JSON.stringify(ours!.geometry) === JSON.stringify(theirs!.geometry)) {
    resolved.push({
      featureId,
      resolution: 'identical',
      mergedProperties: ourProps,
      mergedGeometry: ours!.geometry,
    });
    return { resolved, conflicts };
  }

  // Detect which properties each side changed from base
  const ourChanges = getChangedProperties(baseProps, ourProps);
  const theirChanges = getChangedProperties(baseProps, theirProps);

  // Find conflicts (same property changed on both sides to different values)
  const conflictingProperties: string[] = [];
  for (const key of ourChanges) {
    if (theirChanges.has(key)) {
      // Both changed same property — check if to same value
      if (JSON.stringify(ourProps[key]) !== JSON.stringify(theirProps[key])) {
        conflictingProperties.push(key);
      }
    }
  }

  // Check geometry conflict
  const ourGeomChanged = base?.geometry && JSON.stringify(ours!.geometry) !== JSON.stringify(base.geometry);
  const theirGeomChanged = base?.geometry && JSON.stringify(theirs!.geometry) !== JSON.stringify(base.geometry);
  const geomConflict = ourGeomChanged && theirGeomChanged &&
    JSON.stringify(ours!.geometry) !== JSON.stringify(theirs!.geometry);

  if (conflictingProperties.length === 0 && !geomConflict) {
    // Column-merge: combine changes from both sides
    const mergedProperties = { ...baseProps };
    // Apply their changes
    for (const key of theirChanges) {
      mergedProperties[key] = theirProps[key];
    }
    // Apply our changes (overrides theirs for same-value props, which is fine)
    for (const key of ourChanges) {
      mergedProperties[key] = ourProps[key];
    }

    // Geometry: take whichever side changed it (or ours if both changed identically)
    const mergedGeometry = ourGeomChanged ? ours!.geometry : theirs!.geometry || ours!.geometry;

    resolved.push({
      featureId,
      resolution: 'column-merge',
      mergedProperties,
      mergedGeometry,
    });
    return { resolved, conflicts };
  }

  // Has conflicts — need user resolution
  conflicts.push({
    featureId,
    conflictType: classifyConflictType(base, ours, theirs),
    base,
    ours,
    theirs,
    conflictingProperties: geomConflict
      ? [...conflictingProperties, '__geometry__']
      : conflictingProperties,
  });

  return { resolved, conflicts };
}

/**
 * Merge multiple features at once (batch merge for sync operations).
 */
export function batchMerge(
  items: Array<{
    featureId: string;
    base: FeatureVersion | null;
    ours: FeatureVersion | null;
    theirs: FeatureVersion | null;
  }>,
): MergeResult {
  const allResolved: MergeResult['resolved'] = [];
  const allConflicts: MergeConflict[] = [];

  for (const item of items) {
    const result = threeWayMerge(item.base, item.ours, item.theirs);
    allResolved.push(...result.resolved);
    allConflicts.push(...result.conflicts);
  }

  return { resolved: allResolved, conflicts: allConflicts };
}

/**
 * Apply a conflict strategy to resolve all conflicts at once.
 */
export function resolveAllConflicts(
  conflicts: MergeConflict[],
  strategy: ConflictStrategy,
): Array<{ featureId: string; properties: Record<string, unknown>; geometry?: GeoJSON.Geometry }> {
  return conflicts.map((c) => {
    switch (strategy) {
      case 'ours':
        return {
          featureId: c.featureId,
          properties: c.ours?.properties || {},
          geometry: c.ours?.geometry,
        };
      case 'theirs':
        return {
          featureId: c.featureId,
          properties: c.theirs?.properties || {},
          geometry: c.theirs?.geometry,
        };
      case 'manual':
        // For manual, default to ours but caller should present UI
        return {
          featureId: c.featureId,
          properties: c.ours?.properties || {},
          geometry: c.ours?.geometry,
        };
    }
  });
}

/**
 * Resolve a single conflict per-property (manual merge).
 * For each conflicting property, the user picks ours or theirs.
 */
export function resolveConflictManually(
  conflict: MergeConflict,
  resolutions: Record<string, 'ours' | 'theirs'>,
): { properties: Record<string, unknown>; geometry?: GeoJSON.Geometry } {
  const base = conflict.base?.properties || {};
  const merged = { ...base };

  // Apply all non-conflicting changes from both sides
  const ourProps = conflict.ours?.properties || {};
  const theirProps = conflict.theirs?.properties || {};
  const ourChanges = getChangedProperties(base, ourProps);
  const theirChanges = getChangedProperties(base, theirProps);

  for (const key of theirChanges) {
    if (!conflict.conflictingProperties.includes(key)) {
      merged[key] = theirProps[key];
    }
  }
  for (const key of ourChanges) {
    if (!conflict.conflictingProperties.includes(key)) {
      merged[key] = ourProps[key];
    }
  }

  // Apply user resolutions for conflicting properties
  for (const key of conflict.conflictingProperties) {
    if (key === '__geometry__') continue;
    const choice = resolutions[key] || 'ours';
    merged[key] = choice === 'ours' ? ourProps[key] : theirProps[key];
  }

  // Geometry resolution
  const geomChoice = resolutions['__geometry__'] || 'ours';
  const geometry = geomChoice === 'ours' ? conflict.ours?.geometry : conflict.theirs?.geometry;

  return { properties: merged, geometry };
}

// ─── Helpers ─────────────────────────────────────────────────────────

function getChangedProperties(
  base: Record<string, unknown>,
  current: Record<string, unknown>,
): Set<string> {
  const changed = new Set<string>();
  const allKeys = new Set([...Object.keys(base), ...Object.keys(current)]);

  for (const key of allKeys) {
    if (JSON.stringify(base[key]) !== JSON.stringify(current[key])) {
      changed.add(key);
    }
  }
  return changed;
}

function classifyConflictType(
  base: FeatureVersion | null,
  ours: FeatureVersion | null,
  theirs: FeatureVersion | null,
): ConflictType {
  if (!base) return 'both-added';
  if (!ours || !theirs) return 'modify-delete';
  return 'both-modified';
}
