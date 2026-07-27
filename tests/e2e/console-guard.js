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

const describeArg = (v) => (v instanceof Error ? `${v.name}: ${v.message}` : String(v));

export const test = base.extend({
  page: async ({ page }, use) => {
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

    const unexpected = seen.filter((line) => !ALLOWED.some((rx) => rx.test(line)));
    expect(unexpected, `browser errors during this test:\n${unexpected.join('\n')}`).toEqual([]);
  },
});

export { expect };
