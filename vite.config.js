import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import cesium from 'vite-plugin-cesium';
import react from '@vitejs/plugin-react';

// Backend prefixes served by the platform stack's nginx (the viewtopia
// container on 5174), which owns the upstream route table and its own path
// rewrites. Proxying to it rather than to each service keeps dev from having to
// mirror per-service ports, which drift.
const PLATFORM_STACK = 'http://localhost:5174';
const BACKEND_PREFIXES = ['/agent', '/agora', '/api', '/plumb', '/tiles', '/jupyter', '/ws'];

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
  plugins: [cssModuleScripts(), react(), cesium()],
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
