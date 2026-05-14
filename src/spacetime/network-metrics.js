/**
 * Social Network Metrics — graph analytics on entity relationships.
 *
 * Computes centrality measures to identify key connectors, brokers,
 * and influential entities in the relationship network.
 */

/**
 * @typedef {Object} NetworkMetrics
 * @property {Map<string, number>} degree - Number of connections per entity
 * @property {Map<string, number>} betweenness - Betweenness centrality
 * @property {Map<string, number>} closeness - Closeness centrality
 * @property {Map<string, number>} pageRank - PageRank score
 * @property {Map<string, string[]>} communities - Community detection clusters
 */

/**
 * Build adjacency list from links.
 */
function buildAdjacency(entityIds, links) {
  const adj = new Map();
  for (const id of entityIds) adj.set(id, new Set());

  for (const link of links) {
    if (adj.has(link.sourceId) && adj.has(link.targetId)) {
      adj.get(link.sourceId).add(link.targetId);
      adj.get(link.targetId).add(link.sourceId);
    }
  }
  return adj;
}

/**
 * Compute degree centrality (normalized).
 */
export function computeDegree(entityIds, links) {
  const adj = buildAdjacency(entityIds, links);
  const degree = new Map();
  const maxDeg = entityIds.length - 1 || 1;
  for (const [id, neighbors] of adj) {
    degree.set(id, neighbors.size / maxDeg);
  }
  return degree;
}

/**
 * Compute betweenness centrality using Brandes' algorithm.
 * O(V * E) — efficient enough for typical analyst datasets (~1000 entities).
 */
export function computeBetweenness(entityIds, links) {
  const adj = buildAdjacency(entityIds, links);
  const betweenness = new Map();
  for (const id of entityIds) betweenness.set(id, 0);

  for (const s of entityIds) {
    // BFS from s
    const stack = [];
    const pred = new Map();
    const sigma = new Map();
    const dist = new Map();
    for (const id of entityIds) {
      pred.set(id, []);
      sigma.set(id, 0);
      dist.set(id, -1);
    }
    sigma.set(s, 1);
    dist.set(s, 0);

    const queue = [s];
    while (queue.length > 0) {
      const v = queue.shift();
      stack.push(v);
      for (const w of adj.get(v) || []) {
        if (dist.get(w) < 0) {
          queue.push(w);
          dist.set(w, dist.get(v) + 1);
        }
        if (dist.get(w) === dist.get(v) + 1) {
          sigma.set(w, sigma.get(w) + sigma.get(v));
          pred.get(w).push(v);
        }
      }
    }

    // Back-propagation
    const delta = new Map();
    for (const id of entityIds) delta.set(id, 0);
    while (stack.length > 0) {
      const w = stack.pop();
      for (const v of pred.get(w)) {
        delta.set(v, delta.get(v) + (sigma.get(v) / sigma.get(w)) * (1 + delta.get(w)));
      }
      if (w !== s) {
        betweenness.set(w, betweenness.get(w) + delta.get(w));
      }
    }
  }

  // Normalize
  const n = entityIds.length;
  const factor = n > 2 ? 2 / ((n - 1) * (n - 2)) : 1;
  for (const id of entityIds) {
    betweenness.set(id, betweenness.get(id) * factor);
  }

  return betweenness;
}

/**
 * Compute closeness centrality.
 */
export function computeCloseness(entityIds, links) {
  const adj = buildAdjacency(entityIds, links);
  const closeness = new Map();

  for (const s of entityIds) {
    // BFS distances
    const dist = new Map();
    dist.set(s, 0);
    const queue = [s];
    let totalDist = 0;
    let reachable = 0;

    while (queue.length > 0) {
      const v = queue.shift();
      for (const w of adj.get(v) || []) {
        if (!dist.has(w)) {
          dist.set(w, dist.get(v) + 1);
          totalDist += dist.get(w);
          reachable++;
          queue.push(w);
        }
      }
    }

    closeness.set(s, reachable > 0 ? reachable / totalDist : 0);
  }

  return closeness;
}

/**
 * Compute PageRank.
 */
export function computePageRank(entityIds, links, opts = {}) {
  const { damping = 0.85, iterations = 20 } = opts;
  const adj = buildAdjacency(entityIds, links);
  const n = entityIds.length;
  if (n === 0) return new Map();

  const rank = new Map();
  const outDegree = new Map();

  for (const id of entityIds) {
    rank.set(id, 1 / n);
    outDegree.set(id, (adj.get(id) || new Set()).size);
  }

  for (let iter = 0; iter < iterations; iter++) {
    const newRank = new Map();
    for (const id of entityIds) {
      let sum = 0;
      for (const neighbor of adj.get(id) || []) {
        sum += rank.get(neighbor) / (outDegree.get(neighbor) || 1);
      }
      newRank.set(id, (1 - damping) / n + damping * sum);
    }
    for (const [id, r] of newRank) rank.set(id, r);
  }

  return rank;
}

/**
 * Simple community detection using label propagation.
 */
export function detectCommunities(entityIds, links) {
  const adj = buildAdjacency(entityIds, links);
  const labels = new Map();
  let labelId = 0;
  for (const id of entityIds) labels.set(id, labelId++);

  for (let iter = 0; iter < 10; iter++) {
    let changed = false;
    for (const id of entityIds) {
      const neighbors = adj.get(id);
      if (!neighbors || neighbors.size === 0) continue;

      // Find most common label among neighbors
      const labelCount = new Map();
      for (const n of neighbors) {
        const l = labels.get(n);
        labelCount.set(l, (labelCount.get(l) || 0) + 1);
      }

      let bestLabel = labels.get(id);
      let bestCount = 0;
      for (const [l, c] of labelCount) {
        if (c > bestCount) { bestLabel = l; bestCount = c; }
      }

      if (bestLabel !== labels.get(id)) {
        labels.set(id, bestLabel);
        changed = true;
      }
    }
    if (!changed) break;
  }

  // Group into communities
  const communities = new Map();
  for (const [id, label] of labels) {
    if (!communities.has(label)) communities.set(label, []);
    communities.get(label).push(id);
  }

  return communities;
}

/**
 * Compute all metrics at once.
 */
export function computeAllMetrics(entityIds, links) {
  return {
    degree: computeDegree(entityIds, links),
    betweenness: computeBetweenness(entityIds, links),
    closeness: computeCloseness(entityIds, links),
    pageRank: computePageRank(entityIds, links),
    communities: detectCommunities(entityIds, links),
  };
}
