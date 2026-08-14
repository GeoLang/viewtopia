import { test as base, expect } from '@playwright/test';
import { serveBasemapsLocally } from './local-basemap';

/**
 * Shared e2e fixture: any pageerror or console.error fails the test that caused
 * it, and the page's basemap assets come from disk (see local-basemap.js).
 * Import `test`/`expect` from here instead of @playwright/test.
 *
 * Level `error` only — the map stacks emit warnings constantly (missing tiles,
 * deprecated GL extensions) and those are not failures.
 */

/**
 * Errors we cannot fix from this repo. Each entry needs a comment saying why.
 * Keep this empty unless a third party leaves no choice — a real error belongs
 * in a bug report, not here.
 */
const ALLOWED = [
  // backend discovery probes these on boot, and the terrain panel asks for the
  // bundle list on mount; with no platform stack running (this suite starts
  // none) the dev proxy answers 500, and running without a backend is a
  // supported state, not an app error
  /Failed to load resource.*\/(tiles\/v1\/(health|terrain\/bundles)|agent\/health)/,
];

/** Per-page allowances, for a test that drives a failure on purpose. */
const perTest = new WeakMap();

/**
 * Let this test's page log console errors matching `rx`. For a test that makes
 * the app fail deliberately, where the error is the behaviour under test.
 */
export function allowConsoleError(page, rx) {
  perTest.get(page)?.push(rx);
}

const describeArg = (v) => (v instanceof Error ? `${v.name}: ${v.message}` : String(v));

export const test = base.extend({
  page: async ({ page }, use) => {
    const seen = [];
    const resolving = [];
    perTest.set(page, []);

    await serveBasemapsLocally(page);

    page.on('pageerror', (e) => seen.push(`pageerror: ${e.message}`));
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      // resource failures ("Failed to load resource") carry the URL only in
      // location(), and the allow list needs it to match precisely
      const url = msg.location()?.url;
      const suffix = url ? ` (${url})` : '';
      const slot = seen.push(`console.error: ${msg.text()}${suffix}`) - 1;
      // console.error(someError) renders as a useless preview ("An"), so read the
      // arguments back out of the page for a message that names the failure
      resolving.push(
        Promise.all(msg.args().map((a) => a.evaluate(describeArg)))
          .then((parts) => {
            if (parts.length) seen[slot] = `console.error: ${parts.join(' ')}${suffix}`;
          })
          .catch(() => {}),
      );
    });

    await use(page);
    await Promise.all(resolving);

    const allowed = [...ALLOWED, ...perTest.get(page)];
    const unexpected = seen.filter((line) => !allowed.some((rx) => rx.test(line)));
    expect(unexpected, `browser errors during this test:\n${unexpected.join('\n')}`).toEqual([]);
  },
});

export { expect };
