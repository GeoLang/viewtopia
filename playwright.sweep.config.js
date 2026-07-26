import { defineConfig } from '@playwright/test';

// Registry sweep: every tool panel opened through the real menu path.
// Targets the platform stack on :5174 (docker-compose.platform.yml), like
// playwright.platform.config.js, so there is no webServer here:
//   npm run test:e2e:sweep
//
// Its own config because it boots the app once per tool. Sharing a run with the
// other e2e specs starves them: the renderer switches time out.
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: ['panel-sweep.spec.js'],
  timeout: 120000,
  use: {
    baseURL: 'http://localhost:5174',
    headless: true,
    // Software GL so Cesium gets a real WebGL context headless — panels that read
    // the live viewer are then exercising their real path.
    launchOptions: {
      args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
});
