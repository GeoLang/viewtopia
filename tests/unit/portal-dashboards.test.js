import { describe, it, expect } from 'vitest';

describe('portal', () => {
  it('should export initPortal, addItem, deleteItem, searchCatalog', async () => {
    const mod = await import('../../src/portal.js');
    expect(typeof mod.initPortal).toBe('function');
    expect(typeof mod.addItem).toBe('function');
    expect(typeof mod.deleteItem).toBe('function');
    expect(typeof mod.searchCatalog).toBe('function');
  });
});

describe('dashboards', () => {
  it('should export initDashboards, createNewDashboard, openDashboard, addWidget, deleteDashboard', async () => {
    const mod = await import('../../src/dashboards.js');
    expect(typeof mod.initDashboards).toBe('function');
    expect(typeof mod.createNewDashboard).toBe('function');
    expect(typeof mod.openDashboard).toBe('function');
    expect(typeof mod.addWidget).toBe('function');
    expect(typeof mod.deleteDashboard).toBe('function');
  });
});
