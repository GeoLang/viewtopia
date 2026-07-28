import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // its css module scripts don't load under node/jsdom, and no unit test
      // renders the web component itself
      '@panoramax/web-viewer': new URL('./tests/unit/stubs/empty.ts', import.meta.url).pathname,
    },
  },
  test: {
    include: ['tests/unit/**/*.test.{js,ts,tsx}'],
    environment: 'jsdom',
  },
});
