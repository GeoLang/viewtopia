import { defineConfig } from 'vite';
import cesium from 'vite-plugin-cesium';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  // The production build is served from a GitHub Pages project page
  // (geolang.github.io/viewtopia/), a subpath, not the domain root. A relative
  // base makes every asset reference relative to index.html, so it resolves
  // under /viewtopia/ without 404ing (the black screen) and without the absolute
  // path that makes vite-plugin-cesium mis-copy Cesium. The dev server keeps the
  // root base so `pnpm dev` is unaffected.
  base: command === 'build' ? './' : '/',
  plugins: [react(), cesium()],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  server: {
    port: 5174,
    proxy: {
      // TileTopia server (3D tiles, terrain, assets)
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      // GeoLang agent (AI chat, analysis, geojson outputs)
      '/agent': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/agent/, ''),
      },
    },
  },
  build: {
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
}));
