import { test, expect } from './console-guard';
import {
  ANALYSIS_MENU,
  SIMULATE_MENU,
  TOOLS_MENU,
  DATA_MENU,
  MORE_MENU,
} from '../../src/components/toolMenus';

/**
 * Every tool panel in the registry, opened through the real menu path.
 *
 * The tool list comes from toolMenus.ts itself, so a tool added to a menu shows
 * up here as a new test case with no edit to this file. Preview tools are hidden
 * by default, so the persisted setting is written before the app boots.
 *
 * Targets the platform stack on :5174, i.e. the production bundle. React only
 * logs its dev warnings in a dev build, so against `vite` this sweep can find
 * errors it cannot find here.
 *
 * Run: npm run test:e2e:sweep
 */

/** which toolbar button opens each registry menu (see ViewerToolbar.tsx) */
const MENU_BUTTONS = [
  ['Analysis', ANALYSIS_MENU],
  ['Simulate', SIMULATE_MENU],
  ['Tools', TOOLS_MENU],
  ['Data', DATA_MENU],
  ['More', MORE_MENU],
];

const TOOLS = MENU_BUTTONS.flatMap(([button, sections]) =>
  sections.flat().map((item) => ({ ...item, button })),
);

// A panel is either a Paper appended next to the viewer or, for Catalog and
// Dashboards, a Mantine modal in a portal.
const PANEL = 'main > [class*="mantine-Paper-root"], [class*="mantine-Modal-content"]';

const MENU_ITEM = '[class*="mantine-Menu-dropdown"] [class*="mantine-Menu-item"]';

/** Panels that fail this sweep today, keyed by panel with the error they hit. */
const FIXME = {
  // GET /api/v1/portal/items answers 401 Unauthorized, which the browser logs as
  // console.error: "Failed to load resource ... 401 (Unauthorized)"
  portal: 'catalog items request returns 401',
};

async function openApp(page) {
  await page.addInitScript(() => {
    // zustand/persist store for useAppStore ('viewtopia-app'); merge() backfills
    // every key we leave out
    localStorage.setItem(
      'viewtopia-app',
      JSON.stringify({ state: { settings: { showPreviewTools: true } }, version: 0 }),
    );
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Analysis' })).toBeVisible();
  // let the default renderer finish booting, so its errors land in no test but
  // this one and panels that read the live viewer see it
  await page.waitForFunction(() => !!window.__viewtopiaViewer, null, { timeout: 60000 });
}

test.describe('tool panel sweep', () => {
  // each case is an independent app boot, so let them share the workers
  test.describe.configure({ mode: 'parallel' });

  for (const tool of TOOLS) {
    const broken = FIXME[tool.panel];
    const title = `${tool.panel} — ${tool.button} ▸ ${tool.label}${broken ? ` [fixme: ${broken}]` : ''}`;

    const body = async ({ page }) => {
      await openApp(page);

      await page.getByRole('button', { name: tool.button }).click();
      await page.locator(MENU_ITEM).filter({ hasText: tool.label }).first().click();

      const panel = page.locator(PANEL);
      await expect(panel).toHaveCount(1);
      await expect(panel).toBeVisible();
      await expect(panel).toHaveText(/\S/);

      await page.keyboard.press('Escape');
      await expect(panel).toHaveCount(0);
    };

    if (broken) test.fixme(title, body);
    else test(title, body);
  }
});
