/**
 * Entity Resolution — fuzzy matching and deduplication across records.
 *
 * Finds entities that likely refer to the same real-world object
 * using name similarity, alias overlap, temporal/spatial proximity,
 * and configurable scoring weights.
 */

/**
 * @typedef {Object} ResolutionCandidate
 * @property {string} entityA - First entity ID
 * @property {string} entityB - Second entity ID
 * @property {number} score - Match confidence 0.0 - 1.0
 * @property {string[]} reasons - Why they might be the same
 */

/**
 * Compute Levenshtein edit distance between two strings.
 */
function editDistance(a, b) {
  const la = a.length, lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;

  const dp = Array.from({ length: la + 1 }, () => new Array(lb + 1).fill(0));
  for (let i = 0; i <= la; i++) dp[i][0] = i;
  for (let j = 0; j <= lb; j++) dp[0][j] = j;

  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[la][lb];
}

/**
 * Normalized string similarity (0.0 = no match, 1.0 = identical).
 */
function stringSimilarity(a, b) {
  if (!a || !b) return 0;
  const na = a.toLowerCase().trim();
  const nb = b.toLowerCase().trim();
  if (na === nb) return 1.0;
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1.0;
  return 1 - editDistance(na, nb) / maxLen;
}

/**
 * Check if any tokens from set A appear in set B (fuzzy).
 */
function tokenOverlap(a, b) {
  const tokensA = a.toLowerCase().split(/\s+/).filter(t => t.length > 1);
  const tokensB = b.toLowerCase().split(/\s+/).filter(t => t.length > 1);
  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  let matches = 0;
  for (const ta of tokensA) {
    for (const tb of tokensB) {
      if (ta === tb || stringSimilarity(ta, tb) > 0.8) {
        matches++;
        break;
      }
    }
  }
  return matches / Math.max(tokensA.length, tokensB.length);
}

/**
 * Check alias overlap between two entities.
 */
function aliasOverlap(entityA, entityB) {
  const aliasesA = [entityA.name, ...(entityA.aliases || [])].map(s => s.toLowerCase().trim());
  const aliasesB = [entityB.name, ...(entityB.aliases || [])].map(s => s.toLowerCase().trim());

  for (const a of aliasesA) {
    for (const b of aliasesB) {
      if (a === b) return 1.0;
      if (stringSimilarity(a, b) > 0.85) return 0.8;
    }
  }
  return 0;
}

/**
 * Find potential duplicate entities.
 *
 * @param {Map<string, import('./models.js').Entity>} entities
 * @param {Object} opts
 * @param {number} [opts.nameThreshold=0.7] - Min name similarity
 * @param {number} [opts.minScore=0.5] - Min overall score to report
 * @returns {ResolutionCandidate[]}
 */
export function findDuplicates(entities, opts = {}) {
  const { nameThreshold = 0.7, minScore = 0.5 } = opts;
  const candidates = [];
  const ids = [...entities.keys()];

  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = entities.get(ids[i]);
      const b = entities.get(ids[j]);

      let score = 0;
      const reasons = [];

      // 1. Name similarity (weight: 0.3)
      const nameSim = stringSimilarity(a.name, b.name);
      if (nameSim >= nameThreshold) {
        score += nameSim * 0.3;
        reasons.push(`Name similarity: ${(nameSim * 100).toFixed(0)}%`);
      }

      // 2. Token overlap (weight: 0.15)
      const tokenSim = tokenOverlap(a.name, b.name);
      if (tokenSim > 0) {
        score += tokenSim * 0.15;
        reasons.push(`Token overlap: ${(tokenSim * 100).toFixed(0)}%`);
      }

      // 3. Alias match (weight: 0.35)
      const aliasSim = aliasOverlap(a, b);
      if (aliasSim > 0) {
        score += aliasSim * 0.35;
        reasons.push(`Alias match: ${(aliasSim * 100).toFixed(0)}%`);
      }

      // 4. Same kind (weight: 0.1)
      if (a.kind === b.kind) {
        score += 0.1;
        reasons.push(`Same type: ${a.kind}`);
      }

      // 5. Property overlap (weight: 0.1)
      if (a.properties && b.properties) {
        let propMatches = 0, propTotal = 0;
        for (const [key, val] of Object.entries(a.properties)) {
          if (b.properties[key] != null) {
            propTotal++;
            if (String(b.properties[key]).toLowerCase() === String(val).toLowerCase()) {
              propMatches++;
            }
          }
        }
        if (propTotal > 0) {
          const propSim = propMatches / propTotal;
          score += propSim * 0.1;
          if (propMatches > 0) reasons.push(`${propMatches} matching properties`);
        }
      }

      if (score >= minScore && reasons.length > 0) {
        candidates.push({ entityA: ids[i], entityB: ids[j], score, reasons });
      }
    }
  }

  return candidates.sort((a, b) => b.score - a.score);
}

