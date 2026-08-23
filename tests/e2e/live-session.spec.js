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

/** `sub` of the member the mention test pings in a second browser context.
 * Unique per run: the stack's database persists locally, and a reused subject
 * would carry unread notifications from earlier runs into the badge count. */
const MENTIONED_USER = `live-e2e-mentioned-${Date.now()}`;

/** Everyone who joins through a share link is called this (agora's GUEST_NAME). */
const GUEST_NAME = 'guest';

/** Marker for the token on a websocket handshake, see src/lib/apiAuth.ts. */
const BEARER_SUBPROTOCOL = 'bearer';

const BROWSER_ANNOTATION = 'placed in the browser';
const PEER_ANNOTATION = 'placed by the peer';

const MESSAGE_TIMEOUT_MS = 15_000;

// no `since`: the peer holds nothing, and claiming since=0 on a document at
// seq 0 reads as already current, so the server would skip the snapshot
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

  test('a mention reaches the member through the notifications bell', async ({
    page,
    browser,
  }) => {
    test.setTimeout(120_000);

    const authorToken = mintToken({ role: 'editor', sub: BROWSER_USER });
    const memberToken = mintToken({ role: 'editor', sub: MENTIONED_USER });
    expect(authorToken, 'PLATFORM_JWT_SECRET is not set, so no live session can be opened').toBeTruthy();

    const documentName = `mention-e2e-${Date.now()}`;
    await page.addInitScript((seed) => {
      localStorage.setItem('viewtopia-tour-done', '1');
      localStorage.setItem('viewtopia_auth', JSON.stringify(seed));
    }, { user: { name: BROWSER_USER }, token: authorToken });
    await page.goto('/');

    await page.getByRole('button', { name: 'Live', exact: true }).click();
    await page.getByPlaceholder('New live map name…').fill(documentName);
    await page.getByTestId('start-live-session').click();
    await expect(page.getByTestId('live-document-name')).toHaveText(documentName);

    const origin = new URL(page.url()).origin;
    const documents = await fetch(`${origin}/agora/documents`, {
      headers: { Authorization: `Bearer ${authorToken}` },
    }).then((response) => response.json());
    const documentId = documents.find((entry) => entry.name === documentName)?.id;
    expect(documentId).toBeTruthy();
    const added = await fetch(
      `${origin}/agora/documents/${documentId}/members/${encodeURIComponent(MENTIONED_USER)}`,
      {
        method: 'PUT',
        headers: { Authorization: `Bearer ${authorToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'view' }),
      },
    );
    expect(added.status).toBe(204);

    // reopening the panel refetches the member list the suggestions come from
    await page.getByRole('button', { name: 'Comments on this live map' }).click();
    const compose = page.getByTestId('comment-compose');
    await compose.fill('flagging this for ');
    await compose.pressSequentially('@');
    await page.getByTestId(`mention-option-${MENTIONED_USER}`).click();
    await expect(compose).toHaveValue(`flagging this for @${MENTIONED_USER} `);
    await page.getByTestId('comment-submit').click();
    await expect(page.getByTestId('comment-count')).toHaveText('1');

    // the mentioned member finds out in their own browser, with no live socket
    const memberContext = await browser.newContext();
    const memberPage = await memberContext.newPage();
    await memberPage.addInitScript((seed) => {
      localStorage.setItem('viewtopia-tour-done', '1');
      localStorage.setItem('viewtopia-first-run', 'dismissed');
      localStorage.setItem('viewtopia_auth', JSON.stringify(seed));
    }, { user: { name: MENTIONED_USER }, token: memberToken });
    await memberPage.goto('/');

    await expect(memberPage.getByTestId('notifications-unread')).toContainText('1');
    await memberPage.getByTestId('notifications-bell').click();
    const entry = memberPage.getByTestId('notification-entry');
    await expect(entry).toContainText(BROWSER_USER);
    await expect(entry).toContainText(documentName);

    await entry.click();
    await expect(memberPage.getByTestId('live-document-name')).toHaveText(documentName);
    const commentsPanel = memberPage.getByTestId('live-comments-panel');
    await expect(commentsPanel.getByText(`@${MENTIONED_USER}`)).toBeVisible();

    await memberContext.close();
  });

  test('a comment deep link opens the document at its thread', async ({
    page,
    context,
    browser,
  }) => {
    test.setTimeout(120_000);

    const authorToken = mintToken({ role: 'editor', sub: BROWSER_USER });
    const memberToken = mintToken({ role: 'editor', sub: MENTIONED_USER });
    expect(authorToken, 'PLATFORM_JWT_SECRET is not set, so no live session can be opened').toBeTruthy();
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    const documentName = `deep-link-e2e-${Date.now()}`;
    await page.addInitScript((seed) => {
      localStorage.setItem('viewtopia-tour-done', '1');
      localStorage.setItem('viewtopia_auth', JSON.stringify(seed));
    }, { user: { name: BROWSER_USER }, token: authorToken });
    await page.goto('/');

    await page.getByRole('button', { name: 'Live', exact: true }).click();
    await page.getByPlaceholder('New live map name…').fill(documentName);
    await page.getByTestId('start-live-session').click();
    await expect(page.getByTestId('live-document-name')).toHaveText(documentName);

    const origin = new URL(page.url()).origin;
    const documents = await fetch(`${origin}/agora/documents`, {
      headers: { Authorization: `Bearer ${authorToken}` },
    }).then((response) => response.json());
    const documentId = documents.find((entry) => entry.name === documentName)?.id;
    const added = await fetch(
      `${origin}/agora/documents/${documentId}/members/${encodeURIComponent(MENTIONED_USER)}`,
      {
        method: 'PUT',
        headers: { Authorization: `Bearer ${authorToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'view' }),
      },
    );
    expect(added.status).toBe(204);

    await page.getByRole('button', { name: 'Comments on this live map' }).click();
    await page.getByTestId('comment-compose').fill('deep link me');
    await page.getByTestId('comment-anchor-toggle').click();
    await page.getByTestId('comment-submit').click();
    await expect(page.getByTestId('comment-count')).toHaveText('1');

    await page.getByTestId('comment-copy-link').click();
    const link = await page.evaluate(() => navigator.clipboard.readText());
    expect(link).toContain(`doc=${documentId}`);
    expect(link).toContain('comment=');

    // the member follows the link in their own browser: same document, the
    // linked thread ringed, the panel read only because their role is view
    const memberContext = await browser.newContext();
    const memberPage = await memberContext.newPage();
    await memberPage.addInitScript((seed) => {
      localStorage.setItem('viewtopia-tour-done', '1');
      localStorage.setItem('viewtopia-first-run', 'dismissed');
      localStorage.setItem('viewtopia_auth', JSON.stringify(seed));
    }, { user: { name: MENTIONED_USER }, token: memberToken });
    await memberPage.goto(link);

    await expect(memberPage.getByTestId('live-document-name')).toHaveText(documentName);
    const commentsPanel = memberPage.getByTestId('live-comments-panel');
    await expect(commentsPanel.getByText('deep link me')).toBeVisible();
    await expect(memberPage.locator('[data-testid="comment-thread"][data-highlighted]')).toBeVisible();
    await expect(memberPage.getByTestId('comments-read-only')).toBeVisible();

    await memberContext.close();
  });

  test('a view link embed renders the map with no chrome', async ({ page, browser }) => {
    test.setTimeout(120_000);

    const authorToken = mintToken({ role: 'editor', sub: BROWSER_USER });
    expect(authorToken, 'PLATFORM_JWT_SECRET is not set, so no live session can be opened').toBeTruthy();

    const documentName = `embed-e2e-${Date.now()}`;
    await page.addInitScript((seed) => {
      localStorage.setItem('viewtopia-tour-done', '1');
      localStorage.setItem('viewtopia_auth', JSON.stringify(seed));
    }, { user: { name: BROWSER_USER }, token: authorToken });
    await page.goto('/');

    await page.getByRole('button', { name: 'Live', exact: true }).click();
    await page.getByPlaceholder('New live map name…').fill(documentName);
    await page.getByTestId('start-live-session').click();
    await expect(page.getByTestId('live-document-name')).toHaveText(documentName);

    const origin = new URL(page.url()).origin;
    const documents = await fetch(`${origin}/agora/documents`, {
      headers: { Authorization: `Bearer ${authorToken}` },
    }).then((response) => response.json());
    const documentId = documents.find((entry) => entry.name === documentName)?.id;
    const minted = await fetch(`${origin}/agora/documents/${documentId}/links`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authorToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'view' }),
    }).then((response) => response.json());

    // an anonymous visitor inside the iframe: no sign in, no chrome, live map,
    // landing at the camera the link carries
    const monacoHash = 'cam=7.42207,43.72750,20000.00000,0.00000,-90.00000&renderer=maplibre';
    const visitorContext = await browser.newContext();
    const visitor = await visitorContext.newPage();
    await visitor.goto(`${origin}/?live=${encodeURIComponent(minted.token)}&embed=1#${monacoHash}`);

    const badge = visitor.getByTestId('embed-badge');
    await expect(badge).toBeVisible();
    await expect(badge).toContainText(documentName);
    const exitHref = await badge.getByRole('link', { name: 'Open in ViewTopia' }).getAttribute('href');
    expect(exitHref).toContain(`live=${encodeURIComponent(minted.token)}`);
    expect(exitHref).not.toContain('embed=');

    await expect(visitor.getByRole('button', { name: 'Live', exact: true })).toBeHidden();
    await expect(visitor.getByRole('button', { name: 'Analysis' })).toBeHidden();
    await expect(visitor.locator('canvas').first()).toBeVisible();

    await expect
      .poll(
        () =>
          visitor.evaluate(() => {
            const map = window.__viewtopiaMap;
            if (!map) return false;
            const center = map.getCenter();
            return Math.abs(center.lng - 7.42207) < 0.5 && Math.abs(center.lat - 43.7275) < 0.5;
          }),
        { message: 'the embed never landed at the camera the link carries', timeout: 15_000 },
      )
      .toBe(true);

    await visitorContext.close();
  });
});
