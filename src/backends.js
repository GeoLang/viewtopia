/**
 * Backend discovery — probes TileTopia and GeoLang servers at startup
 * and exposes their availability to the rest of the app.
 */

const TILETOPIA_BASE = '/api/v1';
const GEOLANG_BASE = '/agent';

const state = {
  tiletopia: false,
  geolang: false,
};

const listeners = new Set();

export function onBackendChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  for (const fn of listeners) fn({ ...state });
}

export function hasTileTopia() { return state.tiletopia; }
export function hasGeoLang() { return state.geolang; }
export function getTileTopiaBase() { return TILETOPIA_BASE; }
export function getGeoLangBase() { return GEOLANG_BASE; }

async function probe(url, timeout = 2000) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeout) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function discoverBackends() {
  const [tt, gl] = await Promise.all([
    probe(`${TILETOPIA_BASE}/health`),
    probe(`${GEOLANG_BASE}/health`),
  ]);
  state.tiletopia = tt;
  state.geolang = gl;
  notify();
  renderBadges();
  return { ...state };
}

function renderBadges() {
  const el = document.getElementById('backend-badges');
  if (!el) return;
  el.innerHTML = '';

  const ttBadge = document.createElement('span');
  ttBadge.className = `backend-badge ${state.tiletopia ? 'connected' : 'disconnected'}`;
  ttBadge.textContent = state.tiletopia ? 'TileTopia ✓' : 'TileTopia ✗';
  el.appendChild(ttBadge);

  const glBadge = document.createElement('span');
  glBadge.className = `backend-badge ${state.geolang ? 'connected' : 'disconnected'}`;
  glBadge.textContent = state.geolang ? 'GeoLang ✓' : 'GeoLang ✗';
  el.appendChild(glBadge);

  const statusEl = document.getElementById('status');
  if (statusEl) {
    if (state.tiletopia || state.geolang) {
      statusEl.textContent = 'connected';
      statusEl.className = 'status ok';
    } else {
      statusEl.textContent = 'no backends';
      statusEl.className = 'status';
    }
  }
}

// Re-probe every 30 seconds
let probeInterval = null;

export function startPolling(intervalMs = 30000) {
  stopPolling();
  probeInterval = setInterval(discoverBackends, intervalMs);
}

export function stopPolling() {
  if (probeInterval) {
    clearInterval(probeInterval);
    probeInterval = null;
  }
}
