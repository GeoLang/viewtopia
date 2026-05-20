import { describe, it, expect } from 'vitest';

describe('ParcelPanel', () => {
  it('should export ParcelPanel component', async () => {
    const mod = await import('../../src/components/tools/ParcelPanel.tsx');
    expect(typeof mod.ParcelPanel).toBe('function');
  });
});

describe('CompsPanel', () => {
  it('should export CompsPanel component', async () => {
    const mod = await import('../../src/components/tools/CompsPanel.tsx');
    expect(typeof mod.CompsPanel).toBe('function');
  });
});

describe('ParcelEditPanel', () => {
  it('should export ParcelEditPanel component', async () => {
    const mod = await import('../../src/components/tools/ParcelEditPanel.tsx');
    expect(typeof mod.ParcelEditPanel).toBe('function');
  });
});
