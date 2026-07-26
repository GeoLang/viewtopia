import { defineConfig } from '@playwright/test';

// per-panel functional suite (layer 2): one spec file per menu group under
// tests/e2e/panels/, against the live platform stack. nightly in CI, not per-push.
export default defineConfig({
  testDir: 'tests/e2e/panels',
  timeout: 120000,
  // matches the sweep config: parallel webgl instances get flaky above this
  workers: 4,
  // four swiftshader Cesium contexts next to the docker stack oversubscribe the
  // box, and a starved worker can blow the timeout in fixture setup before the
  // test body ever runs (seen on terrainAnalysis). The retry lands when the queue
  // has drained, so it passes. Any test failing on both attempts is a real defect.
  retries: 1,
  use: {
    baseURL: 'http://localhost:5174',
    headless: true,
    launchOptions: {
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
});
