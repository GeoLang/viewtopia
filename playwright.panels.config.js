import { defineConfig } from '@playwright/test';

// per-panel functional suite (layer 2): one spec file per menu group under
// tests/e2e/panels/, against the live platform stack. nightly in CI, not per-push.
export default defineConfig({
  testDir: 'tests/e2e/panels',
  timeout: 120000,
  // matches the sweep config locally: parallel webgl instances get flaky above
  // this. the 4-vcpu CI runner also carries the docker stack, and there four
  // swiftshader workers starve even the retries (2026-07-28 nightly: three
  // cesium tests failed both attempts, all pass on a workstation), so CI gets 2.
  workers: process.env.CI ? 2 : 4,
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
