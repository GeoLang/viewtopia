import { describe, it, expect } from 'vitest';

describe('FleetPanel', () => {
  it('should export FleetPanel component', async () => {
    const mod = await import('../../src/components/tools/FleetPanel.tsx');
    expect(typeof mod.FleetPanel).toBe('function');
  });
});

describe('DeliveryPanel', () => {
  it('should export DeliveryPanel component', async () => {
    const mod = await import('../../src/components/tools/DeliveryPanel.tsx');
    expect(typeof mod.DeliveryPanel).toBe('function');
  });
});
