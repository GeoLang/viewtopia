const CACHE_NAME = 'viewtopia-v3';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET, API, agent, and WebSocket requests
  if (request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/agent/') || url.pathname.startsWith('/ws/')) return;

  // Map tiles: cache-first (they rarely change)
  if (isTileRequest(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Static assets (JS, CSS, images, fonts): cache-first with background revalidate
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Everything else: network-first, cache fallback
  event.respondWith(networkFirst(request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const resp = await fetch(request);
    if (resp.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, resp.clone());
    }
    return resp;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

async function networkFirst(request) {
  try {
    const resp = await fetch(request);
    if (resp.ok && new URL(request.url).origin === self.location.origin) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, resp.clone());
    }
    return resp;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }
}

function isStaticAsset(url) {
  return /\.(js|css|woff2?|ttf|png|jpg|jpeg|svg|ico|webp|avif|json)(\?|$)/.test(url.pathname);
}

function isTileRequest(url) {
  return /\/\d+\/\d+\/\d+\.(png|pbf|jpg|webp|mvt)/.test(url.pathname) ||
    url.hostname.includes('tile');
}
