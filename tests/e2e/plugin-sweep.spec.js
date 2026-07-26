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

/** Plugins that fail this sweep today, keyed by plugin id with the error they hit. */
const FIXME = {
  // three keyless tile previews (https://tile.jawg.io/jawg-{streets,dark,terrain})
  // answer 400, which the browser logs as console.error
  'basemap-catalog': 'jawg basemap previews request without an API key',
  // the embed is built with an empty key (…/maps/embed/v1/streetview?key=&…) and
  // Google answers 401
  'street-view': 'google streetview embed requests without an API key',
};

/** how long a panel's own requests may stay on the wire before we give up on them */
const DRAIN_MS = 15000;

/** after the wire is quiet, the console events for the last responses still have to arrive */
const SETTLE_MS = 300;

const BOOT = 'app boot';

const firstLine = (e) => String(e && e.message ? e.message : e).split('\n')[0];

test('plugin panel sweep', async ({ page }) => {
  // one boot, then an open/close cycle per plugin inside it
  test.setTimeout(300000);

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
    const broken = FIXME[plugin.id];
    try {
      await test.step(`${plugin.id}${broken ? ` [fixme: ${broken}]` : ''}`, async () => {
        await page.getByRole('button', { name: /^Plugins/ }).click();
        await page.locator(MENU_ITEM).filter({ hasText: plugin.name }).first().click();

        await expect(page.locator(PANEL)).toHaveCount(closed + 1);
        const panel = page.locator(PANEL).last();
        await expect(panel).toBeVisible();
        await expect(panel).toHaveText(/\S/);

        // Drain while the panel is still mounted: closing it first cancels its
        // in-flight requests, and a cancelled load never reaches the console.
        await drain(plugin.id);

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
  const known = [];
  for (const { id } of plugins) {
    const reasons = [stepFailure.get(id), ...linesFor(id)].filter(Boolean);
    if (reasons.length) (FIXME[id] ? known : failed).push(`${id}: ${reasons.join(' | ')}`);
    else if (FIXME[id]) known.push(`${id}: passes now, drop it from FIXME`);
  }

  if (known.length) {
    test.info().annotations.push({
      type: 'warning',
      description: `known-broken plugins:\n${known.join('\n')}`,
    });
  }

  const boot = [...linesFor(BOOT), ...linesFor('after sweep')];
  expect(boot, `browser errors outside any plugin:\n${boot.join('\n')}`).toEqual([]);
  expect(failed, `plugin panels that failed the sweep:\n${failed.join('\n')}`).toEqual([]);
});
