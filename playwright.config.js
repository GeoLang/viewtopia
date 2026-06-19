import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  // golden-path.spec.js targets the live docker-compose stack, not the dev server —
  // run it via `npm run test:e2e:platform` (playwright.platform.config.js).
  testIgnore: ['golden-path.spec.js', 'react-smoke.spec.js'],
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:5174',
    headless: true,
  },
  webServer: {
    command: 'npx vite --port 5174',
    port: 5174,
    reuseExistingServer: true,
    timeout: 60000,
  },
});
