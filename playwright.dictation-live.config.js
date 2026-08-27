import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

// The dictation path against the real Aavaaz container, the one check the fake
// WebSocket in dictation.spec.js cannot make: Chrome accepting the 101 with
// `Sec-WebSocket-Protocol: bearer`, and AudioContext at 16 kHz taking the mic
// stream. Runs against a platform stack already up on 5174 with the `speech`
// profile, so it has no webServer of its own.
//
//   npx playwright test --config playwright.dictation-live.config.js
const REPO = dirname(fileURLToPath(import.meta.url));

// chromium reads this file in a loop in place of a microphone. flite speech,
// 16 kHz mono, a second of silence each side so the VAD ends the utterance.
const FAKE_MIC_WAV = resolve(REPO, 'tests/fixtures/fly-to-paris.wav');

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: ['dictation-live.spec.js'],
  // the model transcribes on the GPU but the page still boots cesium first
  timeout: 180000,
  workers: 1,
  use: {
    baseURL: 'http://localhost:5174',
    headless: true,
    launchOptions: {
      args: [
        '--use-gl=swiftshader',
        '--enable-unsafe-swiftshader',
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        `--use-file-for-fake-audio-capture=${FAKE_MIC_WAV}`,
      ],
    },
  },
});
