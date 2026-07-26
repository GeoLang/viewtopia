import { test, expect } from './console-guard';

/**
 * Agent layer (ui_spec) behaviour across renderers — two regressions from the
 * React port:
 *
 *  - a result drawn on one renderer vanished when switching to another. deck.gl
 *    had no agent-layer path at all, and renderUISpec forced deck.gl back to
 *    Cesium.
 *  - clicking a result feature only surfaced its properties on Cesium; MapLibre
 *    had no click handler and deck.gl's picks went nowhere.
 *
 * The layer file is served by a route mock, so no agent backend is needed. The
 * result is replayed through the chat history's click-to-replay, which is the
 * same renderUISpec path a live agent reply takes.
 *
 * Run: npm run test:e2e:react
 */

const REACT_URL = '/';
const CAFE = [7.4246, 43.7384];

const CAFES = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { name: 'Cafe Central', amenity: 'cafe', cuisine: 'coffee_shop' },
      geometry: { type: 'Point', coordinates: CAFE },
    },
    {
      type: 'Feature',
      properties: { name: 'Cafe de Paris', amenity: 'cafe' },
      geometry: { type: 'Point', coordinates: [7.4279, 43.7397] },
    },
  ],
};

const SESSION = {
  id: 'agent-layer-session',
  name: 'Session 1',
  messages: [
    { id: 'u1', role: 'user', content: 'show cafes', timestamp: 1 },
    {
      id: 'a1',
      role: 'assistant',
      content: 'Found 2 cafes.',
      timestamp: 2,
      mapSpec: {
        type: 'map',
        layers: [{ name: 'Cafes', file: 'outputs/cafes.geojson', color: '#10b981' }],
      },
    },
  ],
  createdAt: 1,
  updatedAt: 2,
};

/** Load the app with a stored result, then replay it onto the map. */
async function seedAndReplay(page) {
  await page.route('**/agent/geojson/**', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(CAFES) }),
  );
  await page.goto(REACT_URL);
  await page.evaluate((s) => {
    localStorage.setItem(
      'viewtopia-chat',
      JSON.stringify({ state: { sessions: [s], activeSessionId: s.id }, version: 0 }),
    );
  }, SESSION);
  await page.reload();
  await page.waitForFunction(() => !!window.__viewtopiaViewer, null, { timeout: 60000 });
  await page.getByTitle('Click to replay this result on the map').click();
}

async function switchRenderer(page, label) {
  await page
    .locator('input[value="CesiumJS"], input[value="deck.gl"], input[value="MapLibre"]')
    .first()
    .click();
  await page.getByRole('option', { name: label, exact: true }).click();
}

const cesiumLayerCount = (page) =>
  page.evaluate(() => {
    const v = window.__viewtopiaViewer;
    if (!v || v.isDestroyed?.()) return 0;
    let n = 0;
    for (let i = 0; i < v.dataSources.length; i++) {
      if (v.dataSources.get(i).name?.startsWith('agent-layer-')) n++;
    }
    return n;
  });

const deckLayerIds = (page) =>
  page.evaluate(() => {
    const d = window.__viewtopiaDeck;
    if (!d) return [];
    return (d.props.layers ?? []).map((l) => l && l.id).filter(Boolean);
  });

const maplibreLayerIds = (page) =>
  page.evaluate(() => {
    const m = window.__viewtopiaMap;
    if (!m) return [];
    return (m.getStyle()?.layers ?? [])
      .map((l) => l.id)
      .filter((id) => id.startsWith('agent-layer-'));
  });

