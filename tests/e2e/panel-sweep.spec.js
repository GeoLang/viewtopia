import { test, expect } from './console-guard';
import { PANEL, MENU_ITEM, openApp } from './panel-helpers';
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

/** Panels that fail this sweep today, keyed by panel with the error they hit. */
const FIXME = {};

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

  // Space-Time keeps its own store, so it is not in the registry above and the
  // toolbar renders its item by hand. It still has to behave like every panel.
  test('spaceTime — Analysis ▸ Space-Time', async ({ page }) => {
    await openApp(page);

    await page.getByRole('button', { name: 'Analysis' }).click();
    await page.locator(MENU_ITEM).filter({ hasText: 'Space-Time' }).first().click();

    const panel = page.locator(PANEL);
    await expect(panel).toHaveCount(1);
    await expect(panel).toHaveText(/Space-Time Intelligence/);

    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
  });
});
