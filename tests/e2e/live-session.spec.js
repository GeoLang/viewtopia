import { randomUUID } from 'node:crypto';
import { test, expect } from './console-guard';
import { MENU_ITEM, PANEL } from './panel-helpers.js';
import { mintToken } from '../../scripts/platform-token.mjs';

/**
 * Live multiplayer E2E against the live platform stack (docker-compose.platform.yml).
 *
 * One real browser client driving the viewer UI plus one raw websocket peer in
 * this process. The browser proves the app's own client works through nginx; the
 * peer stands in for the second participant, so the assertions are ordered
 * rather than racing two browsers. Between them this covers nginx's websocket
 * upgrade on /agora/, agora's fan-out, and both directions of the viewtopia
 * client.
 *
 * Run: docker compose -f docker-compose.platform.yml up -d && npm run test:e2e:platform
 */

/** `sub` of the browser's platform token, and the name its own avatar shows. */
const BROWSER_USER = 'live-e2e-browser';

/** Everyone who joins through a share link is called this (agora's GUEST_NAME). */
const GUEST_NAME = 'guest';

/** Marker for the token on a websocket handshake, see src/lib/apiAuth.ts. */
const BEARER_SUBPROTOCOL = 'bearer';

const BROWSER_ANNOTATION = 'placed in the browser';
const PEER_ANNOTATION = 'placed by the peer';

const MESSAGE_TIMEOUT_MS = 15_000;

function openPeer(origin, documentId, sessionToken) {
  const url = `${origin.replace(/^http/, 'ws')}/agora/ws?doc=${encodeURIComponent(documentId)}&since=0`;
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

async function waitForMessage(peer, matches, description) {
  await expect
    .poll(() => peer.messages.some(matches), {
      message: description,
      timeout: MESSAGE_TIMEOUT_MS,
      intervals: [50],
    })
    .toBe(true);
  return peer.messages.find(matches);
}

/** Ops as the peer sees them, whether the server relayed one or a batch. */
function relayedOperations(messages) {
  return messages.flatMap((message) => {
    if (message.type === 'op') return [{ key: message.key, value: message.value }];
    if (message.type === 'batch') return message.ops;
    return [];
  });
}

function waitForOperation(peer, matches, description) {
  return expect
    .poll(() => relayedOperations(peer.messages).find(matches), {
      message: description,
      timeout: MESSAGE_TIMEOUT_MS,
      intervals: [50],
    })
    .toBeTruthy();
}

test.describe('Live multiplayer — live platform stack', () => {
  let peer = null;

  // an open socket keeps the worker alive past the test
  test.afterEach(() => {
    peer?.socket.close();
    peer = null;
  });

  test('an edit travels between the browser client and a second peer', async ({ page }) => {
    test.setTimeout(120_000);

    // agora refuses to start without the shared secret, so a stack running
    // without one cannot serve this test at all
    const token = mintToken({ role: 'editor', sub: BROWSER_USER });
    expect(token, 'PLATFORM_JWT_SECRET is not set, so no live session can be opened').toBeTruthy();

    const documentName = `live-e2e-${Date.now()}`;
    const session = { user: { name: BROWSER_USER }, token };
    await page.addInitScript((seed) => {
      localStorage.setItem('viewtopia-tour-done', '1');
      localStorage.setItem('viewtopia_auth', JSON.stringify(seed));
    }, session);
    await page.goto('/');

    await page.getByRole('button', { name: 'Live', exact: true }).click();
    await page.getByPlaceholder('New live map name…').fill(documentName);
    await page.getByTestId('start-live-session').click();

    // the name reaches this badge only through agora's snapshot, so the
    // websocket upgrade and the document read both worked
    await expect(page.getByTestId('live-document-name')).toHaveText(documentName);

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
    expect(resolved.role).toBe('edit');

    peer = openPeer(origin, resolved.doc, resolved.sessionToken);
    await peer.opened;

    const snapshot = await waitForMessage(
      peer,
      (message) => message.type === 'snapshot',
      'the peer never got a snapshot',
    );
    expect(snapshot.state.meta.name).toBe(documentName);
    expect(snapshot.role).toBe('edit');

    // the browser learns about the peer from the peers frame agora fans out
    await expect(page.getByTestId('live-peers').getByLabel(GUEST_NAME)).toBeVisible();

    await page.getByRole('button', { name: 'Actions' }).click();
    await page.locator(MENU_ITEM).filter({ hasText: 'Annotate' }).first().click();
    const annotatePanel = page.locator(PANEL).filter({ has: page.getByTestId('annotate-count') });

    await page.getByPlaceholder('Annotation label…').fill(BROWSER_ANNOTATION);
    await page.getByRole('button', { name: 'Add at center' }).click();
    await expect(page.getByTestId('annotate-count')).toHaveText('1');

    await waitForOperation(
      peer,
      (operation) =>
        operation.key.startsWith('annotations/') && operation.value?.label === BROWSER_ANNOTATION,
      'the browser edit never reached the peer',
    );

    const fromPeer = {
      id: randomUUID(),
      label: PEER_ANNOTATION,
      color: '#34d399',
      lat: 43.7325,
      lng: 7.4198,
      createdAt: Date.now(),
    };
    const clientSeq = 1;
    peer.socket.send(
      JSON.stringify({
        type: 'op',
        clientSeq,
        key: `annotations/${fromPeer.id}`,
        value: fromPeer,
      }),
    );
    await waitForMessage(
      peer,
      (message) => message.type === 'ack' && message.clientSeq === clientSeq,
      'agora never acked the peer edit',
    );

    await expect(page.getByTestId('annotate-count')).toHaveText('2');
    await expect(annotatePanel.getByText(PEER_ANNOTATION)).toBeVisible();
  });
});
