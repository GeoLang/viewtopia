import { defineConfig } from '@playwright/test';

// Smoke test for the REACT front-end (index-react.html). Boots a Vite dev server
// on its own port (5175) so it can run alongside the platform stack's vanilla
// container on 5174. Verifies the React app actually mounts and renders without
// runtime errors — the gap that build + tsc cannot catch.
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
