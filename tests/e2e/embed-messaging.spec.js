import { test, expect } from './console-guard';

/**
 * The postMessage API an ?embed=1 iframe offers its host page. The host here
 * is a bare page holding the iframe, which is exactly the dashboard case the
 * feature exists for.
 *
 * Run: npm run test:e2e:react
 */

const EMBED_URL =
  'http://localhost:5175/?embed=1#cam=7.42207,43.72750,20000.00000,0.00000,-90.00000&renderer=maplibre';

const messagesOfType = (page, type) =>
  page.evaluate(
    (wanted) => window.__messages.filter((m) => m && m.type === wanted),
    type,
  );

test('a host page drives the embed over postMessage', async ({ page }) => {
  // the host must sit on the same localhost origin: under an about:blank
  // parent the iframe loses secure-context APIs the app needs. the collector
  // script runs before the iframe exists, so ready cannot race it.
  await page.route('**/__embed-host__', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<script>
           window.__messages = [];
           window.addEventListener('message', (event) => window.__messages.push(event.data));
         </script>
         <iframe id="embed" src="${EMBED_URL}" width="800" height="450" style="border:0"></iframe>`,
    }),
  );
  await page.goto('/__embed-host__');

  await expect
    .poll(async () => (await messagesOfType(page, 'viewtopia:ready')).length, { timeout: 60000 })
    .toBeGreaterThan(0);

  const frame = page.frames().find((f) => f.url().includes('embed=1'));
  await frame.waitForFunction(() => !!window.__viewtopiaMap, null, { timeout: 60000 });

  // getCamera answers with the hash camera the embed booted at
  await page.evaluate(() => {
    document.getElementById('embed').contentWindow.postMessage(
      { type: 'viewtopia:getCamera', requestId: 'e2e-1' },
      '*',
    );
  });
  await expect
    .poll(async () => {
      const replies = await messagesOfType(page, 'viewtopia:camera');
      const reply = replies.find((m) => m.requestId === 'e2e-1');
      return reply ? Math.abs(reply.camera.longitude - 7.42207) < 0.1 : null;
    })
    .toBe(true);

  // flyTo moves the map, and the move stream reports the new view
  await page.evaluate(() => {
    document.getElementById('embed').contentWindow.postMessage(
      { type: 'viewtopia:flyTo', lng: -122.4, lat: 37.78, zoom: 12 },
      '*',
    );
  });
  await expect
    .poll(
      async () => {
        const events = await messagesOfType(page, 'viewtopia:camera');
        const last = events[events.length - 1];
        return last ? Math.abs(last.camera.longitude - -122.4) < 0.1 : false;
      },
      { timeout: 30000 },
    )
    .toBe(true);

  // a click on the map reaches the host as coordinates
  await frame.locator('#maplibre-container canvas').first().click({ position: { x: 400, y: 225 } });
  await expect
    .poll(async () => (await messagesOfType(page, 'viewtopia:click')).length, { timeout: 15000 })
    .toBeGreaterThan(0);
  const [click] = await messagesOfType(page, 'viewtopia:click');
  expect(Math.abs(click.lng - -122.4)).toBeLessThan(1);
  expect(Math.abs(click.lat - 37.78)).toBeLessThan(1);
});
