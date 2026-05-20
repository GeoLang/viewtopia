import { describe, it, expect } from 'vitest';

describe('SensorPanel', () => {
  it('should export SensorPanel component', async () => {
    const mod = await import('../../src/components/tools/SensorPanel.tsx');
    expect(typeof mod.SensorPanel).toBe('function');
  });
});

describe('ConstructionPanel', () => {
  it('should export ConstructionPanel component', async () => {
    const mod = await import('../../src/components/tools/ConstructionPanel.tsx');
    expect(typeof mod.ConstructionPanel).toBe('function');
  });
});

describe('FieldPanel', () => {
  it('should export FieldPanel component', async () => {
    const mod = await import('../../src/components/tools/FieldPanel.tsx');
    expect(typeof mod.FieldPanel).toBe('function');
  });
});

describe('CoveragePanel', () => {
  it('should export CoveragePanel component', async () => {
    const mod = await import('../../src/components/tools/CoveragePanel.tsx');
    expect(typeof mod.CoveragePanel).toBe('function');
  });
});

describe('IncidentPanel', () => {
  it('should export IncidentPanel component', async () => {
    const mod = await import('../../src/components/tools/IncidentPanel.tsx');
    expect(typeof mod.IncidentPanel).toBe('function');
  });
});
