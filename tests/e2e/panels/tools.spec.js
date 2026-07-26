import { test, expect } from '../console-guard';
import { PANEL, MENU_ITEM, openApp } from '../panel-helpers';

/**
 * Functional smoke for the Tools menu panels against the live platform stack.
 * Each test opens the panel through its menu path, drives its primary control
 * and reads the effect back out of the document, the live Cesium clock/camera,
 * or the panel's own rendered svg.
 *
 * Charts needs a Cesium data source carrying attributes, and Data > Import
 * drops the file it is handed, so the layer arrives the way a real agent result
 * does: a stored chat session with a map spec, replayed from history with the
 * geojson fetch stubbed.
 *
 * Run: npx playwright test -c playwright.panels.config.js tests/e2e/panels/tools.spec.js
 */

/** Zones give 6/4/2 category counts; prices are 12 distinct numbers → histogram. */
const PARCELS = {
  type: 'FeatureCollection',
  features: Array.from({ length: 12 }, (_, i) => ({
    type: 'Feature',
    properties: { zone: i < 6 ? 'A' : i < 10 ? 'B' : 'C', price: (i + 1) * 100 },
    geometry: { type: 'Point', coordinates: [7.42 + i * 0.001, 43.73 + i * 0.001] },
  })),
};

const LAYER_NAME = 'agent-layer-0-parcels.geojson';

const SESSION = {
  id: 'panels-tools-session',
  name: 'Session 1',
  messages: [
    { id: 'u1', role: 'user', content: 'show parcels', timestamp: 1 },
    {
      id: 'a1',
      role: 'assistant',
      content: 'Found 12 parcels.',
      timestamp: 2,
      mapSpec: {
        type: 'map',
        layers: [{ name: 'Parcels', file: 'outputs/parcels.geojson', color: '#10b981' }],
      },
    },
  ],
  createdAt: 1,
  updatedAt: 2,
};

/** Camera stops the Stories test flies between, far enough apart to tell apart. */
const MONACO = { lon: 7.42, lat: 43.73, height: 12000 };
const ICELAND = { lon: -21.9, lat: 64.14, height: 12000 };
const SYDNEY = { lon: 151.2, lat: -33.86, height: 12000 };

/** The same stops as map cameras, for the split-view panes. */
const ICELAND_VIEW = { lon: ICELAND.lon, lat: ICELAND.lat, zoom: 6 };
const SYDNEY_VIEW = { lon: SYDNEY.lon, lat: SYDNEY.lat, zoom: 4 };

/** The zoom↔height conversion the renderers share, so a Cesium height sets a zoom. */
const cameraHeight = (zoom) => 4e7 / Math.pow(2, zoom);

async function openPanel(page, label, title) {
  await page.getByRole('button', { name: 'Tools' }).click();
  await page.locator(MENU_ITEM).filter({ hasText: label }).first().click();
  // the dropdown overlays the panel, so a click can land on a menu item instead
  await expect(page.locator('[class*="mantine-Menu-dropdown"]')).toHaveCount(0);
  const panel = page.locator(PANEL).filter({ hasText: title });
  await expect(panel).toHaveCount(1);
  return panel;
}

async function closePanel(page, panel) {
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
}

/** Boot with a stored agent result and draw it, leaving one attributed layer. */
async function openAppWithLayer(page) {
  await page.route('**/agent/geojson/**', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(PARCELS) }),
  );
  await page.addInitScript((session) => {
    localStorage.setItem(
      'viewtopia-chat',
      JSON.stringify({ state: { sessions: [session], activeSessionId: session.id }, version: 0 }),
    );
  }, SESSION);
  await openApp(page);
  await page.getByTitle('Click to replay this result on the map').click();
  await expect
    .poll(() => entityCount(page, LAYER_NAME), { timeout: 30000 })
    .toBe(PARCELS.features.length);
}

const entityCount = (page, name) =>
  page.evaluate((n) => {
    const ds = window.__viewtopiaViewer?.dataSources.getByName(n)[0];
    return ds ? ds.entities.values.length : -1;
  }, name);

/** Point the Cesium camera at a lon/lat/height. */
const setView = (page, view) =>
  page.evaluate((v) => {
    const viewer = window.__viewtopiaViewer;
    const rad = (d) => (d * Math.PI) / 180;
    viewer.camera.cancelFlight();
    viewer.camera.setView({
      destination: viewer.scene.globe.ellipsoid.cartographicToCartesian({
        longitude: rad(v.lon),
        latitude: rad(v.lat),
        height: v.height,
      }),
    });
  }, view);

