import { describe, expect, it } from 'vitest';
import { sectionFillStyle } from '../../src/features/scene/sectionFill';

describe('section fill style', () => {
  it('paints a curtain wall as a curtain, not a wall', () => {
    expect(sectionFillStyle('IfcCurtainWall')).toEqual(sectionFillStyle('IfcPlate'));
    expect(sectionFillStyle('IfcCurtainWall').fill).not.toBe(sectionFillStyle('IfcWall').fill);
  });

  it('gives each cut class its own fill', () => {
    const fills = ['IfcWindow', 'IfcDoor', 'IfcColumn', 'IfcSlab', 'IfcRoof', 'IfcWall'].map(
      (ifcClass) => sectionFillStyle(ifcClass).fill,
    );
    expect(new Set(fills).size).toBe(fills.length);
  });

  it('uses a wider outline on a column than on a window', () => {
    expect(sectionFillStyle('IfcColumn').width).toBeGreaterThan(sectionFillStyle('IfcWindow').width);
  });

  it('keeps the grey fill when the class is missing or unknown', () => {
    expect(sectionFillStyle(null)).toEqual(sectionFillStyle(undefined));
    expect(sectionFillStyle('IfcCovering')).toEqual(sectionFillStyle(null));
    expect(sectionFillStyle(null).fill).toBe('#5c5f66');
  });
});
