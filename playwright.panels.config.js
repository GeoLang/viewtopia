import { defineConfig } from '@playwright/test';

// per-panel functional suite (layer 2): one spec file per menu group under
// tests/e2e/panels/, against the live platform stack. nightly in CI, not per-push.
export default defineConfig({
  testDir: 'tests/e2e/panels',
  timeout: 120000,
  // parallel webgl instances get flaky above 4 locally. the ci runner also
  // carries the docker stack and even 2 workers starved, so ci runs serial.
  workers: process.env.CI ? 1 : 4,
  // a starved worker can blow the timeout in fixture setup before the test body
  // ever runs (seen on terrainAnalysis). the retry lands when the queue has
  // drained, so it passes.
  retries: 1,
  use: {
    baseURL: 'http://localhost:5174',
    headless: true,
    launchOptions: {
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
});