const cameraPosition = (page) =>
  page.evaluate(() => {
    const carto = window.__viewtopiaViewer.camera.positionCartographic;
    const deg = (r) => (r * 180) / Math.PI;
    return { lon: deg(carto.longitude), lat: deg(carto.latitude) };
  });

/** Centre and zoom of a MapLibre instance published on window (active or pane). */
const mapCamera = (page, key) =>
  page.evaluate((k) => {
    const map = window[k];
    if (!map) return null;
    const c = map.getCenter();
    return { lon: c.lng, lat: c.lat, zoom: map.getZoom() };
  }, key);

const jumpMap = (page, key, view) =>
  page.evaluate(
    ({ k, v }) => window[k].jumpTo({ center: [v.lon, v.lat], zoom: v.zoom }),
    { k: key, v: view },
  );

/** A map camera match that tolerates the float noise of a renderer round trip. */
const nearView = (v) => ({
  lon: expect.closeTo(v.lon, 3),
  lat: expect.closeTo(v.lat, 3),
  zoom: expect.closeTo(v.zoom, 2),
});

/** Great-circle-free distance in degrees between the camera and a view. */
async function degreesFrom(page, view) {
  const at = await cameraPosition(page);
  return Math.hypot(at.lon - view.lon, at.lat - view.lat);
}

/** Live Cesium clock: absolute seconds, animation flag, speed and range. */
const clockState = (page) =>
  page.evaluate(() => {
    const clock = window.__viewtopiaViewer.clock;
    const secs = (jd) => jd.dayNumber * 86400 + jd.secondsOfDay;
    return {
      current: secs(clock.currentTime),
      start: secs(clock.startTime),
      stop: secs(clock.stopTime),
      animating: clock.shouldAnimate,
      multiplier: clock.multiplier,
    };
  });

/** CZML availability window the timeline's Fit to Data has to shrink-wrap onto. */
const TIME_DYNAMIC = { start: '2024-03-01T00:00:00Z', stop: '2024-03-01T06:00:00Z' };

/** A clock range far from TIME_DYNAMIC, so fitting has to move both ends. */
const OFF_RANGE = {
  start: '2024-01-01T00:00:00Z',
  stop: '2024-12-31T00:00:00Z',
  current: '2024-06-01T00:00:00Z',
};

/**
 * Load a time-dynamic CZML point into the live viewer and park the clock away
 * from it. Nothing in the app loads CZML, so the data has to come from here.
 */
async function loadTimeDynamicData(page) {
  await page.evaluate(async (interval) => {
    const ds = await window.Cesium.CzmlDataSource.load([
      { id: 'document', name: 'probe', version: '1.0' },
      {
        id: 'probe-point',
        availability: `${interval.start}/${interval.stop}`,
        position: { cartographicDegrees: [7.42, 43.73, 500] },
        point: { pixelSize: 8, color: { rgba: [255, 0, 0, 255] } },
      },
    ]);
    await window.__viewtopiaViewer.dataSources.add(ds);
  }, TIME_DYNAMIC);
  // the viewer adopts the clock of every data source it is handed, so the range
  // has to be pushed back off the data after the add
  await page.evaluate((range) => {
    const { JulianDate } = window.Cesium;
    const clock = window.__viewtopiaViewer.clock;
    clock.shouldAnimate = false;
    clock.startTime = JulianDate.fromIso8601(range.start);
    clock.stopTime = JulianDate.fromIso8601(range.stop);
    clock.currentTime = JulianDate.fromIso8601(range.current);
  }, OFF_RANGE);
}

/** Live clock range as epoch millis, comparable with Date.parse of the CZML. */
const clockMillis = (page) =>
  page.evaluate(() => {
    const clock = window.__viewtopiaViewer.clock;
    const ms = (jd) => window.Cesium.JulianDate.toDate(jd).getTime();
    return {
      start: ms(clock.startTime),
      stop: ms(clock.stopTime),
      current: ms(clock.currentTime),
    };
  });

/** The panel prints times with toLocaleString, so build the same string. */
const localeTime = (page, iso) => page.evaluate((s) => new Date(s).toLocaleString(), iso);

/** Choose a Mantine Select option by the input's accessible name. */
async function selectOption(page, panel, name, option) {
  await panel.getByRole('textbox', { name }).click();
  await page.getByRole('option', { name: option }).click();
}

