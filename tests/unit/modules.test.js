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
