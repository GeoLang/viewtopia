import type { Link } from '../types';

/**
 * Build adjacency list from links.
 */
function buildAdjacency(entityIds: string[], links: Link[]): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  for (const id of entityIds) adj.set(id, new Set());

  for (const link of links) {
    if (adj.has(link.sourceId) && adj.has(link.targetId)) {
      adj.get(link.sourceId)!.add(link.targetId);
      adj.get(link.targetId)!.add(link.sourceId);
    }
  }
  return adj;
}

/**
 * Compute degree centrality (normalized).
 */
export function computeDegree(entityIds: string[], links: Link[]): Map<string, number> {
  const adj = buildAdjacency(entityIds, links);
  const degree = new Map<string, number>();
  const maxDeg = entityIds.length - 1 || 1;
  for (const [id, neighbors] of adj) {
    degree.set(id, neighbors.size / maxDeg);
  }
  return degree;
}

/**
 * Compute betweenness centrality using Brandes' algorithm.
 */
export function computeBetweenness(entityIds: string[], links: Link[]): Map<string, number> {
  const adj = buildAdjacency(entityIds, links);
  const betweenness = new Map<string, number>();
  for (const id of entityIds) betweenness.set(id, 0);

  for (const s of entityIds) {
    const stack: string[] = [];
    const pred = new Map<string, string[]>();
    const sigma = new Map<string, number>();
    const dist = new Map<string, number>();

    for (const id of entityIds) {
      pred.set(id, []);
      sigma.set(id, 0);
      dist.set(id, -1);
    }
    sigma.set(s, 1);
    dist.set(s, 0);

    const queue: string[] = [s];
    while (queue.length > 0) {
      const v = queue.shift()!;
      stack.push(v);
      for (const w of adj.get(v) ?? []) {
        if (dist.get(w)! < 0) {
          queue.push(w);
          dist.set(w, dist.get(v)! + 1);
        }
        if (dist.get(w) === dist.get(v)! + 1) {
          sigma.set(w, sigma.get(w)! + sigma.get(v)!);
          pred.get(w)!.push(v);
        }
      }
    }

    const delta = new Map<string, number>();
    for (const id of entityIds) delta.set(id, 0);

    while (stack.length > 0) {
      const w = stack.pop()!;
      for (const v of pred.get(w)!) {
        const d = (sigma.get(v)! / sigma.get(w)!) * (1 + delta.get(w)!);
        delta.set(v, delta.get(v)! + d);
      }
      if (w !== s) {
        betweenness.set(w, betweenness.get(w)! + delta.get(w)!);
      }
    }
  }

  // Normalize
  const n = entityIds.length;
  const norm = n > 2 ? (n - 1) * (n - 2) : 1;
  for (const [id, val] of betweenness) {
    betweenness.set(id, val / norm);
  }

  return betweenness;
}

/**
 * Compute all network metrics.
 */
export function computeAllMetrics(entityIds: string[], links: Link[]) {
  return {
    degree: computeDegree(entityIds, links),
    betweenness: computeBetweenness(entityIds, links),
  };
}
