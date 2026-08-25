import { test, expect, allowConsoleError } from './console-guard';
import { mintToken } from '../../scripts/platform-token.mjs';

/**
 * P0 item 2 against the live platform stack: attach a dataset to the open
 * project from the Project menu, read the attachment back from ptolemy, then
 * detach it.
 *
 *   docker compose -f docker-compose.platform.yml --env-file .env.platform up -d
 *   npx playwright test -c playwright.platform.config.js tests/e2e/project-datasets.spec.js
 *
 * Ptolemy is reached directly (localhost:3000) to seed the workspace, project
 * and dataset and to read the attachment back. Everything the modal does goes
 * through the SPA's same-origin /api proxy.
 */

const PTOLEMY = 'http://localhost:3000';
const BROWSER_USER = 'project-datasets-e2e';

async function ptolemy(path, token, init) {
  const res = await fetch(`${PTOLEMY}/api/v1${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, text, json };
}

/** Open the SPA already signed in and already on `projectId`. */
async function openProject(page, token, projectId) {
  await page.addInitScript(
    (seed) => {
      localStorage.setItem('viewtopia-tour-done', '1');
      localStorage.setItem('viewtopia-first-run', 'dismissed');
      localStorage.setItem('viewtopia_auth', JSON.stringify(seed.auth));
      localStorage.setItem('viewtopia-active-project', seed.projectId);
    },
    { auth: { user: { name: BROWSER_USER }, token }, projectId },
  );
  await page.goto('/');
  await page.waitForFunction(() => !!window.__viewtopiaMap, null, { timeout: 60_000 });
}

function datasetRow(page, datasetName) {
  return page.getByTestId('project-dataset-row').filter({ hasText: datasetName });
}

test.describe('a project holds the datasets its members reach', () => {
  test('attaching in the browser is what ptolemy reads back', async ({ page }) => {
    test.setTimeout(180_000);

    const token = mintToken({ role: 'admin', sub: BROWSER_USER });
    expect(
      token,
      'PLATFORM_JWT_SECRET is not set, so no authenticated project is possible',
    ).toBeTruthy();

    const workspace = await ptolemy('/workspaces', token, {
      method: 'POST',
      body: JSON.stringify({ name: `project-datasets-e2e-${Date.now()}` }),
    });
    expect(workspace.status, workspace.text).toBe(201);

    const projectName = `datasets-${Date.now()}`;
    const project = await ptolemy(`/workspaces/${workspace.json.id}/projects`, token, {
      method: 'POST',
      body: JSON.stringify({ name: projectName }),
    });
    expect(project.status, project.text).toBe(201);
    const projectId = project.json.id;

    const datasetName = `attach-e2e-${Date.now()}`;
    const dataset = await ptolemy('/datasets', token, {
      method: 'POST',
      body: JSON.stringify({
        name: datasetName,
        srid: 4326,
        geometry_type: 'point',
        created_by: BROWSER_USER,
      }),
    });
    expect(dataset.status, dataset.text).toBe(201);
    const datasetId = dataset.json.id;

    // nobody has saved a map for this project, and 404 is the documented answer
    // for an unset key, which chromium logs as a failed resource
    allowConsoleError(page, /Failed to load resource.*\/state\/map/);
    await openProject(page, token, projectId);

    await page.getByRole('button', { name: projectName }).click();
    await page.getByRole('menuitem', { name: 'Manage Datasets' }).click();

    await expect(page.getByText(`Manage datasets for "${projectName}"`)).toBeVisible();
    await datasetRow(page, datasetName).getByRole('button', { name: 'Attach' }).click();

    await expect
      .poll(async () => (await ptolemy(`/datasets/${datasetId}`, token)).json, { timeout: 20_000 })
      .toMatchObject({ project_id: projectId, visibility: 'private' });

    await datasetRow(page, datasetName).getByRole('button', { name: 'Detach' }).click();

    await expect
      .poll(async () => (await ptolemy(`/datasets/${datasetId}`, token)).json, { timeout: 20_000 })
      .toMatchObject({ project_id: null, visibility: 'private' });
  });
});
