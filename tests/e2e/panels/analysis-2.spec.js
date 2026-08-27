import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect } from '../console-guard';
import { PANEL, MENU_ITEM, openApp } from '../panel-helpers.js';

/**
 * Functional smoke for Analysis ▸ Profile, Statistics, Space-Time against the
 * live platform stack on :5174. Each test drives the panel's primary action and
 * asserts the value it produces, not just that the panel opened.
 *
 * Run: npx playwright test -c playwright.panels.config.js tests/e2e/panels/analysis-2.spec.js
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 3 entities / 15 positions, already used by the track-import smoke. */
const TRACKS_CSV = path.resolve(__dirname, '../../fixtures/sample-tracks.csv');

/**
 * Two clusters of identical coordinates, so a 500 m grid bins them into exactly
 * two cells no matter where the cell boundaries fall.
 */
const CLUSTERED_POINTS = JSON.stringify({
  type: 'FeatureCollection',
  features: [
    ...[7, 11, 13].map((value) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-0.1, 51.5] },
      properties: { value },
    })),
    ...[3, 5].map((value) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [10.0, 45.0] },
      properties: { value },
    })),
  ],
});

/** Timestamps of the first and last CSV row, the range the player must show. */
const TRACK_TIME_MIN = Date.parse('2024-01-15T08:00:00Z');
const TRACK_TIME_MAX = Date.parse('2024-01-15T08:22:00Z');

/** Same sphere as the panel's own haversine, so km totals are comparable. */
function haversineKm([lng1, lat1], [lng2, lat2]) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function openPanel(page, label) {
  await page.getByRole('button', { name: 'Analysis' }).click();
  await page.locator(MENU_ITEM).filter({ hasText: label }).first().click();
}

