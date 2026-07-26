import fs from 'fs/promises';
import { test, expect } from '../console-guard';
import { PANEL, MENU_ITEM, openApp } from '../panel-helpers.js';

/**
 * Functional smoke for Tools ▸ Data Table, Collaborate, Print/Export against the
 * live platform stack on :5174. Each test drives the panel's primary action and
 * asserts the value it produces, not just that the panel opened.
 *
 * Run: npx playwright test -c playwright.panels.config.js tests/e2e/panels/tools-2.spec.js
 */

/** Four features, two of them sharing an owner, spread far enough apart that a fly-to is unambiguous. */
const PARCELS = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { parcel: 'A-100', owner: 'Ivanov', zone: 'residential' },
      geometry: { type: 'Point', coordinates: [-122.42, 37.78] },
    },
    {
      type: 'Feature',
      properties: { parcel: 'B-200', owner: 'Ivanov', zone: 'commercial' },
      geometry: { type: 'Point', coordinates: [151.21, -33.87] },
    },
    {
      type: 'Feature',
      properties: { parcel: 'C-300', owner: 'Okafor', zone: 'industrial' },
      geometry: { type: 'Point', coordinates: [2.35, 48.86] },
    },
    {
      type: 'Feature',
      properties: { parcel: 'D-400', owner: 'Tanaka', zone: 'residential' },
      geometry: { type: 'Point', coordinates: [139.69, 35.69] },
    },
  ],
};

/** Chat history holding one replayable agent result, the UI path that puts a layer on the globe. */
const SESSION = {
  id: 'tools-2-session',
  name: 'Session 1',
  messages: [
    { id: 'u1', role: 'user', content: 'show parcels', timestamp: 1 },
    {
      id: 'a1',
      role: 'assistant',
      content: 'Found 4 parcels.',
      timestamp: 2,
      mapSpec: {
        type: 'map',
        layers: [{ name: 'Parcels', file: 'outputs/parcels.geojson', color: '#10b981' }],
      },
    },
  ],
  createdAt: 1,
  updatedAt: 2,
};

/** renderUISpec names the data source after the layer index + file, so the picker label is fixed. */
const LAYER_LABEL = 'agent-layer-0-parcels.geojson (4)';

const PEER = { user_id: 'peer-42', user_name: 'Ada Peer', color: '#22d3ee' };

/** Chat lines the room never fans out, fans out from a peer, and fans back to the sender. */
const CHAT = {
  dropped: 'this line is never fanned out',
  fromPeer: 'a line only the peer sent',
  echoed: 'hello from the smoke test',
};

async function openPanel(page, label) {
  await page.getByRole('button', { name: 'Tools' }).click();
  await page.locator(MENU_ITEM).filter({ hasText: label }).first().click();
}

/** Great-circle km, to compare the camera against a feature's coordinates. */
function haversineKm([lng1, lat1], [lng2, lat2]) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Where the Cesium camera sits, in degrees, plus the parcel the viewer has selected. */
function readViewer(page) {
  return page.evaluate(() => {
    const v = window.__viewtopiaViewer;
    const c = v.camera.positionCartographic;
    return {
      lng: (c.longitude * 180) / Math.PI,
      lat: (c.latitude * 180) / Math.PI,
      selectedParcel: v.selectedEntity?.properties?.parcel?.getValue() ?? null,
    };
  });
}

