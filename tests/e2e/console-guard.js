import { test as base, expect } from '@playwright/test';

/**
 * Shared e2e fixture: any pageerror or console.error fails the test that caused
 * it. Import `test`/`expect` from here instead of @playwright/test.
 *
 * Level `error` only — the map stacks emit warnings constantly (missing tiles,
 * deprecated GL extensions) and those are not failures.
 */

/**
 * Errors we cannot fix from this repo. Each entry needs a comment saying why.
 * Keep this empty unless a third party leaves no choice — a real error belongs
 * in a bug report, not here.
 */
const ALLOWED = [];

/**
 * Upstream-unavailable statuses the `tolerateGatewayErrors` configs accept.
 * A cold CI runner answers the first analysis calls with a gateway error while
 * the tiletopia container is still warming up; the app absorbs it and the test's
 * own assertions still hold, so failing on it only produces flake. Nothing else
 * belongs in this list: a 4xx is a bug in the request, not a cold upstream.
 */
const TOLERATED_STATUS = [502, 503, 504];

/** Chrome logs a failed subresource/fetch load with the response status. */
const RESOURCE_STATUS = /Failed to load resource: the server responded with a status of (\d{3})/;

/** A resource load that failed with one of the TOLERATED_STATUS codes. */
export function isToleratedGatewayError(line) {
  const match = RESOURCE_STATUS.exec(line);
  return !!match && TOLERATED_STATUS.includes(Number(match[1]));
}

const describeArg = (v) => (v instanceof Error ? `${v.name}: ${v.message}` : String(v));

export const test = base.extend({
  // set by playwright.platform.config.js; the sweep and default configs stay strict
  tolerateGatewayErrors: [false, { option: true }],

  page: async ({ page, tolerateGatewayErrors }, use, testInfo) => {
    const seen = [];
    const resolving = [];

    page.on('pageerror', (e) => seen.push(`pageerror: ${e.message}`));
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const slot = seen.push(`console.error: ${msg.text()}`) - 1;
      // console.error(someError) renders as a useless preview ("An"), so read the
      // arguments back out of the page for a message that names the failure
      resolving.push(
        Promise.all(msg.args().map((a) => a.evaluate(describeArg)))
          .then((parts) => {
            if (parts.length) seen[slot] = `console.error: ${parts.join(' ')}`;
          })
          .catch(() => {}),
      );
    });

    await use(page);
    await Promise.all(resolving);

    const errors = seen.filter((line) => !ALLOWED.some((rx) => rx.test(line)));
    // pageerrors never carry a status, so they can never be tolerated here
    const tolerated = tolerateGatewayErrors ? errors.filter(isToleratedGatewayError) : [];
    const unexpected = errors.filter((line) => !tolerated.includes(line));

    if (tolerated.length) {
      testInfo.annotations.push({
        type: 'warning',
        description: `tolerated upstream errors:\n${tolerated.join('\n')}`,
      });
    }
    expect(unexpected, `browser errors during this test:\n${unexpected.join('\n')}`).toEqual([]);
  },
});

export { expect };
