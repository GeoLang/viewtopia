import { test, expect } from './console-guard';

/**
 * The chat's mic button against a scripted WhisperLive: the handshake goes
 * first, audio frames follow once the server is ready, each transcript window
 * lands in the input, and stopping sends END_OF_AUDIO. Chromium's fake
 * microphone (see the react config) stands in for a real one.
 *
 * Run: npm run test:e2e:react
 */

const BOOT_TIMEOUT = 60000;

const SERVER_READY = JSON.stringify({ uid: 'e2e', message: 'SERVER_READY', backend: 'faster_whisper' });
const window1 = JSON.stringify({
  uid: 'e2e',
  segments: [{ start: '0.0', end: '0.8', text: ' fly to' }],
});
const window2 = JSON.stringify({
  uid: 'e2e',
  segments: [
    { start: '0.0', end: '0.8', text: ' fly to', completed: true },
    { start: '0.8', end: '1.6', text: ' Paris' },
  ],
});

test('dictation streams the transcript into the chat input', async ({ page }) => {
  await page.route('**/speech/health', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"ok"}' }),
  );

  const seen = { handshake: null, audioFrames: 0, ended: false };
  await page.routeWebSocket(/\/speech\/$/, (ws) => {
    ws.onMessage((message) => {
      if (typeof message === 'string') {
        seen.handshake = JSON.parse(message);
        ws.send(SERVER_READY);
        return;
      }
      if (message.toString() === 'END_OF_AUDIO') {
        seen.ended = true;
        ws.send(window2);
        return;
      }
      seen.audioFrames += 1;
      if (seen.audioFrames === 2) ws.send(window1);
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Show chat' }).click({ timeout: BOOT_TIMEOUT });
  const input = page.getByPlaceholder('Type a message…');
  await input.fill('please');

  await page.getByRole('button', { name: 'Dictate' }).click();
  await expect.poll(() => seen.handshake).toMatchObject({ language: 'en', task: 'transcribe', use_vad: true });
  await expect(page.getByRole('button', { name: 'Stop dictating' })).toBeVisible();
  await expect.poll(() => seen.audioFrames, { timeout: 15000 }).toBeGreaterThanOrEqual(2);
  await expect(input).toHaveValue('please fly to');

  await page.getByRole('button', { name: 'Stop dictating' }).click();
  await expect.poll(() => seen.ended).toBe(true);
  // the last window still lands after the stop
  await expect(input).toHaveValue('please fly to Paris');
  await expect(page.getByRole('button', { name: 'Dictate' })).toBeVisible();
});

test('no mic button on a stack without the speech service', async ({ page }) => {
  await page.route('**/speech/health', (route) => route.fulfill({ status: 502 }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Show chat' }).click({ timeout: BOOT_TIMEOUT });
  await expect(page.getByPlaceholder('Type a message…')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Dictate' })).toHaveCount(0);
});