/** Width/height out of a PNG's IHDR chunk. */
function pngSize(buf) {
  expect([...buf.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

test.describe('Tools panels (batch 2)', () => {
  // every case is an independent app boot; three WebGL contexts in one worker
  // wedge the headless GPU process, so let them share the workers
  test.describe.configure({ mode: 'parallel' });

  test('Data Table: a layer fills the table, filters it and flies to a row', async ({ page }) => {
    // the agent backend is not in the loop: serve the layer file the replayed
    // result asks for, which is the same fetch a live agent reply triggers
    await page.route('**/agent/geojson/**', (route) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(PARCELS) }),
    );
    await page.addInitScript((session) => {
      localStorage.setItem(
        'viewtopia-chat',
        JSON.stringify({
          state: { sessions: [session], activeSessionId: session.id },
          version: 0,
        }),
      );
    }, SESSION);

    await openApp(page);

    // put the parcels on the globe, so the panel has a data source to read
    await page.getByTitle('Click to replay this result on the map').click();
    await page.waitForFunction(
      () => {
        const v = window.__viewtopiaViewer;
        if (!v || v.isDestroyed?.()) return false;
        for (let i = 0; i < v.dataSources.length; i++) {
          if (v.dataSources.get(i).name?.startsWith('agent-layer-')) return true;
        }
        return false;
      },
      null,
      { timeout: 60000 },
    );

    await openPanel(page, 'Data Table');
    const panel = page.locator(PANEL).filter({ hasText: 'Attribute Table' });
    await expect(panel).toBeVisible();
    // the layer is on the globe, so this is the "pick one" empty state, not the
    // "nothing loaded" one: match the whole string so the two cannot be confused
    await expect(
      panel.getByText('Select a layer to view its features. Click a row to fly to the feature.', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(panel.getByText('No layers loaded on the globe.')).toHaveCount(0);
    await expect(panel.locator('tbody tr')).toHaveCount(0);

    await panel.getByPlaceholder('Select layer…').click();
    await page.getByRole('option', { name: LAYER_LABEL }).click();

    // columns come from the features' property bag, in first-seen order
    await expect(panel.locator('thead th')).toHaveText(['parcel', 'owner', 'zone']);
    await expect(panel.locator('tbody tr')).toHaveCount(4);
    await expect(panel.getByText('4/4', { exact: true })).toBeVisible();
    await expect(panel.locator('tbody tr').nth(0)).toHaveText('A-100Ivanovresidential');

    // filtering matches any attribute value, case-insensitively
    await panel.getByPlaceholder('Filter…').fill('ivanov');
    await expect(panel.locator('tbody tr')).toHaveCount(2);
    await expect(panel.getByText('2/4', { exact: true })).toBeVisible();
    await expect(panel.locator('tbody tr')).toHaveText([
      'A-100Ivanovresidential',
      'B-200Ivanovcommercial',
    ]);
    await panel.getByPlaceholder('Filter…').fill('commercial');
    await expect(panel.locator('tbody tr')).toHaveCount(1);

    await panel.getByPlaceholder('Filter…').fill('');
    await expect(panel.locator('tbody tr')).toHaveCount(4);

    // clicking a row selects that entity and flies the camera to it: do two rows
    // an ocean apart, so the second click can only be read as a camera move
    const sanFrancisco = PARCELS.features[0].geometry.coordinates;
    const sydney = PARCELS.features[1].geometry.coordinates;

    const before = await readViewer(page);
    expect(before.selectedParcel).toBeNull();
    expect(haversineKm([before.lng, before.lat], sanFrancisco)).toBeGreaterThan(1000);

    await panel.locator('tbody tr').filter({ hasText: 'A-100' }).click();
    await expect
      .poll(async () => {
        const v = await readViewer(page);
        return haversineKm([v.lng, v.lat], sanFrancisco);
      }, { timeout: 30000 })
      .toBeLessThan(200);
    const atSanFrancisco = await readViewer(page);
    expect(atSanFrancisco.selectedParcel).toBe('A-100');
    expect(haversineKm([atSanFrancisco.lng, atSanFrancisco.lat], sydney)).toBeGreaterThan(1000);

    await panel.locator('tbody tr').filter({ hasText: 'B-200' }).click();
    await expect
      .poll(async () => {
        const v = await readViewer(page);
        return haversineKm([v.lng, v.lat], sydney);
      }, { timeout: 30000 })
      .toBeLessThan(200);
    expect((await readViewer(page)).selectedParcel).toBe('B-200');

    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
  });

  test('Collaborate: joining a room lists peers and round-trips a chat message', async ({
    page,
  }) => {
    // The room socket is the panel's only data path and nothing serves it:
    // /api/v1/realtime/<room> 404s (nginx sends /api/ to ptolemy, and tiletopia
    // never mounts its realtime ws_handler). So stand in for the server here: the
    // frames the panel sends are recorded, and the replies are the shapes
    // tiletopia's realtime module defines.
    const sent = [];
    const socketUrls = [];
    /** The room side of the socket, so this test can push frames at a chosen moment. */
    let room = null;
    await page.routeWebSocket(/\/api\/v1\/realtime\//, (ws) => {
      room = ws;
      socketUrls.push(ws.url());
      ws.onMessage((raw) => {
        const msg = JSON.parse(String(raw));
        sent.push(msg);
        if (msg.type === 'Join') {
          ws.send(
            JSON.stringify({
              type: 'Presence',
              users: [
                { user_id: msg.user_id, user_name: msg.user_name, color: '#a78bfa' },
                PEER,
              ],
            }),
          );
        }
        // fan-out is the room's call, not the sender's: only the line below comes
        // back, so anything the room drops must never show up in the panel
        if (msg.type === 'Chat' && msg.message === CHAT.echoed) ws.send(JSON.stringify(msg));
      });
    });

    await openApp(page);
    await openPanel(page, 'Collaborate');

    const panel = page.locator(PANEL).filter({ hasText: 'Collaboration' });
    await expect(panel).toBeVisible();
    await expect(panel.getByText('Users')).toHaveCount(0);
    await expect(panel.getByText('Chat')).toHaveCount(0);

    await panel.getByLabel('Your Name').fill('Playwright Tester');
    await panel.getByLabel('Room ID').fill('tools-2-room');
    await panel.getByRole('button', { name: 'Join Room' }).click();

    // the presence reply becomes the online count and the user list
    await expect(panel.getByText('2 online')).toBeVisible();
    await expect(panel.getByText('tools-2-room')).toBeVisible();
    await expect(panel.getByText('Playwright Tester (you)')).toBeVisible();
    await expect(panel.getByText('Ada Peer', { exact: true })).toBeVisible();

    // and the join frame carried the room and the name typed above, on the URL
    // tiletopia's realtime module is mounted at
    expect(socketUrls).toEqual(['ws://localhost:5174/api/v1/realtime/tools-2-room']);
    expect(sent[0]).toMatchObject({
      type: 'Join',
      asset_id: 'tools-2-room',
      user_name: 'Playwright Tester',
    });
    const localUserId = sent[0].user_id;

    /** One <p> per rendered chat line; the sender/message spans sit inside it. */
    const chatLines = panel.locator(
      '[class*="mantine-ScrollArea-viewport"] p[class*="mantine-Text-root"]',
    );
    await expect(chatLines).toHaveCount(0);

    // a line the room drops is sent but never rendered: the panel's chat log is
    // the room's fan-out, not a local echo of the input box
    const input = panel.getByPlaceholder('Message…');
    await input.fill(CHAT.dropped);
    await input.press('Enter');
    await expect(input).toHaveValue('');
    await expect
      .poll(() => sent.filter((m) => m.type === 'Chat').length, { timeout: 15000 })
      .toBe(1);
    await expect(chatLines).toHaveCount(0);

    // a line the client never typed, pushed from the room: server-authored
    // snake_case fields have to survive into the rendered sender and body
    await room.send(
      JSON.stringify({
        type: 'Chat',
        user_id: PEER.user_id,
        user_name: PEER.user_name,
        message: CHAT.fromPeer,
        timestamp: new Date().toISOString(),
      }),
    );
    await expect(chatLines).toHaveText([`Ada Peer: ${CHAT.fromPeer}`]);

    // and the client's own line, this time fanned back out
    await input.fill(CHAT.echoed);
    await input.press('Enter');
    await expect(input).toHaveValue('');
    // arrival order, with the dropped line still missing
    await expect(chatLines).toHaveText([
      `Ada Peer: ${CHAT.fromPeer}`,
      `Playwright Tester: ${CHAT.echoed}`,
    ]);

    const chat = sent.filter((m) => m.type === 'Chat');
    expect(chat.map((m) => m.message)).toEqual([CHAT.dropped, CHAT.echoed]);
    expect(chat[1]).toMatchObject({
      type: 'Chat',
      user_id: localUserId,
      user_name: 'Playwright Tester',
      message: CHAT.echoed,
    });
    expect(Date.parse(chat[1].timestamp)).toBeGreaterThan(0);

    // a later presence frame replaces the roster: the peer drops out of the list
    // and the count follows the room, not the client
    await room.send(
      JSON.stringify({
        type: 'Presence',
        users: [{ user_id: localUserId, user_name: 'Playwright Tester', color: '#a78bfa' }],
      }),
    );
    await expect(panel.getByText('1 online')).toBeVisible();
    await expect(panel.getByText('Ada Peer', { exact: true })).toHaveCount(0);
    await expect(panel.getByText('Playwright Tester (you)')).toBeVisible();
    // the peer's chat line stays: presence and history are separate state
    await expect(chatLines).toHaveCount(2);

    // joining also starts the camera broadcast the other clients follow
    await expect
      .poll(() => sent.filter((m) => m.type === 'Camera').length, { timeout: 15000 })
      .toBeGreaterThan(0);
    const camera = sent.find((m) => m.type === 'Camera');
    for (const key of ['latitude', 'longitude', 'zoom', 'bearing', 'pitch']) {
      expect(Number.isFinite(camera[key]), `Camera.${key} is finite`).toBe(true);
    }

    // leaving tears the room down and returns the panel to its join form
    await panel.getByRole('button', { name: 'Leave' }).click();
    await expect(panel.getByRole('button', { name: 'Join Room' })).toBeVisible();
    expect(sent.at(-1)).toMatchObject({ type: 'Leave', asset_id: 'tools-2-room' });

    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
  });

  test('Print/Export: exporting downloads an image of the live canvas', async ({ page }) => {
    await openApp(page);
    await openPanel(page, 'Print/Export');

    const panel = page.locator(PANEL).filter({ hasText: 'Print / Export' });
    await expect(panel).toBeVisible();

    // nothing downloads until Export is clicked, so the count below is the
    // before-state of every export in this test
    const downloads = [];
    page.on('download', (d) => downloads.push(d));

    // the drawing-buffer size of the canvas the panel is about to read
    const canvasSize = await page
      .locator('#cesium-container canvas')
      .first()
      .evaluate((c) => ({ width: c.width, height: c.height }));
    expect(canvasSize.width).toBeGreaterThan(0);

    // ask for an output size that is nothing like the canvas, and confirm the
    // panel took the values. re-rendering the form must not produce a status or
    // a file: only Export does
    await panel.getByLabel('Width').fill('640');
    await panel.getByLabel('Height').fill('480');
    await panel.getByLabel('DPI').fill('300');
    await expect(panel.getByLabel('Width')).toHaveValue('640');
    await expect(panel.getByLabel('Height')).toHaveValue('480');
    await expect(panel.getByLabel('DPI')).toHaveValue('300');
    expect(downloads).toHaveLength(0);
    await expect(panel.getByText('Exported!')).toHaveCount(0);

    const [pngDownload] = await Promise.all([
      page.waitForEvent('download'),
      panel.getByRole('button', { name: 'Export' }).click(),
    ]);
    await expect(panel.getByText('Exported!')).toBeVisible();
    expect(downloads).toHaveLength(1);
    expect(pngDownload.suggestedFilename()).toBe('viewtopia-export.png');

    // TODO: Width/Height/DPI are dead controls. handleExport calls
    // canvas.toDataURL() and never resizes, so the file is the drawing buffer and
    // the 640x480 asked for above is dropped. asserted, not just noted, so the
    // day it starts working this fails instead of passing quietly
    const png = await fs.readFile(await pngDownload.path());
    expect(pngSize(png)).toEqual(canvasSize);
    expect(pngSize(png)).not.toEqual({ width: 640, height: 480 });

    // a snapshot of the globe, not an empty frame: decode it back and count the
    // pixels that differ from the scene's background
    const litFraction = await page.evaluate(async (base64) => {
      const img = new Image();
      img.src = `data:image/png;base64,${base64}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const { data } = ctx.getImageData(0, 0, c.width, c.height);
      let lit = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] + data[i + 1] + data[i + 2] > 24) lit++;
      }
      return lit / (data.length / 4);
    }, png.toString('base64'));
    expect(litFraction).toBeGreaterThan(0.05);

    // the chosen format reaches the encoder: JPEG bytes, JPEG extension
    await panel.getByLabel('Format').click();
    await page.getByRole('option', { name: 'JPEG' }).click();
    const [jpgDownload] = await Promise.all([
      page.waitForEvent('download'),
      panel.getByRole('button', { name: 'Export' }).click(),
    ]);
    expect(downloads).toHaveLength(2);
    expect(jpgDownload.suggestedFilename()).toBe('viewtopia-export.jpg');
    const jpg = await fs.readFile(await jpgDownload.path());
    expect([...jpg.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
    expect(jpg.length).toBeGreaterThan(1000);

    // TODO: the PDF option is not implemented. format 'pdf' misses both branches
    // in handleExport, so it re-exports the PNG under a .png name. pinned here so
    // the option cannot stay broken silently
    await panel.getByLabel('Format').click();
    await page.getByRole('option', { name: 'PDF' }).click();
    const [pdfDownload] = await Promise.all([
      page.waitForEvent('download'),
      panel.getByRole('button', { name: 'Export' }).click(),
    ]);
    expect(downloads).toHaveLength(3);
    expect(pdfDownload.suggestedFilename()).toBe('viewtopia-export.png');
    const pdf = await fs.readFile(await pdfDownload.path());
    expect(pngSize(pdf)).toEqual(canvasSize);
    expect([...pdf.subarray(0, 4)]).not.toEqual([0x25, 0x50, 0x44, 0x46]);

    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
  });
});