/**
 * Auto-resolve duplicates by merging high-confidence matches.
 *
 * @param {Map<string, import('./models.js').Entity>} entities
 * @param {ResolutionCandidate[]} candidates
 * @param {number} [autoMergeThreshold=0.85] - Auto-merge if score >= this
 * @param {Function} mergeFn - Function to call for merging (e.g., mergeEntities from entity-manager)
 * @returns {{ merged: number, remaining: ResolutionCandidate[] }}
 */
export function autoResolve(entities, candidates, autoMergeThreshold = 0.85, mergeFn) {
  let merged = 0;
  const remaining = [];
  const mergedIds = new Set();

  for (const candidate of candidates) {
    if (mergedIds.has(candidate.entityA) || mergedIds.has(candidate.entityB)) continue;

    if (candidate.score >= autoMergeThreshold && mergeFn) {
      mergeFn(candidate.entityA, candidate.entityB);
      mergedIds.add(candidate.entityB);
      merged++;
    } else {
      remaining.push(candidate);
    }
  }

  return { merged, remaining };
}

/**
 * Show resolution UI panel.
 */
export function showResolutionPanel(entities, candidates, onMerge) {
  let panel = document.getElementById('resolution-panel');
  if (panel) panel.remove();

  panel = document.createElement('div');
  panel.id = 'resolution-panel';
  panel.className = 'resolution-panel';
  panel.innerHTML = `
    <div class="er-header">
      <h3>Entity Resolution</h3>
      <span class="er-count">${candidates.length} potential duplicates</span>
      <button class="er-close" title="Close">&times;</button>
    </div>
    <div class="er-list"></div>
  `;

  panel.querySelector('.er-close').addEventListener('click', () => panel.remove());

  const list = panel.querySelector('.er-list');
  for (const candidate of candidates.slice(0, 50)) {
    const a = entities.get(candidate.entityA);
    const b = entities.get(candidate.entityB);
    if (!a || !b) continue;

    const row = document.createElement('div');
    row.className = 'er-candidate';
    row.innerHTML = `
      <div class="er-pair">
        <span class="er-name" style="border-left:3px solid ${a.color}">${a.name} <em>(${a.kind})</em></span>
        <span class="er-arrow">↔</span>
        <span class="er-name" style="border-left:3px solid ${b.color}">${b.name} <em>(${b.kind})</em></span>
      </div>
      <div class="er-score">${(candidate.score * 100).toFixed(0)}%</div>
      <div class="er-reasons">${candidate.reasons.join(' · ')}</div>
      <div class="er-actions">
        <button class="st-btn er-merge">Merge</button>
        <button class="st-btn er-dismiss">Dismiss</button>
      </div>
    `;

    row.querySelector('.er-merge').addEventListener('click', () => {
      onMerge?.(candidate.entityA, candidate.entityB);
      row.remove();
    });
    row.querySelector('.er-dismiss').addEventListener('click', () => row.remove());

    list.appendChild(row);
  }

  document.body.appendChild(panel);
}
