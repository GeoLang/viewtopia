import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import cesium from 'vite-plugin-cesium';
import react from '@vitejs/plugin-react';

// Backend prefixes served by the platform stack's nginx (the viewtopia
// container on 5174), which owns the upstream route table and its own path
// rewrites. Proxying to it rather than to each service keeps dev from having to
// mirror per-service ports, which drift.
const PLATFORM_STACK = 'http://localhost:5174';
const BACKEND_PREFIXES = ['/agent', '/agora', '/api', '/ogc', '/plumb', '/tiles', '/jupyter', '/ws'];

// everything index.html pulls at boot: entry chunks, styles, fonts, and the
// cesium runtime the bundle binds to as a global. cesium's Assets and Workers
// load later, only when a 3D viewer is built, so they stay on the network.
const APP_SHELL_GLOBS = [
  'index.html',
  'assets/*.{js,css,woff,woff2}',
  'cesium/Cesium.js',
  'cesium/Widgets/widgets.css',
];

// manifest.json: offline/network.ts pings it to tell online from offline, and a
// precached answer would always say online. duckdb workers: dead without wasm.
const PRECACHE_IGNORED_GLOBS = ['manifest.json', 'assets/duckdb-browser-*.worker-*.js'];

// the entry chunk and Cesium.js are 5-6 MB each, past workbox's 2 MB default
const MAX_PRECACHED_FILE_BYTES = 8 * 1024 * 1024;

// @panoramax/web-viewer uses css module scripts (import x from "a.css" with
// { type: "css" }), which rollup can't bundle. Rewrite them to constructable
// stylesheets fed from vite's ?inline css.
function cssModuleScripts() {
  return {
    name: 'css-module-scripts',
    enforce: 'pre',
    transform(code, id) {
      // dev-server ids carry a ?v= cache-busting query, build ids don't
      const file = id.split('?')[0];
      if (!file.includes('@panoramax/web-viewer') || !file.endsWith('.js')) return null;
      return code.replace(
        /import\s+(\w+)\s+from\s*"([^"]+\.css)"\s*with\s*\{\s*type:\s*"css"\s*\};?/g,
        (_m, name, path) =>
          `import ${name}__raw from "${path}?inline";\n` +
          `const ${name} = new CSSStyleSheet();\n${name}.replaceSync(${name}__raw);`,
      );
    },
  };
}

export default defineConfig({
  plugins: [
    cssModuleScripts(),
    react(),
    cesium(),
    // precaches the app shell only. api responses and map tiles are already
    // cached in IndexedDB by offlineFetch and the cached:// tile protocol, so
    // this worker registers no runtime routes and lets those requests through.
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      manifest: false,
      workbox: {
        globPatterns: APP_SHELL_GLOBS,
        globIgnores: PRECACHE_IGNORED_GLOBS,
        maximumFileSizeToCacheInBytes: MAX_PRECACHED_FILE_BYTES,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: BACKEND_PREFIXES.map(
          (prefix) => new RegExp(`^${prefix}(/|$)`),
        ),
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  optimizeDeps: {
    exclude: ['@panoramax/web-viewer'],
  },
  resolve: {
    alias: {
      '@': '/src',
      // photo-only entry: the full index eagerly evaluates Map.js, which reads
      // a maplibregl global that doesn't exist in a bundled app and crashes
      // startup. absolute path because the package exports map hides it.
      '@panoramax/web-viewer': fileURLToPath(
        new URL('./node_modules/@panoramax/web-viewer/build/esm/index_photoviewer.js', import.meta.url),
      ),
    },
  },
  server: {
    port: 5173,
    proxy: Object.fromEntries(
      BACKEND_PREFIXES.map((prefix) => [
        prefix,
        { target: PLATFORM_STACK, changeOrigin: true, ws: true },
      ]),
    ),
  },
  build: {
    // es2022 for top-level await in @panoramax/web-viewer
    target: 'es2022',
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks: {
          deckgl: ['@deck.gl/core', '@deck.gl/geo-layers', '@deck.gl/layers', '@deck.gl/aggregation-layers'],
          maplibre: ['maplibre-gl'],
        },
      },
    },
  },
});
