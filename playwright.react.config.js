import { defineConfig } from '@playwright/test';

// Smoke test for the React front-end (index.html, the default since the Track 2
// cutover). Boots a Vite dev server on its own port (5175) so it can run
// alongside a platform stack on 5174. Verifies the app actually mounts and
// renders without runtime errors — the gap that build + tsc cannot catch.
//
//   npm run test:e2e:react
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: [
    'react-smoke.spec.js',
    'panels-smoke.spec.js',
    'agent-layers.spec.js',
    'tools-across-renderers.spec.js',
    'default-boot.spec.js',
    'embed-messaging.spec.js',
    'overlay-import.spec.js',
  ],
  // cesium on swiftshader runs the heaviest tests here at 40-44s on a loaded
  // box, and the specs' own 30-60s waits only report anything under a larger
  // total. same budget as the other two swiftshader configs.
  timeout: 120000,
  // one worker on CI: two concurrent Cesium tabs on swiftshader starve the
  // runner's cores until clicks and evaluate never dispatch
  workers: process.env.CI ? 1 : undefined,
  use: {
    baseURL: 'http://localhost:5175',
    headless: true,
    // Software GL so Cesium gets a real WebGL context headless — without it the
    // viewer is absent and renderer tests can only assert a no-viewer branch.
    launchOptions: {
      args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  webServer: {
    command: 'npx vite --port 5175 --strictPort',
    port: 5175,
    reuseExistingServer: true,
    timeout: 120000,
  },
});
