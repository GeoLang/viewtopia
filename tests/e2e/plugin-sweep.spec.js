import { test, expect } from '@playwright/test';
import { MENU_ITEM, openApp } from './panel-helpers';

/**
 * Every plugin panel behind the Plugins menu, checked like the registry tools in
 * panel-sweep.spec.js: opens, mounts something, logs no error, closes on Escape.
 *
 * The plugin list cannot be read at collect time — registry.ts discovers plugins
 * with import.meta.glob, which only resolves in a build. So it comes from the app
 * itself (`window.__viewtopiaPlugins`, set in src/plugins/registry.ts) once it has
 * loaded, which makes this one test with a step per plugin. Every failure is
 * attributed to its plugin and they are reported together, so one broken plugin
 * does not hide the rest.
 *
 * Console errors are collected here instead of by the console-guard fixture,
 * which can only fail the whole test and would lose that attribution.
 *
 * Run: npm run test:e2e:sweep
 */

/**
 * Plugin panel roots vary (most are a Paper, logistics and real-estate are a bare
 * Tabs), so the check is structural rather than class-based: opening a panel adds
 * exactly one element next to the viewer, or one modal in a portal.
 */
const PANEL = 'main > *, [class*="mantine-Modal-content"]';

/**
 * Panels that talk to a keyed third party: with no key configured they render a
 * configure-a-key state and send nothing to `host`, so this sweep also checks
 * that state is up and that host stayed untouched.
 */
const NEEDS_KEY = {
  // the three jawg tile previews answer 400 without an access token
  'basemap-catalog': { testId: 'basemap-needs-key', host: 'tile.jawg.io' },
  // the google embed answers 401 when built with an empty key. The panel opens
  // on the keyless mapillary provider, so switch to google first: the state
  // under test is google-without-a-key.
  'street-view': {
    testId: 'street-view-needs-key',
    host: 'google.com/maps/embed',
    prepare: (panel) => panel.getByText('Google', { exact: true }).click(),
  },
};

/** how long a panel's own requests may stay on the wire before we give up on them */
const DRAIN_MS = 15000;

/** after the wire is quiet, the console events for the last responses still have to arrive */
const SETTLE_MS = 300;

const BOOT = 'app boot';

const firstLine = (e) => String(e && e.message ? e.message : e).split('\n')[0];

test('plugin panel sweep', async ({ page }) => {
  // one boot, then an open/close cycle per plugin inside it. Each plugin can
  // hold the drain for its full 15s while basemap tiles stream, so the honest
  // worst case is minutes, not the default 120s.
  test.setTimeout(600000);

  const errors = new Map();
  /** request url -> whoever was open when it started */
  const requester = new Map();
  /** requests still on the wire -> whoever started them */
  const pending = new Map();
  let current = BOOT;

  const note = (who, line) => errors.set(who, [...(errors.get(who) ?? []), line]);
  const linesFor = (who) => errors.get(who) ?? [];

  page.on('request', (req) => {
    requester.set(req.url(), current);
    pending.set(req, current);
  });
  const offWire = (req) => pending.delete(req);
  page.on('requestfinished', offWire);
  page.on('requestfailed', offWire);

  page.on('pageerror', (e) => note(current, `pageerror: ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    // The browser logs a failed load against the request's own url, and that can
    // land seconds after the panel that made it was closed. Blame the panel that
    // started the request, not whatever is open when the response comes back.
    const url = msg.location()?.url;
    const who = (url && requester.get(url)) ?? current;
    // name the resource too, so the summary says which request failed
    const at = url && msg.text().startsWith('Failed to load resource') ? ` (${url})` : '';
    note(who, `console.error: ${msg.text()}${at}`);
  });

  /** wait out `who`'s requests (all of them when `who` is undefined), then the console */
  const drain = async (who) => {
    const deadline = Date.now() + DRAIN_MS;
    const busy = () =>
      who === undefined ? pending.size > 0 : [...pending.values()].includes(who);
    while (busy() && Date.now() < deadline) await page.waitForTimeout(50);
    await page.waitForTimeout(SETTLE_MS);
  };

  await openApp(page);

  const plugins = await page.evaluate(() => window.__viewtopiaPlugins ?? []);
  expect(plugins.length, 'plugins enumerated from the loaded app').toBeGreaterThan(0);

  const closed = await page.locator(PANEL).count();
  const stepFailure = new Map();

  for (const plugin of plugins) {
    current = plugin.id;
    const keyed = NEEDS_KEY[plugin.id];
    try {
      await test.step(plugin.id, async () => {
        await page.getByRole('button', { name: /^Plugins/ }).click();
        await page.locator(MENU_ITEM).filter({ hasText: plugin.name }).first().click();

        await expect(page.locator(PANEL)).toHaveCount(closed + 1);
        const panel = page.locator(PANEL).last();
        await expect(panel).toBeVisible();
        await expect(panel).toHaveText(/\S/);

        if (keyed) {
          if (keyed.prepare) await keyed.prepare(panel);
          await expect(panel.getByTestId(keyed.testId).first()).toBeVisible();
        }

        // Drain while the panel is still mounted: closing it first cancels its
        // in-flight requests, and a cancelled load never reaches the console.
        await drain(plugin.id);

        if (keyed) {
          const sent = [...requester]
            .filter(([url, who]) => who === plugin.id && url.includes(keyed.host))
            .map(([url]) => url);
          expect(sent, `requests to ${keyed.host} without a key`).toEqual([]);
        }

        await page.keyboard.press('Escape');
        await expect(page.locator(PANEL)).toHaveCount(closed);

        expect(linesFor(plugin.id), 'browser errors').toEqual([]);
      });
    } catch (e) {
      stepFailure.set(plugin.id, firstLine(e));
      // leave the app clean for the next plugin
      await page.keyboard.press('Escape').catch(() => {});
      await page
        .locator(PANEL)
        .nth(closed)
        .waitFor({ state: 'detached', timeout: 2000 })
        .catch(() => {});
    }
  }

  // a slow response can still be out when its own step ends, so the verdict is
  // taken once the wire is quiet — by then every error sits under its own plugin
  current = 'after sweep';
  await drain();

  const failed = [];
  for (const { id } of plugins) {
    const reasons = [stepFailure.get(id), ...linesFor(id)].filter(Boolean);
    if (reasons.length) failed.push(`${id}: ${reasons.join(' | ')}`);
  }

  const boot = [...linesFor(BOOT), ...linesFor('after sweep')];
  expect(boot, `browser errors outside any plugin:\n${boot.join('\n')}`).toEqual([]);
  expect(failed, `plugin panels that failed the sweep:\n${failed.join('\n')}`).toEqual([]);
});
