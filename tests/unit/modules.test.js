import { describe, it, expect } from 'vitest';

describe('data-table', () => {
  it('should export loadTableData and initDataTable', async () => {
    const mod = await import('../../src/data-table.js');
    expect(typeof mod.loadTableData).toBe('function');
    expect(typeof mod.initDataTable).toBe('function');
  });
});

describe('keyboard-shortcuts', () => {
  it('should export initKeyboardShortcuts', async () => {
    const mod = await import('../../src/keyboard-shortcuts.js');
    expect(typeof mod.initKeyboardShortcuts).toBe('function');
  });
});

describe('theme-toggle', () => {
  it('should export initThemeToggle', async () => {
    const mod = await import('../../src/theme-toggle.js');
    expect(typeof mod.initThemeToggle).toBe('function');
  });
});

describe('tour', () => {
  it('should export initTour and startTour', async () => {
    const mod = await import('../../src/tour.js');
    expect(typeof mod.initTour).toBe('function');
    expect(typeof mod.startTour).toBe('function');
  });
});

describe('track-import', () => {
  it('should detect GPX files', async () => {
    const mod = await import('../../src/track-import.js');
    expect(mod.detectTrackFile({ name: 'trail.gpx' })).toBe('gpx');
    expect(mod.detectTrackFile({ name: 'places.kml' })).toBe('kml');
    expect(mod.detectTrackFile({ name: 'data.csv' })).toBe(null);
  });
});

describe('plugins', () => {
  it('should export registerPlugin and getPlugins', async () => {
    const mod = await import('../../src/plugins.js');
    expect(typeof mod.registerPlugin).toBe('function');
    expect(typeof mod.getPlugins).toBe('function');
    expect(typeof mod.loadPlugin).toBe('function');
    expect(typeof mod.initPlugins).toBe('function');
  });

  it('should register a plugin', async () => {
    const mod = await import('../../src/plugins.js');
    const registered = [];
    mod.registerPlugin({
      name: 'test-plugin',
      version: '1.0.0',
      register(api) { registered.push(api); },
    });
    const list = mod.getPlugins();
    expect(list.some(p => p.name === 'test-plugin')).toBe(true);
  });
});

describe('charts', () => {
  it('should export chart functions', async () => {
    const mod = await import('../../src/charts.js');
    expect(typeof mod.showHistogram).toBe('function');
    expect(typeof mod.showScatter).toBe('function');
    expect(typeof mod.showTimeSeries).toBe('function');
  });
});

describe('layer-manager', () => {
  it('should export layer functions', async () => {
    const mod = await import('../../src/layer-manager.js');
    expect(typeof mod.addLayer).toBe('function');
    expect(typeof mod.removeLayer).toBe('function');
    expect(typeof mod.getLayers).toBe('function');
  });
});
