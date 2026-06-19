import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import cesium from 'vite-plugin-cesium';
import react from '@vitejs/plugin-react';

// Build config for the React front-end (index-react.html → main.tsx).
// During the Track 2 migration this builds alongside the legacy vanilla app;
// once parity is reached this becomes the default (see DESIGN.md Track 2).
export default defineConfig({
  plugins: [react(), cesium()],
  resolve: {
    alias: { '@': '/src' },
  },
  server: {
    port: 5174,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/agent': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/agent/, ''),
      },
    },
  },
  build: {
    outDir: 'dist-react',
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      input: { main: resolve(__dirname, 'index-react.html') },
      output: {
        manualChunks: {
          deckgl: ['@deck.gl/core', '@deck.gl/geo-layers', '@deck.gl/layers', '@deck.gl/aggregation-layers'],
          maplibre: ['maplibre-gl'],
        },
      },
    },
  },
});