/** Bar heights of a rendered ChartView, in draw order. */
const barHeights = (chart) =>
  chart.locator('rect').evaluateAll((rects) => rects.map((r) => Number(r.getAttribute('height'))));

/**
 * Move a Mantine slider to a fraction of its width. Mantine reads the pointer
 * from mousemove, so a plain click leaves the value untouched: the press has to
 * be followed by a move before the release.
 */
async function dragSliderTo(page, panel, fraction) {
  const track = panel.locator('[class*="mantine-Slider-root"]').first();
  const box = await track.boundingBox();
  const y = box.y + box.height / 2;
  const x = box.x + Math.min(box.width - 2, Math.max(2, box.width * fraction));
  await page.mouse.move(x - 1, y);
  await page.mouse.down();
  await page.mouse.move(x, y);
  await page.mouse.up();
}

test.describe('Tools panels', () => {
  test.describe.configure({ mode: 'parallel' });

  test('a11y: the switches restyle the live document and persist', async ({ page }) => {
    await openApp(page);
    const panel = await openPanel(page, 'A11y', 'Accessibility');

    const rootStyle = (prop) =>
      page.evaluate((p) => getComputedStyle(document.documentElement)[p], prop);
    const titleFontSize = () =>
      panel
        .getByText('Accessibility', { exact: true })
        .evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));

    expect(await rootStyle('filter')).toBe('none');
    const beforeFont = await titleFontSize();
    expect(beforeFont).toBeGreaterThan(0);

    await panel.getByText('High Contrast').click();
    await expect.poll(() => rootStyle('filter')).toBe('contrast(1.35) saturate(1.25)');

    // root font-size drives every rem-sized element, so the panel's own text grows
    await panel.getByText('Large Text').click();
    await expect.poll(titleFontSize).toBeGreaterThan(beforeFont);

    // `.a11y-reduce-motion *` clamps transitions on every element to 0.001ms
    const bodyTransition = () =>
      page.evaluate(() =>
        Number.parseFloat(getComputedStyle(document.body).transitionDuration),
      );
    expect(await bodyTransition()).toBe(0);
    await panel.getByText('Reduced Motion', { exact: true }).click();
    await expect.poll(bodyTransition).toBeGreaterThan(0);
    expect(await bodyTransition()).toBeLessThan(0.001);

    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('viewtopia-a11y')));
    expect(stored.state).toMatchObject({
      highContrast: true,
      largeText: true,
      reduceMotion: true,
    });

    await closePanel(page, panel);
  });

  test('charts: layer + attribute build category counts, a histogram and a pie', async ({
    page,
  }) => {
    await openAppWithLayer(page);
    const panel = await openPanel(page, 'Charts', 'Charts');

    await expect(panel.getByText('Select a layer and attribute to generate a chart')).toBeVisible();
    await expect(panel.locator('svg[role="img"]')).toHaveCount(0);

    await selectOption(page, panel, 'Layer', `${LAYER_NAME} (12)`);
    await selectOption(page, panel, 'Attribute', 'zone');

    // 6 A / 4 B / 2 C, tallest bar first: heights are the counts scaled to 96px
    const bars = panel.locator('svg[aria-label="bar chart"]');
    await expect(bars).toHaveCount(1);
    expect(await barHeights(bars)).toEqual([96, 64, 32]);
    await expect(bars.locator('text')).toHaveText(['A', 'B', 'C']);
    await expect(panel.getByTestId('charts-count')).toHaveText('12 features');

    // 12 distinct numbers instead: the same bar chart becomes an 8-bin histogram
    await selectOption(page, panel, 'Attribute', 'price');
    await expect(bars.locator('rect')).toHaveCount(8);
    const bins = await barHeights(bars);
    expect(bins.filter((h) => h > 0)).toHaveLength(8);
    await expect(bars.locator('text').first()).toHaveText('100');

    await selectOption(page, panel, 'Chart Type', '🥧 Pie');
    const pie = panel.locator('svg[aria-label="pie chart"]');
    await expect(pie).toHaveCount(1);
    await expect(pie.locator('path')).toHaveCount(8);
    await expect(bars).toHaveCount(0);

    await closePanel(page, panel);
  });

  test('dashboards: added widgets render their content and persist', async ({ page }) => {
    await openApp(page);
    // the modal title flips to "Edit Dashboard" once a dashboard is open
    const panel = await openPanel(page, 'Dashboards', /Dashboard/);

    await expect(panel.getByText('No dashboards yet. Create your first one!')).toBeVisible();
    const stored = () =>
      page.evaluate(() => JSON.parse(localStorage.getItem('viewtopia_dashboards') ?? '[]'));

    await panel.getByRole('button', { name: 'New Dashboard' }).click();
    await expect(panel.getByText('No widgets yet.')).toBeVisible();
    await panel.getByRole('textbox').first().fill('Panels E2E');

    await panel.getByRole('button', { name: 'Widget', exact: true }).click();
    await panel.getByRole('button', { name: '📈 Chart' }).click();

    const chartCard = panel.locator('[class*="mantine-Card-root"]').filter({ hasText: 'New chart' });
    await expect(chartCard).toHaveCount(1);
    const bars = chartCard.locator('svg[aria-label="bar chart"]');
    await expect(bars.locator('rect')).toHaveCount(3);

    await panel.getByRole('button', { name: 'Widget', exact: true }).click();
    await panel.getByRole('button', { name: '⏲️ Gauge' }).click();
    const gaugeCard = panel.locator('[class*="mantine-Card-root"]').filter({ hasText: 'New gauge' });
    await expect(gaugeCard.getByText('50%')).toBeVisible();

    expect(await stored()).toMatchObject([
      { title: 'Panels E2E', widgets: [{ type: 'chart' }, { type: 'gauge' }] },
    ]);

    // the widget editor rewrites the stored config, and the card redraws from it
    await chartCard.getByLabel('Widget settings').click();

    // the editor rows carry no accessible name: the labels are the plain text
    // inputs, the values the numeric ones
    const pointLabels = chartCard.locator('input:not([type]):not([readonly])');
    const pointValues = chartCard.locator('input[inputmode="numeric"]');
    for (const [i, value] of ['20', '40', '80'].entries()) await pointValues.nth(i).fill(value);
    for (const [i, name] of ['Low', 'Mid', 'High'].entries()) await pointLabels.nth(i).fill(name);

    // bars scale to the largest typed value, so 20/40/80 of 96px tall
    await expect(bars.locator('text')).toHaveText(['Low', 'Mid', 'High']);
    await expect.poll(() => barHeights(bars)).toEqual([24, 48, 96]);

    // a fourth point above the rest becomes the new max and rescales the others
    await chartCard.getByRole('button', { name: 'Add point' }).click();
    await pointValues.nth(3).fill('160');
    await expect.poll(() => barHeights(bars)).toEqual([12, 24, 48, 96]);
    expect(await stored()).toMatchObject([
      {
        widgets: [
          {
            config: {
              data: [
                { label: 'Low', value: 20 },
                { label: 'Mid', value: 40 },
                { label: 'High', value: 80 },
                { label: 'P4', value: 160 },
              ],
            },
          },
          { type: 'gauge' },
        ],
      },
    ]);

    await chartCard.getByRole('textbox', { name: 'Chart type' }).click();
    await page.getByRole('option', { name: 'Pie' }).click();
    await expect(chartCard.locator('svg[aria-label="pie chart"] path')).toHaveCount(4);
    await expect(bars).toHaveCount(0);

    await gaugeCard.getByLabel('Remove widget').click();
    await expect(gaugeCard).toHaveCount(0);
    expect(await stored()).toMatchObject([
      { title: 'Panels E2E', widgets: [{ type: 'chart', config: { chartType: 'pie' } }] },
    ]);

    // back in the list, the card counts what was added
    await panel.getByLabel('Back').click();
    await expect(panel.getByText('Panels E2E')).toBeVisible();
    await expect(panel.getByText(/1 widget/)).toBeVisible();

    await closePanel(page, panel);
  });

  test('split view: two MapLibre panes share one camera, and closing tears the second down', async ({
    page,
  }) => {
    await openApp(page);
    const panel = await openPanel(page, 'Split View', 'Split View');
    const clickToggle = () => panel.getByText('Enable Split View').click();
    const leftPane = page.getByTestId('viewer-pane-left');
    const rightPane = page.getByTestId('viewer-pane-right');

    // MapLibre on both sides: same type in both panes, and two swiftshader
    // Cesium contexts next to the stack are too slow to drive reliably
    await selectOption(page, panel, 'Left pane', 'MapLibre');
    await expect(panel.getByRole('textbox', { name: 'Left pane' })).toHaveValue('MapLibre');
    await expect(panel.getByRole('textbox', { name: 'Right pane' })).toHaveValue('MapLibre');
    await page.waitForFunction(() => !!window.__viewtopiaMap);

    // unsplit: one renderer, filling the viewer area
    await expect(rightPane).toHaveCount(0);
    await expect(page.locator('canvas')).toHaveCount(1);

    await clickToggle();
    await expect(rightPane).toHaveCount(1);
    await page.waitForFunction(() => !!window.__viewtopiaPaneMap);
    await expect(leftPane.locator('canvas')).toHaveCount(1);
    await expect(rightPane.locator('canvas')).toHaveCount(1);
    // the panes divide the area rather than stacking
    const [leftBox, rightBox] = [await leftPane.boundingBox(), await rightPane.boundingBox()];
    expect(rightBox.x).toBeGreaterThanOrEqual(leftBox.x + leftBox.width - 2);

    // a move on the left arrives on the right
    await jumpMap(page, '__viewtopiaMap', ICELAND_VIEW);
    await expect.poll(() => mapCamera(page, '__viewtopiaPaneMap')).toEqual(nearView(ICELAND_VIEW));

    // and back the other way
    await jumpMap(page, '__viewtopiaPaneMap', SYDNEY_VIEW);
    await expect.poll(() => mapCamera(page, '__viewtopiaMap')).toEqual(nearView(SYDNEY_VIEW));

    // closing the split destroys the second renderer, it does not just hide it
    await clickToggle();
    await expect(rightPane).toHaveCount(0);
    await expect(page.locator('canvas')).toHaveCount(1);
    expect(await page.evaluate(() => window.__viewtopiaPaneMap)).toBe(null);

    // repeated toggling must not accumulate renderers: Chrome drops the oldest
    // WebGL context past its limit, which would break the pane that is left and
    // fail the console guard
    for (let i = 0; i < 4; i++) {
      await clickToggle();
      await page.waitForFunction(() => !!window.__viewtopiaPaneMap);
      await expect(page.locator('canvas')).toHaveCount(2);
      await clickToggle();
      await expect(page.locator('canvas')).toHaveCount(1);
    }

    // the surviving renderer still answers a move
    await jumpMap(page, '__viewtopiaMap', ICELAND_VIEW);
    await expect.poll(() => mapCamera(page, '__viewtopiaMap')).toEqual(nearView(ICELAND_VIEW));

    await closePanel(page, panel);
  });

  test('split view: a Cesium left pane and a MapLibre right pane share one camera', async ({
    page,
  }) => {
    await openApp(page);
    const panel = await openPanel(page, 'Split View', 'Split View');
    await expect(panel.getByRole('textbox', { name: 'Left pane' })).toHaveValue('CesiumJS (3D)');

    await panel.getByText('Enable Split View').click();
    await page.waitForFunction(() => !!window.__viewtopiaPaneMap);
    await expect(page.getByTestId('viewer-pane-left').locator('canvas')).toHaveCount(1);
    await expect(page.getByTestId('viewer-pane-right').locator('canvas')).toHaveCount(1);

    // Cesium's camera position translates into the map's centre and zoom
    await setView(page, { ...ICELAND, height: cameraHeight(6) });
    await expect
      .poll(() => mapCamera(page, '__viewtopiaPaneMap'))
      .toEqual(nearView({ lon: ICELAND.lon, lat: ICELAND.lat, zoom: 6 }));

    // and the map's centre translates back into a Cesium camera position
    await jumpMap(page, '__viewtopiaPaneMap', SYDNEY_VIEW);
    await expect
      .poll(() => cameraPosition(page))
      .toEqual({ lon: expect.closeTo(SYDNEY_VIEW.lon, 3), lat: expect.closeTo(SYDNEY_VIEW.lat, 3) });

    await panel.getByText('Enable Split View').click();
    await expect(page.getByTestId('viewer-pane-right')).toHaveCount(0);
    await closePanel(page, panel);
  });

  test('stories: captured steps replay as camera flights', async ({ page }) => {
    await openApp(page);
    const panel = await openPanel(page, 'Stories', 'Stories');

    await expect(panel.getByTestId('stories-count')).toHaveText('0 steps');
    const stepTitle = panel.getByPlaceholder(/Step title/);

    await setView(page, MONACO);
    await stepTitle.fill('Monaco');
    await panel.getByRole('button', { name: 'Add step at view' }).click();
    await expect(panel.getByTestId('stories-count')).toHaveText('1 steps');

    await setView(page, ICELAND);
    await stepTitle.fill('Iceland');
    await panel.getByRole('button', { name: 'Add step at view' }).click();
    await expect(panel.getByTestId('stories-count')).toHaveText('2 steps');
    await expect(panel.getByText('1. Monaco')).toBeVisible();
    await expect(panel.getByText('2. Iceland')).toBeVisible();

    // each step stored the camera that was live when it was added
    const steps = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('viewtopia-stories') ?? '[]'),
    );
    expect(steps.map((s) => s.title)).toEqual(['Monaco', 'Iceland']);
    expect(steps[0].camera.lng).toBeCloseTo(MONACO.lon, 1);
    expect(steps[1].camera.lng).toBeCloseTo(ICELAND.lon, 1);

    // park the camera on the far side of the planet, so playing has to move it
    await setView(page, SYDNEY);
    expect(await degreesFrom(page, ICELAND)).toBeGreaterThan(100);

    await panel.getByTestId('stories-play').click();
    await expect(panel.getByTestId('stories-play')).toContainText('Stop Story');
    // the last step wins once the walk finishes, and the button resets itself
    await expect.poll(() => degreesFrom(page, ICELAND), { timeout: 60000 }).toBeLessThan(1);
    await expect(panel.getByTestId('stories-play')).toContainText('Play Story', { timeout: 30000 });

    await closePanel(page, panel);
  });

  test('timeline: play advances the live clock and the slider seeks it', async ({ page }) => {
    await openApp(page);
    const panel = await openPanel(page, 'Timeline', 'Timeline');

    const label = panel.getByTestId('timeline-current');
    const before = await clockState(page);
    const beforeLabel = await label.textContent();
    // the panel widens a zero-length range on mount, so there is room to animate
    expect(before.stop - before.start).toBeGreaterThan(0);
    expect(before.animating).toBe(false);

    await panel.getByRole('button', { name: 'Play' }).click();

    await expect.poll(() => clockState(page).then((c) => c.current)).toBeGreaterThan(before.current);
    await expect(label).not.toHaveText(beforeLabel);
    expect((await clockState(page)).animating).toBe(true);

    await panel.getByRole('button', { name: '2×' }).click();
    await panel.getByRole('button', { name: '2×' }).click();
    await expect(panel.getByText('Speed: 4×')).toBeVisible();
    expect((await clockState(page)).multiplier).toBe(4);
    await panel.getByRole('button', { name: '½×' }).click();
    await expect(panel.getByText('Speed: 2×')).toBeVisible();
    expect((await clockState(page)).multiplier).toBe(2);

    await panel.getByRole('button', { name: 'Pause' }).click();
    await expect.poll(() => clockState(page).then((c) => c.animating)).toBe(false);

    // seeking while paused lands the clock at the clicked fraction of the range
    const paused = await clockState(page);
    const pausedLabel = await label.textContent();
    await dragSliderTo(page, panel, 0.8);
    const seeked = await clockState(page);
    expect((seeked.current - seeked.start) / (seeked.stop - seeked.start)).toBeCloseTo(0.8, 1);
    expect(seeked.current).toBeGreaterThan(paused.current);
    await expect(label).not.toHaveText(pausedLabel);

    // Fit to Data reads the availability of the loaded entities, so hand the
    // viewer a 6h CZML window while the clock sits on a whole year
    await loadTimeDynamicData(page);
    expect(await clockMillis(page)).toEqual({
      start: Date.parse(OFF_RANGE.start),
      stop: Date.parse(OFF_RANGE.stop),
      current: Date.parse(OFF_RANGE.current),
    });

    await panel.getByRole('button', { name: 'Fit to Data' }).click();
    expect(await clockMillis(page)).toEqual({
      start: Date.parse(TIME_DYNAMIC.start),
      stop: Date.parse(TIME_DYNAMIC.stop),
      current: Date.parse(TIME_DYNAMIC.start),
    });
    await expect(
      panel.getByText('No time-dynamic data loaded; keeping current range'),
    ).toHaveCount(0);
    // the readouts redraw from the fitted range
    await expect(label).toHaveText(await localeTime(page, TIME_DYNAMIC.start));
    await expect(panel.getByText(await localeTime(page, TIME_DYNAMIC.stop))).toBeVisible();

    await closePanel(page, panel);
  });
});
