import { describe, expect, it } from 'vitest';
import { ActionError } from '../../src/actions/registry';
import { isoMoment, resolveOne } from '../../src/actions/resolve';

const LAYERS = [
  { id: 'l-1', name: 'Roads' },
  { id: 'l-2', name: 'Road works' },
  { id: 'l-3', name: 'Buildings' },
];

describe('resolving a thing by id or name', () => {
  it('takes an exact id first', () => {
    expect(resolveOne('layer', 'l-2', LAYERS).name).toBe('Road works');
  });

  it('takes an exact name over a longer name carrying it', () => {
    expect(resolveOne('layer', 'Roads', LAYERS).id).toBe('l-1');
  });

  it('takes a unique part of a name, whatever the case', () => {
    expect(resolveOne('layer', 'BUILD', LAYERS).id).toBe('l-3');
  });

  it('refuses a part of a name that several layers carry', () => {
    expect(() => resolveOne('layer', 'road', LAYERS)).toThrow(ActionError);
    expect(() => resolveOne('layer', 'road', LAYERS)).toThrow(
      '"road" matches 2 layers: Roads, Road works',
    );
  });

  it('refuses two things sharing the exact name', () => {
    const twins = [
      { id: 'd-1', name: 'main' },
      { id: 'd-2', name: 'main' },
    ];
    expect(() => resolveOne('branch', 'main', twins)).toThrow('so name one by id');
  });

  it('names the query and what there was when nothing matches', () => {
    expect(() => resolveOne('layer', 'rivers', LAYERS)).toThrow(
      'no layer matches "rivers". Known layers: Roads, Road works, Buildings',
    );
  });

  it('says so when there is nothing to match against', () => {
    expect(() => resolveOne('project', 'atlas', [])).toThrow(
      'no project matches "atlas", and there is no project to choose from',
    );
  });
});

describe('reading a moment argument', () => {
  it('takes a date the browser reads and answers RFC 3339', () => {
    expect(isoMoment('at', '2026-08-25T10:00:00Z')).toBe('2026-08-25T10:00:00.000Z');
  });

  it('throws naming the argument that is not a date', () => {
    expect(() => isoMoment('at', 'last tuesday')).toThrow(ActionError);
    expect(() => isoMoment('at', 'last tuesday')).toThrow('at is not a date: last tuesday');
  });
});
