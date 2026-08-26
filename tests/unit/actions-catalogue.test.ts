import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { actionCatalogue } from '../../src/actions';

/**
 * The catalogue as the viewer sends it, kept on disk so geolang's viewer evals
 * can copy the same list (geolang/evals/viewer/catalogue.json). Run with
 * UPDATE_ACTION_CATALOGUE=1 to rewrite it after changing an action.
 */
const FIXTURE = resolve('tests/unit/fixtures/action-catalogue.json');

describe('the action catalogue fixture', () => {
  it('matches what the viewer sends with every chat message', () => {
    const current = actionCatalogue();
    if (process.env.UPDATE_ACTION_CATALOGUE) {
      writeFileSync(FIXTURE, `${JSON.stringify(current, null, 2)}\n`);
    }
    // parsed, since a windows checkout rewrites the fixture's line endings
    expect(JSON.parse(readFileSync(FIXTURE, 'utf8'))).toEqual(current);
  });

  it('holds every phase one action', () => {
    const names = actionCatalogue().map((entry) => entry.name);
    expect(names).toContain('layers.set_visible');
    expect(names).toContain('basemap.set');
    expect(names).toContain('live.set_asset_rule');
    expect(names).toContain('scenario.compare');
    expect(names).toContain('find_feature');
    expect(new Set(names).size).toBe(names.length);
  });
});
