import { test, expect } from '@playwright/test';
import { mintToken } from '../../scripts/platform-token.mjs';

/**
 * Dictation against the real Aavaaz container, spoken by chromium's fake
 * microphone. dictation.spec.js scripts the WebSocket and so proves the client
 * logic; this one proves the two things only a real server settles: chrome
 * accepting the 101 with `Sec-WebSocket-Protocol: bearer`, and
 * `AudioContext({ sampleRate: 16000 })` taking the mic stream.
 *
 * Needs a platform stack up on 5174, including aavaaz.
 *
 *   npx playwright test --config playwright.dictation-live.config.js
 */

const BROWSER_USER = 'dictation-live';
const BOOT_TIMEOUT = 60000;
// the fixture is 3.1s and chromium loops it, and the model needs a window or
// two of audio before it emits anything
const TRANSCRIPT_TIMEOUT = 90000;

test('the real speech service transcribes the mic into the chat input', async ({ page }) => {
  const token = mintToken({ role: 'editor', sub: BROWSER_USER });
  expect(token, 'PLATFORM_JWT_SECRET is not set, so aavaaz refuses the handshake').toBeTruthy();

  const health = await page.request.get('/speech/health');
  expect(health.status(), 'aavaaz is not up: docker compose up -d aavaaz').toBe(200);

  await page.addInitScript(
    (seed) => {
      localStorage.setItem('viewtopia-tour-done', '1');
      localStorage.setItem('viewtopia_auth', JSON.stringify(seed));
    },
    { user: { name: BROWSER_USER }, token },
  );

  const closedBeforeReady = [];
  page.on('websocket', (ws) => {
    if (!ws.url().includes('/speech/')) return;
    ws.on('socketerror', (error) => closedBeforeReady.push(error));
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Show chat' }).click({ timeout: BOOT_TIMEOUT });

  const input = page.getByPlaceholder('Type a message…');
  await expect(input).toBeVisible();

  // the button only renders once /speech/health answers, so its presence is the
  // probe passing against the real container
  await page.getByRole('button', { name: 'Dictate' }).click();

  // reaching 'listening' means the socket opened and SERVER_READY came back,
  // which is the bearer subprotocol being accepted
  await expect(page.getByRole('button', { name: 'Stop dictating' })).toBeVisible({ timeout: 60000 });
  expect(closedBeforeReady, 'the speech socket errored').toEqual([]);

  await expect
    .poll(async () => (await input.inputValue()).toLowerCase(), { timeout: TRANSCRIPT_TIMEOUT })
    .toContain('paris');

  await page.getByRole('button', { name: 'Stop dictating' }).click();
  await expect(page.getByRole('button', { name: 'Dictate' })).toBeVisible();

  // the transcript stays for editing, it is not sent
  expect((await input.inputValue()).toLowerCase()).toContain('paris');
});
