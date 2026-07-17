import { describe, it, expect } from 'vitest';
import {
  ALL_TOOL_MENU_ITEMS,
  visibleToolItems,
  isPreviewPanel,
} from '../../src/components/toolMenus';
import { useAppStore } from '../../src/store/app';

const GATED_PANELS = [
  'noise',
  'energy',
  'photo',
  'timelapse',
  'offline',
  'indoor',
  'drone',
  'export3d',
  'flythrough',
  'volume',
  'pointCloudCompare',
  'classification',
  'cesiumIon',
  'rasterViewer',
  'google3d',
  'assets',
  'modelImport',
  'webxr',
] as const;

const SHIPPED_PANELS = [
  'crossSection',
  'terrainProfile',
  'charts',
  'dataTable',
  'timeline',
  'shadows',
  'settings',
] as const;

describe('tool menu preview gating', () => {
  it('flags every stub panel as preview', () => {
    for (const panel of GATED_PANELS) {
      const entry = ALL_TOOL_MENU_ITEMS.find((i) => i.panel === panel);
      expect(entry, `registry entry for ${panel}`).toBeDefined();
      expect(entry?.preview, `${panel} should be preview`).toBe(true);
      expect(isPreviewPanel(panel)).toBe(true);
    }
  });

  it('does not flag shipped panels', () => {
    for (const panel of SHIPPED_PANELS) {
      const entry = ALL_TOOL_MENU_ITEMS.find((i) => i.panel === panel);
      expect(entry, `registry entry for ${panel}`).toBeDefined();
      expect(entry?.preview ?? false).toBe(false);
      expect(isPreviewPanel(panel)).toBe(false);
    }
  });

  it('hides preview tools by default', () => {
    const visible = visibleToolItems(ALL_TOOL_MENU_ITEMS, false);
    for (const panel of GATED_PANELS) {
      expect(visible.some((i) => i.panel === panel), `${panel} hidden`).toBe(false);
    }
    for (const panel of SHIPPED_PANELS) {
      expect(visible.some((i) => i.panel === panel), `${panel} visible`).toBe(true);
    }
  });

  it('reveals preview tools when the flag is on', () => {
    const visible = visibleToolItems(ALL_TOOL_MENU_ITEMS, true);
    expect(visible).toHaveLength(ALL_TOOL_MENU_ITEMS.length);
    for (const panel of GATED_PANELS) {
      expect(visible.some((i) => i.panel === panel), `${panel} revealed`).toBe(true);
    }
  });

  it('defaults showPreviewTools off and toggles via settings', () => {
    expect(useAppStore.getState().settings.showPreviewTools).toBe(false);
    useAppStore.getState().updateSettings({ showPreviewTools: true });
    expect(useAppStore.getState().settings.showPreviewTools).toBe(true);
    useAppStore.getState().updateSettings({ showPreviewTools: false });
    expect(useAppStore.getState().settings.showPreviewTools).toBe(false);
  });
});
