import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import agriculture from '../../src/plugins/agriculture';
import construction from '../../src/plugins/construction';
import emergency from '../../src/plugins/emergency';
import environmental from '../../src/plugins/environmental';
import telecom from '../../src/plugins/telecom';
import logistics from '../../src/plugins/logistics';
import realEstate from '../../src/plugins/real-estate';
import {
  SENSORS_DATASET,
  TOWERS_DATASET,
  FIELDS_DATASET,
  INCIDENTS_DATASET,
  CONSTRUCTION_DATASET,
  SETUP_DOC,
  missingDatasetMessage,
} from '../../src/lib/verticals';
import { PARCELS_DATASET, SALES_DATASET } from '../../src/lib/realEstate';

/**
 * The setup page is the only place an operator learns which dataset name each
 * vertical looks for, and the panels link to it by heading anchor. These read
 * the real page and the real plugin definitions so a renamed dataset, a new
 * settings key or a retitled section fails here instead of shipping a page that
 * describes something else.
 */

// vitest rewrites import.meta.url under jsdom, so resolve from the repo root
const page = readFileSync(join(process.cwd(), SETUP_DOC), 'utf8');

/** GitHub's heading anchor for the level-2 headings on the page. */
function slugsOf(markdown: string): string[] {
  return markdown
    .split('\n')
    .filter((line) => line.startsWith('## '))
    .map((line) => line.slice(3).trim().toLowerCase().replace(/ /g, '-'));
}

const verticals = [
  { plugin: agriculture, datasets: [FIELDS_DATASET] },
  { plugin: construction, datasets: [CONSTRUCTION_DATASET] },
  { plugin: emergency, datasets: [INCIDENTS_DATASET] },
  { plugin: environmental, datasets: [SENSORS_DATASET] },
  { plugin: telecom, datasets: [TOWERS_DATASET] },
  { plugin: logistics, datasets: [] },
  { plugin: realEstate, datasets: [PARCELS_DATASET, SALES_DATASET] },
];

describe('verticals setup page', () => {
  it.each(verticals)('$plugin.id has a section the panels can link to', ({ plugin }) => {
    expect(slugsOf(page)).toContain(plugin.id);
  });

  it.each(verticals.filter((v) => v.datasets.length > 0))(
    '$plugin.id names every dataset it discovers',
    ({ datasets }) => {
      for (const dataset of datasets) {
        expect(page).toContain(`\`${dataset}\``);
      }
    },
  );

  it.each(verticals)('$plugin.id documents every settings key it declares', ({ plugin }) => {
    for (const field of plugin.settings ?? []) {
      expect(page).toContain(`\`${field.key}\``);
    }
  });

  it('resolves the anchor every unconfigured panel state points at', () => {
    const slugs = slugsOf(page);
    for (const { plugin, datasets } of verticals) {
      for (const dataset of datasets) {
        const message = missingDatasetMessage(dataset, plugin.id);
        expect(message).toContain(dataset);
        const anchor = message.slice(message.lastIndexOf('#') + 1);
        expect(slugs).toContain(anchor);
      }
    }
  });
});
