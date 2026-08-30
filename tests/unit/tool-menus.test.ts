import { describe, it, expect } from 'vitest';
import {
  ALL_TOOL_MENU_ITEMS,
  visibleToolItems,
  isPreviewPanel,
} from '../../src/components/toolMenus';
import { useAppStore, type ToolPanel } from '../../src/store/app';

// every stub has shipped, so the registry gates nothing today. A new preview
// panel is listed here and moves to SHIPPED_PANELS when it becomes real.
const GATED_PANELS: NonNullable<ToolPanel>[] = [];

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

describe('tool menu preview gating', () => {
  it('flags every stub panel as preview', () => {
    for (const panel of GATED_PANELS) {
      const entry = ALL_TOOL_MENU_ITEMS.find((i) => i.panel === panel);
      expect(entry, `registry entry for ${panel}`).toBeDefined();
      expect(entry?.preview, `${panel} should be preview`).toBe(true);
      expect(isPreviewPanel(panel)).toBe(true);
    }
  });

  // with nothing gated the loops above assert nothing, so pin the two sides
  // together: a stray preview flag has to show up in GATED_PANELS
  it('gates exactly the panels the list names', () => {
    const flagged = ALL_TOOL_MENU_ITEMS.filter((i) => i.preview).map((i) => i.panel);
    expect(flagged.sort()).toEqual([...GATED_PANELS].sort());
  });

  it('filters on the preview flag whatever the registry holds', () => {
    const items = [
      { panel: 'timelapse' as const, label: 'shipped' },
      { panel: 'indoor' as const, label: 'stub', preview: true },
    ];
    expect(visibleToolItems(items, false).map((i) => i.panel)).toEqual(['timelapse']);
    expect(visibleToolItems(items, true)).toHaveLength(2);
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
