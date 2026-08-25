import { defineConfig } from '@playwright/test';

// E2E for the FULL platform stack (docker-compose.platform.yml), NOT the dev server.
// Bring the stack up first:
//   docker compose -f docker-compose.platform.yml up -d
// then:
//   npm run test:e2e:platform
//
// Unlike playwright.config.js (which starts `vite`), this config has NO webServer:
// it asserts the real nginx-served SPA + live backends on :5174.
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: [
    'golden-path.spec.js',
    'agent-tool-run.spec.js',
    'live-session.spec.js',
    'realestate-smoke.spec.js',
    'dataset-editing.spec.js',
    'map-comment-pins.spec.js',
    'analysis-smoke.spec.js',
    'project-map-state.spec.js',
    'project-datasets.spec.js',
    'tileset-import.spec.js',
  ],
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:5174',
    headless: true,
  },
});
