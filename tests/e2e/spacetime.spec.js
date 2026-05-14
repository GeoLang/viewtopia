import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFile } from 'fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test.describe('Space-Time Panel', () => {
  test.beforeEach(async ({ page }) => {
    // Dismiss the onboarding tour so it doesn't block clicks
    await page.addInitScript(() => {
      localStorage.setItem('viewtopia-tour-done', '1');
    });
    await page.goto('/');
    // Wait for the app to initialize
    await page.waitForSelector('#header h1');
  });

  test('panel is hidden by default', async ({ page }) => {
    const panel = page.locator('#spacetime-panel');
    await expect(panel).toBeHidden();
  });

  test('panel appears after file drop and shows entities', async ({ page }) => {
    const panel = page.locator('#spacetime-panel');

    // Read the test CSV file
    const csvPath = path.resolve(__dirname, '../fixtures/sample-tracks.csv');
    const csvContent = await readFile(csvPath, 'utf-8');

    // Show panel and load data programmatically (simulates drop result)
    await page.evaluate(async (csv) => {
      const { loadSpaceTimeData } = await import('/src/spacetime/panel.js');
      loadSpaceTimeData(csv, 'sample-tracks.csv');
    }, csvContent);

    await expect(panel).toBeVisible();

    // Wait for entities to appear
    await expect(panel.locator('.st-entity')).toHaveCount(3, { timeout: 5000 });

    // Verify entity names
    const names = await panel.locator('.st-entity-name').allTextContents();
    expect(names.sort()).toEqual(['Alice', 'Bob', 'Charlie']);
  });

  test('time slider and play button are present after data load', async ({ page }) => {
    const panel = page.locator('#spacetime-panel');

    // Show panel and load data programmatically
    await page.evaluate(async () => {
      const { loadSpaceTimeData } = await import('/src/spacetime/panel.js');
      const csv = `entity,timestamp,lng,lat
Alice,2024-01-15T08:00:00Z,-122.4,37.7
Alice,2024-01-15T08:05:00Z,-122.5,37.8`;
      loadSpaceTimeData(csv, 'test.csv');
    });

    await expect(panel).toBeVisible();
    await expect(panel.locator('#st-play')).toBeVisible();
    await expect(panel.locator('#st-slider')).toBeVisible();
    await expect(panel.locator('#st-time-label')).not.toBeEmpty();
  });

  test('close button hides the panel', async ({ page }) => {
    const panel = page.locator('#spacetime-panel');

    // Load data to show panel
    await page.evaluate(async () => {
      const { loadSpaceTimeData } = await import('/src/spacetime/panel.js');
      loadSpaceTimeData('entity,timestamp,lng,lat\nA,1705305600000,-122,37', 'x.csv');
    });

    await expect(panel).toBeVisible();
    await panel.locator('#st-close').click();
    await expect(panel).toBeHidden();
  });
});
