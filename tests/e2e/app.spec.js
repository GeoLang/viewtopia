import { test, expect } from '@playwright/test';

test.describe('ViewTopia UI', () => {
  test('page loads with title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('ViewTopia');
  });

  test('header is visible', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#header h1')).toHaveText('ViewTopia');
  });

  test('tabs are present', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.tab[data-tab="globe"]')).toBeVisible();
    await expect(page.locator('.tab[data-tab="map"]')).toBeVisible();
    await expect(page.locator('.tab[data-tab="image"]')).toBeVisible();
    await expect(page.locator('.tab[data-tab="table"]')).toBeVisible();
  });

  test('renderer selector is present', async ({ page }) => {
    await page.goto('/');
    const select = page.locator('#renderer-choice');
    await expect(select).toBeVisible();
    await expect(select).toHaveValue('cesium');
  });

  test('toolbar buttons are present', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#measure-btn')).toBeVisible();
    await expect(page.locator('#annotate-btn')).toBeVisible();
    await expect(page.locator('#pick-btn')).toBeVisible();
  });

  test('chat panel toggles', async ({ page }) => {
    await page.goto('/');
    const chatPanel = page.locator('#chat-panel');
    const toggleBtn = page.locator('#toggle-chat-btn');
    await toggleBtn.click();
    // Chat panel should toggle visibility
    await expect(chatPanel).toBeVisible();
  });

  test('tab switching works', async ({ page }) => {
    await page.goto('/');
    await page.locator('.tab[data-tab="map"]').click();
    await expect(page.locator('#map-container')).toHaveClass(/active/);
    await page.locator('.tab[data-tab="globe"]').click();
    await expect(page.locator('#globe-container')).toHaveClass(/active/);
  });

  test('geocoding input is present', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#geocode-input')).toBeVisible();
  });

  test('theme toggle works', async ({ page }) => {
    await page.goto('/');
    const themeBtn = page.locator('#theme-toggle');
    await expect(themeBtn).toBeVisible();
    await themeBtn.click();
    await expect(page.locator('body')).toHaveClass(/light-theme/);
    await themeBtn.click();
    await expect(page.locator('body')).not.toHaveClass(/light-theme/);
  });

  test('keyboard shortcut ? shows help', async ({ page }) => {
    await page.goto('/');
    // Close any tour first
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await page.keyboard.press('?');
    await expect(page.locator('#shortcut-help')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#shortcut-help')).not.toBeVisible();
  });
});