test.describe('Analysis panels (batch 2)', () => {
  // every case is an independent app boot; three WebGL contexts in one worker
  // wedge the headless GPU process, so let them share the workers
  test.describe.configure({ mode: 'parallel' });

  test('Profile: a drawn line generates its elevation profile', async ({ page }) => {
    // Open-Elevation is a third-party DEM service, so serve a ramp of one metre
    // per sample: the stats line then pins down how many points the panel really
    // sampled and gain/loss over them. The requested locations are also the only
    // record of which coordinates the panel sampled, so keep them.
    const elevationRequests = [];
    await page.route('https://api.open-elevation.com/**', async (route) => {
      const locations = new URL(route.request().url()).searchParams.get('locations') ?? '';
      elevationRequests.push(locations);
      const results = locations.split('|').map((_, i) => ({ elevation: 100 + i }));
      await route.fulfill({ json: { results } });
    });

    await openApp(page);
    await openPanel(page, 'Profile');

    const panel = page.locator(PANEL).filter({ hasText: 'Terrain Profile' });
    await expect(panel).toBeVisible();

    const lineSelect = panel.getByLabel('Profile Line');
    await expect(lineSelect).toHaveValue('');

    // draw a 3-vertex line on the live globe: click, click, double-click to finish
    const clicks = [[0.45, 0.3], [0.55, 0.35], [0.65, 0.3]];
    await panel.getByRole('button', { name: 'Draw Line' }).click();
    const canvas = page.locator('#cesium-container canvas').first();
    const box = await canvas.boundingBox();
    const at = (fx, fy) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy });
    for (const [fx, fy] of clicks.slice(0, 2)) {
      const p = at(fx, fy);
      await page.mouse.click(p.x, p.y);
    }
    const last = at(...clicks[2]);
    await page.mouse.dblclick(last.x, last.y);

    // the finished line landed in the draw store and the panel selected it
    await expect(lineSelect).toHaveValue('Drawn line #1');

    // where those pixels sit on the globe, asked of the camera the draw tool used
    // and while it is still where it was for the clicks: Generate flies it away
    const clickedCoords = await page.evaluate((fracs) => {
      const v = window.__viewtopiaViewer;
      const c = v.scene.canvas;
      return fracs.map(([fx, fy]) => {
        const cart = v.camera.pickEllipsoid({ x: c.clientWidth * fx, y: c.clientHeight * fy });
        const carto = v.scene.globe.ellipsoid.cartesianToCartographic(cart);
        return [(carto.longitude * 180) / Math.PI, (carto.latitude * 180) / Math.PI];
      });
    }, clicks);

    await panel.getByLabel('Samples').fill('20');
    await panel.getByRole('button', { name: 'Generate' }).click();

    await expect(panel.locator('svg[aria-label="elevation profile"]')).toBeVisible();
    const stats = panel.getByTestId('terrainprofile-stats');
    // 20 samples -> 21 points -> elevations 100..120, monotonic climb
    await expect(stats).toContainText('min 100 m · max 120 m · +20 m / -0 m');

    // the DEM request carries the coordinates the panel actually sampled: 21 of
    // them, running from the first click to the last
    const sampled = elevationRequests.at(-1).split('|').map((s) => {
      const [lat, lng] = s.split(',').map(Number);
      return [lng, lat];
    });
    expect(sampled).toHaveLength(21);
    // ~13 km per pixel at this zoom, so allow a pixel or so of click rounding
    expect(haversineKm(sampled[0], clickedCoords[0])).toBeLessThan(20);
    expect(haversineKm(sampled.at(-1), clickedCoords[2])).toBeLessThan(20);

    // and the reported total is the length of that 3-vertex line, not just non-zero
    const expectedKm =
      haversineKm(clickedCoords[0], clickedCoords[1]) +
      haversineKm(clickedCoords[1], clickedCoords[2]);
    const km = Number(/^([\d.]+) km/.exec(await stats.innerText())[1]);
    expect(expectedKm).toBeGreaterThan(100);
    // geodesic resampling costs ~0.3% against the straight leg-by-leg total
    expect(km).toBeGreaterThan(expectedKm * 0.98);
    expect(km).toBeLessThan(expectedKm * 1.02);

    // the sampled line is added to the live scene as its own data source
    const sources = await page.evaluate(() => {
      const v = window.__viewtopiaViewer;
      if (!v || v.isDestroyed?.()) return null;
      const out = [];
      for (let i = 0; i < v.dataSources.length; i++) out.push(v.dataSources.get(i).name);
      return out;
    });
    expect(sources).toContain('agent-layer-terrain-profile-line');

    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
  });

  test('Statistics: pasted points aggregate into a deck.gl grid', async ({ page }) => {
    await openApp(page);
    await openPanel(page, 'Statistics');

    const panel = page.locator(PANEL).filter({ hasText: 'Spatial Statistics' });
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId('spatialstats-result')).toHaveCount(0);

    await panel.getByLabel('GeoJSON').fill(CLUSTERED_POINTS);
    // Mean rather than Sum: deck.gl's GridLayer already defaults to SUM, so a
    // panel that never forwarded the choice would still look right
    await panel.getByLabel('Aggregation').click();
    await page.getByRole('option', { name: 'Mean' }).click();
    // the property list is derived from the pasted features
    await panel.getByLabel('Numeric Property').click();
    await page.getByRole('option', { name: 'value' }).click();
    // one Run only: with the deck globe rendering on swiftshader the panel stops
    // taking clicks, so everything the run depends on is set above
    await panel.getByRole('button', { name: 'Run', exact: true }).click();

    // the summary reduces each cell with the chosen method, so these are the mean
    // "value" per cell (31/3 and 8/2), never the 3 and 2 points a count reports
    const result = panel.getByTestId('spatialstats-result');
    for (const line of [
      'points: 5',
      'cells: 2',
      'method: mean(value)',
      'min/cell: 4',
      'max/cell: 10.33',
    ]) {
      await expect(result).toContainText(line);
    }

    // running switches to the renderer that hosts deck layers and adds the grid
    await expect(page.locator('#maplibre-container canvas').first()).toBeVisible();
    await page.waitForFunction(
      () =>
        (window.__viewtopiaDeck?.props?.layers ?? []).some((l) =>
          String(l?.id).startsWith('panel-grid-'),
        ),
      null,
      { timeout: 30000 },
    );

    // the aggregation, the property and the cell size only reach the GridLayer,
    // so read them off the live layer: the weights are the pasted "value"s, and
    // MEAN is the mapped form of the chosen aggregation, not a deck.gl default
    const gridProps = await page.evaluate(() => {
      const layer = (window.__viewtopiaDeck?.props?.layers ?? []).find((l) =>
        String(l?.id).startsWith('panel-grid-'),
      );
      if (!layer) return null;
      const p = layer.props;
      return {
        colorAggregation: p.colorAggregation,
        elevationAggregation: p.elevationAggregation,
        cellSize: p.cellSize,
        colorWeights: p.data.map((d) => p.getColorWeight(d)).sort((a, b) => a - b),
        elevationWeights: p.data.map((d) => p.getElevationWeight(d)).sort((a, b) => a - b),
      };
    });
    expect(gridProps).toEqual({
      colorAggregation: 'MEAN',
      elevationAggregation: 'MEAN',
      cellSize: 500,
      colorWeights: [3, 5, 7, 11, 13],
      elevationWeights: [3, 5, 7, 11, 13],
    });

    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
  });

  // the same points under Count, so the two summaries are pinned against each
  // other: a panel that ignored the aggregation would print one of them twice.
  // Its own boot because a run switches the renderer, and the panel takes no
  // further clicks once deck.gl is drawing on swiftshader.
  test('Statistics: Count summarises point counts, not the property', async ({ page }) => {
    await openApp(page);
    await openPanel(page, 'Statistics');

    const panel = page.locator(PANEL).filter({ hasText: 'Spatial Statistics' });
    await expect(panel).toBeVisible();

    await panel.getByLabel('GeoJSON').fill(CLUSTERED_POINTS);
    // count is the default, so the property picker is not even offered
    await expect(panel.getByLabel('Aggregation')).toHaveValue('Count');
    await expect(panel.getByLabel('Numeric Property')).toHaveCount(0);
    await panel.getByRole('button', { name: 'Run', exact: true }).click();

    const result = panel.getByTestId('spatialstats-result');
    for (const line of [
      'points: 5',
      'cells: 2',
      'method: count',
      'min/cell: 2',
      'max/cell: 3',
    ]) {
      await expect(result).toContainText(line);
    }

    // COUNT reaches the layer too, and with no property every point weighs 1
    await page.waitForFunction(
      () =>
        (window.__viewtopiaDeck?.props?.layers ?? []).some((l) =>
          String(l?.id).startsWith('panel-grid-'),
        ),
      null,
      { timeout: 30000 },
    );
    expect(
      await page.evaluate(() => {
        const layer = (window.__viewtopiaDeck?.props?.layers ?? []).find((l) =>
          String(l?.id).startsWith('panel-grid-'),
        );
        return {
          colorAggregation: layer.props.colorAggregation,
          weights: layer.props.data.map((d) => layer.props.getColorWeight(d)),
        };
      }),
    ).toEqual({ colorAggregation: 'COUNT', weights: [1, 1, 1, 1, 1] });

    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
  });

  test('Space-Time: importing a CSV builds entities and tracks', async ({ page }) => {
    await openApp(page);
    await openPanel(page, 'Space-Time');

    const panel = page.locator(PANEL).filter({ hasText: 'Space-Time Intelligence' });
    await expect(panel).toBeVisible();
    // empty-state baseline for the after-import comparison below, no coverage of
    // its own: these strings render off a freshly booted store
    await expect(panel.getByText('0 entities', { exact: true })).toBeVisible();
    await expect(panel.getByText('No entities — import data or create one')).toBeVisible();
    await panel.getByRole('tab', { name: 'Timeline' }).click();
    await expect(panel.getByText('Import track data to use the timeline player')).toBeVisible();
    await expect(panel.getByRole('slider')).toHaveCount(0);
    await panel.getByRole('tab', { name: 'Entities' }).click();

    await panel.locator('input[type="file"]').setInputFiles(TRACKS_CSV);

    const importStatus = panel.getByTestId('spacetime-import-status');
    await expect(importStatus).toHaveText('Imported 3 entities, 15 positions', {
      timeout: 30000,
    });
    await expect(panel.getByText('3 entities', { exact: true })).toBeVisible();
    await expect(panel.getByText('3 tracks', { exact: true })).toBeVisible();
    for (const name of ['Alice', 'Bob', 'Charlie']) {
      await expect(panel.getByText(name, { exact: true })).toBeVisible();
    }
    // no kind column, so each imported entity takes the default kind
    await expect(panel.getByText('person', { exact: true })).toHaveCount(3);

    // the CSV timestamps become the timeline player's range: the slider spans the
    // first and last row's epoch, and both ends are labelled with those times
    await panel.getByRole('tab', { name: 'Timeline' }).click();
    await expect(panel.getByText('Import track data to use the timeline player')).toHaveCount(0);
    const thumb = panel.getByRole('slider').first();
    await expect(thumb).toHaveAttribute('aria-valuemin', String(TRACK_TIME_MIN));
    await expect(thumb).toHaveAttribute('aria-valuemax', String(TRACK_TIME_MAX));
    const [minLabel, maxLabel] = await page.evaluate(
      (times) =>
        times.map((t) =>
          new Date(t).toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          }),
        ),
      [TRACK_TIME_MIN, TRACK_TIME_MAX],
    );
    await expect(panel.getByText(minLabel, { exact: true })).toBeVisible();
    await expect(panel.getByText(maxLabel, { exact: true })).toBeVisible();
    await expect(panel.getByText('3 tracks loaded')).toBeVisible();

    // the summary is the record of what the import did, so it survives the tab
    // trip above and any wait: nothing but a new import or a close clears it
    await panel.getByRole('tab', { name: 'Entities' }).click();
    await page.waitForTimeout(5000);
    await expect(importStatus).toHaveText('Imported 3 entities, 15 positions');

    // a second import replaces it rather than stacking a second line
    await panel.locator('input[type="file"]').setInputFiles({
      name: 'one.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('name,lat,lng,timestamp\nDelta,1,2,2024-01-15T09:00:00Z'),
    });
    await expect(importStatus).toHaveText('Imported 1 entities, 1 positions');

    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);

    // reopening starts clean: closing dropped the summary
    await openPanel(page, 'Space-Time');
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId('spacetime-import-status')).toHaveCount(0);
  });
});
