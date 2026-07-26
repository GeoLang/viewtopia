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

/** let console events for the panel we just closed arrive before we read them */
const SETTLE_MS = 200;

const firstLine = (e) => String(e && e.message ? e.message : e).split('\n')[0];

test('plugin panel sweep', async ({ page }) => {
  // one boot, then an open/close cycle per plugin inside it
  test.setTimeout(300000);

  const errors = new Map();
  let current = 'app boot';
  const note = (line) => errors.set(current, [...(errors.get(current) ?? []), line]);
  page.on('pageerror', (e) => note(`pageerror: ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') note(`console.error: ${msg.text()}`);
  });

  await openApp(page);

  const plugins = await page.evaluate(() => window.__viewtopiaPlugins ?? []);
  expect(plugins.length, 'plugins enumerated from the loaded app').toBeGreaterThan(0);

  const closed = await page.locator(PANEL).count();
  const failed = [];
  const known = [];

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

        await page.keyboard.press('Escape');
        await expect(page.locator(PANEL)).toHaveCount(closed);

        await page.waitForTimeout(SETTLE_MS);
        const lines = errors.get(plugin.id) ?? [];
        expect(lines, 'browser errors').toEqual([]);
      });
      if (broken) known.push(`${plugin.id}: passes now, drop it from FIXME`);
    } catch (e) {
      const reason = [firstLine(e), ...(errors.get(plugin.id) ?? [])].join(' | ');
      (broken ? known : failed).push(`${plugin.id}: ${reason}`);
      // leave the app clean for the next plugin
      await page.keyboard.press('Escape').catch(() => {});
      await page
        .locator(PANEL)
        .nth(closed)
        .waitFor({ state: 'detached', timeout: 2000 })
        .catch(() => {});
    }
  }

  if (known.length) {
    test.info().annotations.push({
      type: 'warning',
      description: `known-broken plugins:\n${known.join('\n')}`,
    });
  }

  const boot = errors.get('app boot') ?? [];
  expect(boot, `browser errors before any plugin opened:\n${boot.join('\n')}`).toEqual([]);
  expect(failed, `plugin panels that failed the sweep:\n${failed.join('\n')}`).toEqual([]);
});
