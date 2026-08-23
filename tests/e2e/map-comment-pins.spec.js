import { test, expect } from './console-guard';
import { mintToken } from '../../scripts/platform-token.mjs';

/**
 * Felt-style map comments against the live platform stack: place a comment
 * through the map context menu, see its pin, reply in the pin's thread box,
 * and prove a websocket peer receives the placed comment.
 *
 *   docker compose -f docker-compose.platform.yml --env-file .env.platform up -d
 *   npx playwright test -c playwright.platform.config.js tests/e2e/map-comment-pins.spec.js
 */

const BROWSER_USER = 'map-comment-e2e';
const BEARER_SUBPROTOCOL = 'bearer';
const MESSAGE_TIMEOUT_MS = 15_000;

function openPeer(origin, documentId, sessionToken) {
  const url = `${origin.replace(/^http/, 'ws')}/agora/ws?doc=${encodeURIComponent(documentId)}`;
  const socket = new WebSocket(url, [BEARER_SUBPROTOCOL, sessionToken]);
  const messages = [];
  socket.addEventListener('message', (event) => messages.push(JSON.parse(String(event.data))));
  const opened = new Promise((resolve, reject) => {
    socket.addEventListener('open', () => resolve());
    socket.addEventListener('error', () =>
      reject(new Error(`the websocket peer could not open ${url}`)),
    );
  });
  return { socket, messages, opened };
}

/** Every key/value the peer has seen, from the join snapshot and live ops. */
function seenEntries(messages) {
  return messages.flatMap((message) => {
    if (message.type === 'op') return [{ key: message.key, value: message.value }];
    if (message.type === 'batch') return message.ops;
    if (message.type === 'snapshot') {
      return Object.entries(message.state ?? {}).flatMap(([namespace, records]) =>
        Object.entries(records ?? {}).map(([id, value]) => ({ key: `${namespace}/${id}`, value })),
      );
    }
    return [];
  });
}

test.describe('map comment pins — live platform stack', () => {
  let peer = null;

  test.afterEach(() => {
    peer?.socket.close();
    peer = null;
  });

  test('a comment placed on the map pins, threads, and reaches a peer', async ({ page }) => {
    test.setTimeout(120_000);

    const token = mintToken({ role: 'editor', sub: BROWSER_USER });
    expect(token, 'PLATFORM_JWT_SECRET is not set, so no live session can be opened').toBeTruthy();

    await page.addInitScript((seed) => {
      localStorage.setItem('viewtopia-tour-done', '1');
      localStorage.setItem('viewtopia_auth', JSON.stringify(seed));
    }, { user: { name: BROWSER_USER }, token });
    await page.goto('/');

    await page.getByRole('button', { name: 'Live', exact: true }).click();
    await page.getByPlaceholder('New live map name…').fill(`pin-e2e-${Date.now()}`);
    await page.getByTestId('start-live-session').click();
    await expect(page.getByTestId('live-document-name')).toBeVisible();

    // place a comment mid-map through the context menu
    const pane = page.getByTestId('viewer-pane-left');
    await pane.click({ button: 'right', position: { x: 400, y: 300 } });
    await page.getByText('Comment here').click();
    await page.getByTestId('map-comment-compose').fill('does this parcel flood?');
    await page.getByTestId('map-comment-submit').click();

    // the pin is on the map and its thread box opened with the text
    await expect(page.getByTestId('comment-pin')).toHaveCount(1);
    await expect(page.getByText('does this parcel flood?')).toBeVisible();

    // reply inside the pin's thread box
    await page.getByRole('button', { name: 'Reply' }).click();
    await page.getByLabel(`Reply to ${BROWSER_USER}`).fill('checking the flood layer');
    await page.getByTestId('comment-reply-submit').click();
    await expect(page.getByText('checking the flood layer')).toBeVisible();

    // a websocket peer that joins through a share link gets the placed
    // thread in its snapshot
    await page.getByRole('button', { name: 'Share this live map' }).click();
    await page.getByText('Can edit', { exact: true }).click();
    await page.getByTestId('create-share-link').click();
    const shareUrl = await page.getByTestId('share-link').inputValue();
    await page.keyboard.press('Escape');

    const origin = new URL(page.url()).origin;
    const shareToken = new URL(shareUrl).searchParams.get('live');
    const resolved = await fetch(
      `${origin}/agora/links/${encodeURIComponent(shareToken)}`,
    ).then((response) => response.json());

    peer = openPeer(origin, resolved.doc, resolved.sessionToken);
    await peer.opened;
    await expect
      .poll(
        () =>
          seenEntries(peer.messages).find(
            (op) =>
              op.key?.startsWith('comments/') &&
              op.value?.text === 'does this parcel flood?' &&
              op.value?.anchor?.placed === true,
          ),
        { timeout: MESSAGE_TIMEOUT_MS, intervals: [100] },
      )
      .toBeTruthy();
  });
});