test.describe('agent layers across renderers', () => {
  test('a replayed result survives cesium → deck.gl → maplibre → cesium', async ({ page }) => {
    await seedAndReplay(page);

    await expect.poll(() => cesiumLayerCount(page), { timeout: 30000 }).toBeGreaterThan(0);

    // The regression: deck.gl drew nothing and renderUISpec forced you off it.
    await switchRenderer(page, 'deck.gl');
    await expect
      .poll(() => deckLayerIds(page), { timeout: 30000 })
      .toEqual(expect.arrayContaining([expect.stringMatching(/^agent-layer-/)]));

    await switchRenderer(page, 'MapLibre');
    await expect.poll(() => maplibreLayerIds(page), { timeout: 30000 }).not.toHaveLength(0);

    await switchRenderer(page, 'CesiumJS');
    await expect.poll(() => cesiumLayerCount(page), { timeout: 30000 }).toBeGreaterThan(0);
  });

  test('a result survives maplibre → deck.gl → maplibre', async ({ page }) => {
    await seedAndReplay(page);

    await switchRenderer(page, 'MapLibre');
    await expect.poll(() => maplibreLayerIds(page), { timeout: 30000 }).not.toHaveLength(0);

    await switchRenderer(page, 'deck.gl');
    await expect
      .poll(() => deckLayerIds(page), { timeout: 30000 })
      .toEqual(expect.arrayContaining([expect.stringMatching(/^agent-layer-/)]));

    // Returning rebuilds the map from scratch and re-sets its style.
    await switchRenderer(page, 'MapLibre');
    await expect.poll(() => maplibreLayerIds(page), { timeout: 30000 }).not.toHaveLength(0);
  });

  test('a basemap change keeps the agent layers', async ({ page }) => {
    await seedAndReplay(page);
    await switchRenderer(page, 'MapLibre');
    await expect.poll(() => maplibreLayerIds(page), { timeout: 30000 }).not.toHaveLength(0);

    // setStyle drops every source and layer; ours must come back.
    await page.getByRole('textbox', { name: 'Basemap', exact: true }).click();
    await page.getByRole('option', { name: 'Satellite', exact: true }).click();

    await expect.poll(() => maplibreLayerIds(page), { timeout: 30000 }).not.toHaveLength(0);
  });

  test('renderUISpec leaves the active renderer alone', async ({ page }) => {
    await page.route('**/agent/geojson/**', (route) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(CAFES) }),
    );
    await page.goto(REACT_URL);
    await page.evaluate((s) => {
      localStorage.setItem(
        'viewtopia-chat',
        JSON.stringify({ state: { sessions: [s], activeSessionId: s.id }, version: 0 }),
      );
    }, SESSION);
    await page.reload();
    await page.waitForFunction(() => !!window.__viewtopiaViewer, null, { timeout: 60000 });

    // Replaying while deck.gl is active used to snap the app back to Cesium.
    await switchRenderer(page, 'deck.gl');
    await page.waitForFunction(() => !!window.__viewtopiaDeck, null, { timeout: 30000 });
    await page.getByTitle('Click to replay this result on the map').click();

    await expect
      .poll(() => deckLayerIds(page), { timeout: 30000 })
      .toEqual(expect.arrayContaining([expect.stringMatching(/^agent-layer-/)]));
    await expect(page.locator('#deckgl-container')).toBeVisible();
  });
});

