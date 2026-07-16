import { defineConfig } from 'vite';
import cesium from 'vite-plugin-cesium';
import react from '@vitejs/plugin-react';

// Backend prefixes served by the platform stack's nginx (the viewtopia
// container on 5174), which owns the upstream route table and its own path
// rewrites. Proxying to it rather than to each service keeps dev from having to
// mirror per-service ports, which drift.
const PLATFORM_STACK = 'http://localhost:5174';
const BACKEND_PREFIXES = ['/agent', '/api', '/tiles', '/jupyter', '/ws'];

export default defineConfig({
  plugins: [react(), cesium()],
  resolve: {
    alias: {
      '@': '/src',
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
