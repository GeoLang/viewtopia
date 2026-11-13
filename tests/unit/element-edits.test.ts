import { describe, expect, it } from 'vitest';
import {
  editResultMessage,
  parseMesh,
  parseNumbers,
  parseTriple,
} from '../../src/features/elements/elementEdits';
import { previewTriangles } from '../../src/features/scene/elementEditMesh';
import { failedGlobalIds } from '../../src/features/coordination/ModelIdsCheck';
import type { IdsReport } from '../../src/features/coordination/api';

describe('element edit numbers', () => {
  it('reads commas and spaces, and rejects a missing or endless number', () => {
    expect(parseNumbers('1, 2, 3')).toEqual([1, 2, 3]);
    expect(parseNumbers('1  2\t3')).toEqual([1, 2, 3]);
    expect(parseTriple('1,2,3')).toEqual([1, 2, 3]);
    expect(parseTriple('1, 2')).toBeNull();
    expect(parseTriple('1, 2, no')).toBeNull();
    expect(parseNumbers('')).toBeNull();
    expect(parseNumbers('Infinity')).toBeNull();
  });

  it('accepts a triangle and rejects a broken mesh', () => {
    expect(parseMesh('0,0,0 1,0,0 0,1,0', '0, 1, 2')).toEqual({
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      indices: [0, 1, 2],
    });
    expect(parseMesh('0,0,0 1,0,0', '0, 1, 2')).toBeNull();
    expect(parseMesh('0,0,0 1,0,0 0,1,0', '0, 1')).toBeNull();
    expect(parseMesh('0,0,0 1,0,0 0,1,0', '0, 1, 3')).toBeNull();
    expect(parseMesh('0,0,0 1,0,0 0,1,0', '0, 1, 1.5')).toBeNull();
  });
});

describe('editResultMessage', () => {
  it('says when the tiles still show the old mesh', () => {
    expect(editResultMessage('delete', false, 'wall')).toContain('hide it');
    expect(editResultMessage('relation', false, 'wall')).toContain('unchanged');
    expect(editResultMessage('translate', true, 'wall')).toContain('draws the new mesh');
    expect(editResultMessage('add', false, 'box-1')).toContain('previous mesh');
    expect(editResultMessage('add', false, 'box-1')).toContain('box-1');
  });
});

describe('previewTriangles', () => {
  it('keeps a triangle and drops a short list or an index past the end', () => {
    const kept = previewTriangles([0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 2]);
    expect(kept?.indices).toEqual(new Uint32Array([0, 1, 2]));
    expect(previewTriangles([0, 0, 0, 1, 0, 0], [0, 1, 2])).toBeNull();
    expect(previewTriangles([0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 3])).toBeNull();
    expect(previewTriangles([0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1])).toBeNull();
  });
});

function report(globalIds: Array<string | null>): IdsReport {
  return {
    title: 'check',
    status: false,
    total_specifications: 1,
    total_specifications_pass: 0,
    total_checks: 1,
    total_checks_pass: 0,
    specifications: [
      {
        name: 'walls',
        description: null,
        status: false,
        total_applicable: globalIds.length,
        total_applicable_pass: 0,
        total_applicable_fail: globalIds.length,
        requirements: [
          {
            description: 'named',
            status: false,
            failed_entities: globalIds.map((global_id, index) => ({
              reason: 'missing',
              class: 'IfcWall',
              name: null,
              id: index,
              global_id,
            })),
            total_applicable: globalIds.length,
            total_pass: 0,
            total_fail: globalIds.length,
          },
        ],
      },
    ],
  };
}

describe('failedGlobalIds', () => {
  it('collects ids from every requirement and skips an element with no global id', () => {
    const first = report(['wall', null]);
    const second = report(['door']);
    const combined: IdsReport = {
      ...first,
      specifications: [...first.specifications, ...second.specifications],
    };
    expect(failedGlobalIds(combined)).toEqual(['wall', 'door']);
    expect(failedGlobalIds(null)).toEqual([]);
    expect(failedGlobalIds(undefined)).toEqual([]);
  });
});
