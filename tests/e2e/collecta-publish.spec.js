import { randomUUID } from 'node:crypto';
import { test, expect } from './console-guard';
import { mintToken } from '../../scripts/platform-token.mjs';

/**
 * Publishing field data end to end against the live platform stack: one form
 * with a GeoPoint field, one submission, then the Field Data panel's Publish
 * button, and the point comes back out of ptolemy under the submission's own id.
 *
 *   docker compose -f docker-compose.platform.yml --env-file .env.platform up -d
 *   npx playwright test -c playwright.platform.config.js tests/e2e/collecta-publish.spec.js
 *
 * Collecta has no published port, so seeding goes through the SPA's /collecta
 * proxy, the same prefix the panel uses. Ptolemy is read directly to play a
 * session that never saw the browser.
 */

const COLLECTA = 'http://localhost:5174/collecta/api/v1';
const PTOLEMY = 'http://localhost:3000/api/v1';
// collecta reads the subject as its own user id, so it has to be a uuid
const BROWSER_USER = randomUUID();
const SITE = { latitude: 43.735, longitude: 7.425 };

const MENU_ITEM = '[class*="mantine-Menu-dropdown"] [class*="mantine-Menu-item"]';

async function call(base, path, token, init) {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

function geoPointField() {
  return {
    name: 'location',
    label: 'GPS Location',
    field_type: 'GeoPoint',
    required: true,
    hint: null,
    default: null,
    relevant: null,
    choices: null,
    constraints: [],
    children: null,
  };
}

async function seedForm(token, title) {
  const formId = randomUUID();
  const created = await call(COLLECTA, '/forms', token, {
    method: 'POST',
    body: JSON.stringify({
      id: formId,
      title,
      description: null,
      version: 1,
      fields: [geoPointField()],
    }),
  });
  expect(created.status, JSON.stringify(created.json)).toBe(201);
  return formId;
}

async function seedSubmission(token, formId) {
  const submissionId = randomUUID();
  const now = new Date().toISOString();
  const filed = await call(COLLECTA, `/forms/${formId}/submissions`, token, {
    method: 'POST',
    body: JSON.stringify({
      id: submissionId,
      form_id: formId,
      form_version: 1,
      values: {
        location: { GeoPoint: { ...SITE, altitude: null, accuracy: null } },
      },
      started_at: now,
      completed_at: now,
      device_location: null,
      collector_id: null,
      status: 'Complete',
      attachments: [],
    }),
  });
  expect(filed.status, JSON.stringify(filed.json)).toBe(201);
  return submissionId;
}

async function signIn(page, token) {
  await page.addInitScript(
    (seed) => {
      localStorage.setItem('viewtopia-tour-done', '1');
      localStorage.setItem('viewtopia-first-run', 'dismissed');
      localStorage.setItem('viewtopia_auth', JSON.stringify(seed));
    },
    { user: { name: BROWSER_USER }, token },
  );
  await page.goto('/');
  await page.waitForFunction(() => !!window.__viewtopiaMap, null, { timeout: 60_000 });
}

test.describe('the Field Data panel publishes a form into ptolemy', () => {
  test('a published submission is a ptolemy feature under its own id', async ({ page }) => {
    test.setTimeout(180_000);

    const token = mintToken({ role: 'admin', sub: BROWSER_USER });
    expect(token, 'PLATFORM_JWT_SECRET is not set, so no authenticated publish is possible').toBeTruthy();

    const formTitle = `publish-e2e-${Date.now()}`;
    const formId = await seedForm(token, formTitle);
    const submissionId = await seedSubmission(token, formId);

    await signIn(page, token);

    await page.getByRole('button', { name: 'Data' }).click();
    await page.locator(MENU_ITEM).filter({ hasText: 'Field Data' }).first().click();

    await page.getByPlaceholder('Pick a form').click();
    await page.getByRole('option', { name: `${formTitle} (v1)` }).click();
    await expect(page.getByTestId('collecta-counts')).toContainText('1 submission');

    const publishReply = page.waitForResponse((res) =>
      res.url().endsWith(`/collecta/api/v1/forms/${formId}/publish`),
    );
    await page.getByTestId('collecta-publish').click();
    const published = await (await publishReply).json();
    expect(published.published).toBe(1);

    await expect(page.getByText('Published 1 submission, 0 skipped')).toBeVisible();
    await expect(page.getByTestId('collecta-published')).toHaveText('1 in dataset');
    await expect(page.getByTestId('collecta-publish')).toHaveText('Publish again');

    await page.getByRole('button', { name: 'Layers' }).click();
    await expect(page.getByText(`ptolemy-branch-${published.branch_id}`)).toBeVisible();

    const features = await call(PTOLEMY, `/branches/${published.branch_id}/features`, token);
    expect(features.status, JSON.stringify(features.json)).toBe(200);
    expect(features.json.features).toHaveLength(1);
    expect(features.json.features[0].id).toBe(submissionId);
  });
});