test.describe('feature picker on agent layers', () => {
  /**
   * Click a lng/lat through the live renderer, in page coordinates. Cesium's
   * flyTo is animated, so wait for the projection to settle — clicking while the
   * camera moves lands on stale coordinates.
   */
  async function settledPoint(page, project) {
    let prev = null;
    await expect
      .poll(
        async () => {
          const cur = await page.evaluate(project, CAFE);
          if (!cur) return false;
          const settled =
            prev !== null && Math.abs(cur.x - prev.x) < 1 && Math.abs(cur.y - prev.y) < 1;
          prev = cur;
          return settled;
        },
        { timeout: 30000, intervals: [250] },
      )
      .toBe(true);
    return prev;
  }

  async function clickAt(page, project) {
    const pt = await settledPoint(page, project);
    await page.mouse.click(Math.round(pt.x), Math.round(pt.y));
  }

  /**
   * Wait out the agent-layer flyTo. Cesium eases in, so sampling the projection
   * straight after a replay reads a camera that hasn't started moving and looks
   * settled. `scene.tweens` holds the flight tween — undocumented, but the only
   * accurate signal that the camera is done.
   */
  async function waitForCesiumFlight(page) {
    const tweens = () =>
      page.evaluate(() => window.__viewtopiaViewer?.scene?.tweens?.length ?? 0);
    // Tolerate missing the start if the flight already finished.
    await page
      .waitForFunction(
        () => (window.__viewtopiaViewer?.scene?.tweens?.length ?? 0) > 0,
        null,
        { timeout: 5000 },
      )
      .catch(() => {});
    await expect.poll(tweens, { timeout: 30000, intervals: [100] }).toBe(0);
  }

  /** deck's project() is canvas-relative; the canvas sits below the toolbar. */
  const deckProject = (c) => {
    const d = window.__viewtopiaDeck;
    if (!d || !d.canvas) return null;
    const [x, y] = d.getViewports()[0].project(c);
    const r = d.canvas.getBoundingClientRect();
    return { x: x + r.x, y: y + r.y };
  };

  const maplibreProject = (c) => {
    const m = window.__viewtopiaMap;
    if (!m) return null;
    const p = m.project(c);
    const r = m.getCanvas().getBoundingClientRect();
    return { x: p.x + r.x, y: p.y + r.y };
  };

  /** Project the cafe via Cesium's own entity — no Cesium global needed. */
  const cesiumProject = () => {
    const v = window.__viewtopiaViewer;
    if (!v || v.isDestroyed?.()) return null;
    let entity = null;
    for (let i = 0; i < v.dataSources.length; i++) {
      const ds = v.dataSources.get(i);
      if (ds.name?.startsWith('agent-layer-')) {
        entity = ds.entities.values[0];
        break;
      }
    }
    if (!entity) return null;
    const pos = entity.position?.getValue(v.clock.currentTime);
    if (!pos) return null;
    const p = v.scene.cartesianToCanvasCoordinates(pos);
    if (!p) return null;
    const r = v.scene.canvas.getBoundingClientRect();
    return { x: p.x + r.x, y: p.y + r.y };
  };

  const featureInfo = (page) =>
    page.locator('div').filter({ hasText: /^Feature Info/ }).first();

  /** The Inspect button is the picking mode — it arms the picker on its own. */
  async function enableInspect(page) {
    await page.getByRole('button', { name: 'Inspect' }).click();
    await expect(page.getByLabel('Click a feature to inspect')).toBeChecked();
  }

  test('the Inspect button arms picking on its own', async ({ page }) => {
    await seedAndReplay(page);
    await expect.poll(() => cesiumLayerCount(page), { timeout: 30000 }).toBeGreaterThan(0);
    await waitForCesiumFlight(page);

    // Opening the panel used to leave picking off, so a click did nothing.
    await page.getByRole('button', { name: 'Inspect' }).click();
    await expect(page.getByLabel('Click a feature to inspect')).toBeChecked();

    await clickAt(page, cesiumProject);
    await expect(featureInfo(page)).toContainText('Cafe Central');

    // ...and clicking it again disarms.
    await page.getByRole('button', { name: 'Inspect' }).click();
    await expect(featureInfo(page)).toBeHidden();
  });

  test('clicking a feature shows its properties on deck.gl', async ({ page }) => {
    await seedAndReplay(page);
    await enableInspect(page);
    await switchRenderer(page, 'deck.gl');
    await page.waitForFunction(() => !!window.__viewtopiaDeck, null, { timeout: 30000 });
    await expect
      .poll(() => deckLayerIds(page), { timeout: 30000 })
      .toEqual(expect.arrayContaining([expect.stringMatching(/^agent-layer-/)]));

    await clickAt(page, deckProject);

    await expect(featureInfo(page)).toContainText('Cafe Central');
    await expect(featureInfo(page)).toContainText('amenity');
  });

  // Agent points are 5px circles on deck/maplibre, vs Cesium's large pins. With
  // no pick tolerance they need near-pixel aim, which reads as "only Cesium works".
  test('a near-miss click still picks the feature on deck.gl', async ({ page }) => {
    await seedAndReplay(page);
    await enableInspect(page);
    await switchRenderer(page, 'deck.gl');
    await page.waitForFunction(() => !!window.__viewtopiaDeck, null, { timeout: 30000 });
    await expect
      .poll(() => deckLayerIds(page), { timeout: 30000 })
      .toEqual(expect.arrayContaining([expect.stringMatching(/^agent-layer-/)]));

    const pt = await settledPoint(page, deckProject);
    await page.mouse.click(Math.round(pt.x) + 6, Math.round(pt.y) + 4);

    await expect(featureInfo(page)).toContainText('Cafe Central');
  });

  test('a near-miss click still picks the feature on maplibre', async ({ page }) => {
    await seedAndReplay(page);
    await enableInspect(page);
    await switchRenderer(page, 'MapLibre');
    await page.waitForFunction(() => !!window.__viewtopiaMap, null, { timeout: 30000 });
    await expect.poll(() => maplibreLayerIds(page), { timeout: 30000 }).not.toHaveLength(0);

    const pt = await settledPoint(page, maplibreProject);
    await page.mouse.click(Math.round(pt.x) + 6, Math.round(pt.y) + 4);

    await expect(featureInfo(page)).toContainText('Cafe Central');
  });

  test('clicking a feature shows its properties on maplibre', async ({ page }) => {
    await seedAndReplay(page);
    await enableInspect(page);
    await switchRenderer(page, 'MapLibre');
    await page.waitForFunction(() => !!window.__viewtopiaMap, null, { timeout: 30000 });
    await expect.poll(() => maplibreLayerIds(page), { timeout: 30000 }).not.toHaveLength(0);

    await clickAt(page, () => {
      const m = window.__viewtopiaMap;
      if (!m) return null;
      const p = m.project([7.4246, 43.7384]);
      const r = m.getCanvas().getBoundingClientRect();
      return { x: p.x + r.x, y: p.y + r.y };
    });

    await expect(featureInfo(page)).toContainText('Cafe Central');
    await expect(featureInfo(page)).toContainText('amenity');
  });

  test('a pick opens the panel even if it was closed', async ({ page }) => {
    await seedAndReplay(page);
    await enableInspect(page);
    await expect.poll(() => cesiumLayerCount(page), { timeout: 30000 }).toBeGreaterThan(0);
    await waitForCesiumFlight(page);

    // Dismiss the panel without disarming (the Inspect button would do both),
    // so a pick would otherwise land with nowhere to show.
    await page.getByLabel('Close feature info').click();
    await expect(featureInfo(page)).toBeHidden();
    await expect
      .poll(() => page.evaluate(() => !!document.querySelector('input[role="switch"]')))
      .toBe(false);

    await clickAt(page, cesiumProject);
    await expect(featureInfo(page)).toBeVisible();
    await expect(featureInfo(page)).toContainText('Cafe Central');
  });

  test('hovering a feature shows a pointer cursor once picking is on', async ({ page }) => {
    await seedAndReplay(page);
    await expect.poll(() => cesiumLayerCount(page), { timeout: 30000 }).toBeGreaterThan(0);

    const cursor = () =>
      page.evaluate(() => window.__viewtopiaViewer?.scene?.canvas?.style?.cursor ?? '');

    await waitForCesiumFlight(page);
    const pt = await settledPoint(page, cesiumProject);
    const x = Math.round(pt.x);
    const y = Math.round(pt.y);

    // Hovering the cafe before picking is on must not suggest it's clickable.
    await page.mouse.move(x, y);
    expect(await cursor()).not.toBe('pointer');

    await enableInspect(page);
    // Approach from well away, so the move onto the feature is unambiguous.
    await page.mouse.move(x - 40, y - 40);
    await page.mouse.move(x, y);
    await expect.poll(cursor, { timeout: 10000 }).toBe('pointer');
  });

  // A renderer switch rebuilds each viewer, so a picker bound to the old
  // instance goes quietly dead. Arm first, switch away and back, then click.
  test('picking still works on cesium after a renderer round trip', async ({ page }) => {
    await seedAndReplay(page);
    await enableInspect(page);

    await switchRenderer(page, 'deck.gl');
    await page.waitForFunction(() => !!window.__viewtopiaDeck, null, { timeout: 30000 });
    await switchRenderer(page, 'CesiumJS');
    await expect.poll(() => cesiumLayerCount(page), { timeout: 30000 }).toBeGreaterThan(0);
    await waitForCesiumFlight(page);

    await clickAt(page, cesiumProject);
    await expect(featureInfo(page)).toContainText('Cafe Central');
  });

  test('picking still works on maplibre after a renderer round trip', async ({ page }) => {
    await seedAndReplay(page);
    await enableInspect(page);

    await switchRenderer(page, 'MapLibre');
    await page.waitForFunction(() => !!window.__viewtopiaMap, null, { timeout: 30000 });
    await switchRenderer(page, 'deck.gl');
    await page.waitForFunction(() => !!window.__viewtopiaDeck, null, { timeout: 30000 });
    await switchRenderer(page, 'MapLibre');
    await expect.poll(() => maplibreLayerIds(page), { timeout: 30000 }).not.toHaveLength(0);

    await clickAt(page, maplibreProject);
    await expect(featureInfo(page)).toContainText('Cafe Central');
  });

  test('clicking a feature still shows its properties on cesium', async ({ page }) => {
    await seedAndReplay(page);
    await enableInspect(page);
    await expect.poll(() => cesiumLayerCount(page), { timeout: 30000 }).toBeGreaterThan(0);
    await waitForCesiumFlight(page);

    await clickAt(page, cesiumProject);

    await expect(featureInfo(page)).toContainText('Cafe Central');
    // `name` lives in the property bag; it must not also be unshifted as a row.
    await expect(featureInfo(page).getByText('name', { exact: true })).toHaveCount(1);
  });
});
