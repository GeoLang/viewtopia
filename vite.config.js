import { defineConfig } from 'vite';
import cesium from 'vite-plugin-cesium';
import react from '@vitejs/plugin-react';

export default defineConfig({
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
});
