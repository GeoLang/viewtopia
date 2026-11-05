import { describe, it, expect } from 'vitest';
import { ALL_TOOL_MENU_ITEMS } from '../../src/components/toolMenus';

const SHIPPED_PANELS = [
  'crossSection',
  'rasterViewer',
  'terrainProfile',
  'charts',
  'dataTable',
  'timeline',
  'shadows',
  'offline',
  'cesiumIon',
  'google3d',
  'modelImport',
  'flythrough',
  'drone',
  'volume',
  'assets',
  'export3d',
  'photo',
  'indoor',
  'timelapse',
  'notebooks',
  'regionWatch',
  // settings is a top-level toolbar button now, not a menu registry entry
] as const;

describe('tool menu registry', () => {
  it('lists every shipped panel', () => {
    for (const panel of SHIPPED_PANELS) {
      expect(
        ALL_TOOL_MENU_ITEMS.some((item) => item.panel === panel),
        `registry entry for ${panel}`,
      ).toBe(true);
    }
  });
});
