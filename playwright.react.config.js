import { defineConfig } from '@playwright/test';

// Smoke test for the React front-end (index.html, the default since the Track 2
// cutover). Boots a Vite dev server on its own port (5175) so it can run
// alongside a platform stack on 5174. Verifies the app actually mounts and
// renders without runtime errors — the gap that build + tsc cannot catch.
//
//   npm run test:e2e:react
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: 'react-smoke.spec.js',
  timeout: 60000,
  use: {
    baseURL: 'http://localhost:5175',
    headless: true,
  },
  webServer: {
    command: 'npx vite --port 5175 --strictPort',
    port: 5175,
    reuseExistingServer: true,
    timeout: 120000,
  },
});
