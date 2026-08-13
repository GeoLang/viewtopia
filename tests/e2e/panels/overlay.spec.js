import { test, expect } from '../console-guard';
import { MENU_ITEM, PANEL, openApp } from '../panel-helpers';
import { syntheticNtv2 } from '../../unit/stubs/syntheticNtv2';

/**
 * The image overlay panel georeferences a dropped image by world file + .prj
 * (through the vendored projicio wasm) or by two clicks on the map, and this
 * is the only place that path runs in a real browser.
 *
 * Run: npx playwright test -c playwright.panels.config.js tests/e2e/panels/overlay.spec.js
 */

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const UTM_18N_PRJ =
  'PROJCS["NAD_1983_UTM_Zone_18N",GEOGCS["GCS_North_American_1983",DATUM["D_North_American_1983",SPHEROID["GRS_1980",6378137.0,298.257222101]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",-75.0],PARAMETER["Scale_Factor",0.9996],PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]';

/** one empty 200x100 page, with a correct xref so pdfjs parses it silently */
function minimalPdf() {
  const objects = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 100]>>',
  ];
  let body = '%PDF-1.4\n';
  const offsets = [];
  for (const [index, content] of objects.entries()) {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${content}\nendobj\n`;
  }
  const xrefStart = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(body);
}

async function openOverlayPanel(page) {
  await openApp(page);
  await page.getByRole('button', { name: 'Data' }).click();
  await page.locator(MENU_ITEM).filter({ hasText: 'Image Overlay' }).first().click();
  const panel = page.locator(PANEL).filter({ hasText: 'Image Overlay' });
  await expect(panel).toHaveCount(1);
  return panel;
}

test('a png with a lon/lat world file places itself and becomes a layer', async ({ page }) => {
  const panel = await openOverlayPanel(page);

  await panel.locator('input[type="file"]').setInputFiles([
    { name: 'plan.png', mimeType: 'image/png', buffer: ONE_PIXEL_PNG },
    { name: 'plan.pgw', mimeType: 'text/plain', buffer: Buffer.from('0.001\n0\n0\n-0.001\n7.0\n46.0\n') },
  ]);
  await expect(panel.getByTestId('overlay-source')).toContainText('world file');

  await expect(panel.getByTestId('overlay-west')).toHaveValue(/6\.9995/);
  await expect(panel.getByTestId('overlay-north')).toHaveValue(/46\.0005/);

  await panel.getByTestId('overlay-keep').click();
  await expect(page.locator(PANEL).filter({ hasText: 'Image Overlay' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Layers' }).click();
  const layerPanel = page.locator(PANEL).filter({ hasText: 'Layers (' });
  await expect(layerPanel.getByText('Layers (1)')).toBeVisible();
  await expect(layerPanel.getByText('plan.png')).toBeVisible();
});

test('a utm world file with a .prj georeferences through projicio wasm', async ({ page }) => {
  const panel = await openOverlayPanel(page);

  await panel.locator('input[type="file"]').setInputFiles([
    { name: 'site.png', mimeType: 'image/png', buffer: ONE_PIXEL_PNG },
    { name: 'site.pgw', mimeType: 'text/plain', buffer: Buffer.from('2\n0\n0\n-2\n585000.5\n4510000.5\n') },
    { name: 'site.prj', mimeType: 'text/plain', buffer: Buffer.from(UTM_18N_PRJ) },
  ]);
  // the placement effect compiles projicio wasm right after this render, which
  // can starve a loaded box before the source line paints, so the first
  // observable after the drop gets the long leash, like raster's first op
  await expect(panel.getByTestId('overlay-source')).toContainText('.prj', { timeout: 30000 });

  // 585000E 4510000N in UTM 18N is near -73.993, 40.737
  await expect(panel.getByTestId('overlay-west')).toHaveValue(/-73\.99/, { timeout: 30000 });
  await expect(panel.getByTestId('overlay-north')).toHaveValue(/40\.73/);
});

const NAD27_PRJ =
  'GEOGCS["NAD27",DATUM["North_American_Datum_1927",SPHEROID["Clarke 1866",6378206.4,294.9786982138982,AUTHORITY["EPSG","7008"]],AUTHORITY["EPSG","6267"]],PRIMEM["Greenwich",0,AUTHORITY["EPSG","8901"]],UNIT["degree",0.0174532925199433,AUTHORITY["EPSG","9122"]],AUTHORITY["EPSG","4267"]]';

test('a dropped .gsb datum grid georeferences a nad27 plan', async ({ page }) => {
  const panel = await openOverlayPanel(page);
  // the sidecar must satisfy the transform on its own: any fetch here 404s and
  // the console guard turns that into a failure
  await page.route('**/grids/**', (route) => route.fulfill({ status: 404 }));

  await panel.locator('input[type="file"]').setInputFiles([
    { name: 'site.png', mimeType: 'image/png', buffer: ONE_PIXEL_PNG },
    { name: 'site.pgw', mimeType: 'text/plain', buffer: Buffer.from('0.001\n0\n0\n-0.001\n-100\n35\n') },
    { name: 'site.prj', mimeType: 'text/plain', buffer: Buffer.from(NAD27_PRJ) },
    // the filename is how a definition's grid list finds it, so it carries a
    // name nad27 actually asks for
    {
      name: 'ntv2_0.gsb',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from(syntheticNtv2(30, 40, 90, 110, 1, 1, 2)),
    },
  ]);
  await expect(panel.getByTestId('overlay-source')).toContainText('datum grid');

  // the synthetic grid shifts 2 arc seconds west and 1 north off the nad27 corners
  await expect(panel.getByTestId('overlay-west')).toHaveValue(/-100\.00105/, { timeout: 30000 });
  await expect(panel.getByTestId('overlay-north')).toHaveValue(/35\.00077/);
});

test('a projected world file without a .prj reports the missing sidecar', async ({ page }) => {
  const panel = await openOverlayPanel(page);

  await panel.locator('input[type="file"]').setInputFiles([
    { name: 'site.png', mimeType: 'image/png', buffer: ONE_PIXEL_PNG },
    { name: 'site.pgw', mimeType: 'text/plain', buffer: Buffer.from('2\n0\n0\n-2\n585000.5\n4510000.5\n') },
  ]);
  await expect(panel.getByTestId('overlay-error')).toContainText('.prj');
});

test('a pdf page renders and places by two clicks on the map', async ({ page }) => {
  const panel = await openOverlayPanel(page);

  await panel.locator('input[type="file"]').setInputFiles({
    name: 'plan.pdf',
    mimeType: 'application/pdf',
    buffer: minimalPdf(),
  });
  await expect(panel.getByTestId('overlay-source')).toContainText('2048×1024', {
    timeout: 30000,
  });

  await panel.getByTestId('overlay-place').click();
  await expect(panel.getByTestId('overlay-place')).toContainText('north-west');
  await page.mouse.click(300, 300);
  await expect(panel.getByTestId('overlay-place')).toContainText('south-east');
  await page.mouse.click(450, 400);

  await expect(panel.getByTestId('overlay-west')).toBeVisible();
  const west = Number(await panel.getByTestId('overlay-west').inputValue());
  const east = Number(await panel.getByTestId('overlay-east').inputValue());
  expect(east).toBeGreaterThan(west);
  await panel.getByTestId('overlay-keep').click();

  await page.getByRole('button', { name: 'Layers' }).click();
  const layerPanel = page.locator(PANEL).filter({ hasText: 'Layers (' });
  await expect(layerPanel.getByText('plan.pdf')).toBeVisible();
});
