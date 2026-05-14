import { describe, it, expect, beforeEach } from 'vitest';
import { createEntity, createEvent, createTrack, createLink } from '../../src/spacetime/models.js';
import {
  getOntology, getEntityTypes, getEntityType, getLinkTypes, getLinkType,
  addEntityType, addLinkType, removeEntityType, removeLinkType,
  validateEntity, validateLink, getAllowedLinkTypes, getPropertyDefs,
  exportOntology, importOntology, resetOntology,
} from '../../src/spacetime/ontology.js';
import { findDuplicates, autoResolve } from '../../src/spacetime/entity-resolution.js';
import {
  addAttachment, getEntityAttachments, getAttachment,
  removeAttachment, linkAttachment, unlinkAttachment,
  getAllAttachments, searchAttachments, getAttachmentCounts,
  clearAttachments,
} from '../../src/spacetime/attachments.js';
import { buildTimeline, filterTimeline, bucketTimeline } from '../../src/spacetime/timeline-correlation.js';
import {
  setUserClearance, getUserClearance, checkAccess, checkPermission,
  classifyItem, formatMarking, filterByAccess, getClassificationLevels,
} from '../../src/spacetime/classification.js';
import {
  createCase, getCase, getAllCases, updateCase, deleteCase,
  addEntitiesToCase, addCaseNote, updatePhase,
  searchCases, filterCasesByStatus, exportCase, importCase, clearCases,
} from '../../src/spacetime/case-management.js';
import {
  registerSource, getSources, getSource, removeSource,
  recordProvenance, getProvenance, getEntitiesBySource,
  getFieldConflicts, resolveConflict, fusionSummary, clearFusionData,
} from '../../src/spacetime/data-fusion.js';

describe('ontology', () => {
  beforeEach(() => resetOntology());

  it('has default entity and link types', () => {
    const types = getEntityTypes();
    expect(types.length).toBeGreaterThanOrEqual(8);
    expect(getEntityType('person')).toBeDefined();
    expect(getEntityType('vehicle')).toBeDefined();
    expect(getEntityType('device')).toBeDefined();

    const linkTypes = getLinkTypes();
    expect(linkTypes.length).toBeGreaterThanOrEqual(9);
    expect(getLinkType('communication')).toBeDefined();
    expect(getLinkType('colocation')).toBeDefined();
  });

  it('adds and removes custom entity types', () => {
    addEntityType({ id: 'aircraft', label: 'Aircraft', icon: '✈️', color: '#06b6d4', properties: [] });
    expect(getEntityType('aircraft')).toBeDefined();
    removeEntityType('aircraft');
    expect(getEntityType('aircraft')).toBeUndefined();
  });

  it('validates entity against ontology', () => {
    const entity = { kind: 'person', properties: { gender: 'male' } };
    const result = validateEntity(entity);
    expect(result.valid).toBe(true);

    const bad = { kind: 'person', properties: { gender: 'invalid_value' } };
    const badResult = validateEntity(bad);
    expect(badResult.valid).toBe(false);
    expect(badResult.errors.length).toBeGreaterThan(0);
  });

  it('validates link types', () => {
    const link = { kind: 'communication' };
    const src = { kind: 'person' };
    const tgt = { kind: 'device' };
    const result = validateLink(link, src, tgt);
    expect(result.valid).toBe(true);

    // Invalid: financial between person and event
    const badLink = { kind: 'financial' };
    const badTgt = { kind: 'event' };
    const badResult = validateLink(badLink, src, badTgt);
    expect(badResult.valid).toBe(false);
  });

  it('getAllowedLinkTypes returns valid links between types', () => {
    const allowed = getAllowedLinkTypes('person', 'device');
    expect(allowed.length).toBeGreaterThan(0);
    expect(allowed.some(l => l.id === 'ownership')).toBe(true);
  });

  it('exports and imports ontology', () => {
    const exported = exportOntology();
    expect(exported.name).toBe('Default Intelligence Ontology');
    expect(Object.keys(exported.entityTypes).length).toBeGreaterThan(0);

    addEntityType({ id: 'test123', label: 'Test', icon: '🔬', color: '#fff', properties: [] });
    const withTest = exportOntology();
    resetOntology();
    expect(getEntityType('test123')).toBeUndefined();
    importOntology(withTest);
    expect(getEntityType('test123')).toBeDefined();
    resetOntology();
  });
});

describe('entity-resolution', () => {
  it('finds duplicate entities by name similarity', () => {
    const entities = new Map();
    const e1 = createEntity('John Smith', 'person');
    const e2 = createEntity('Jon Smith', 'person');
    const e3 = createEntity('Alice Johnson', 'person');
    entities.set(e1.id, e1);
    entities.set(e2.id, e2);
    entities.set(e3.id, e3);

    const dupes = findDuplicates(entities, { minScore: 0.3 });
    expect(dupes.length).toBeGreaterThan(0);
    // John Smith / Jon Smith should be the top match
    const topMatch = dupes[0];
    expect([topMatch.entityA, topMatch.entityB]).toContain(e1.id);
    expect([topMatch.entityA, topMatch.entityB]).toContain(e2.id);
  });

  it('finds duplicates by alias overlap', () => {
    const entities = new Map();
    const e1 = createEntity('Subject A', 'person');
    e1.aliases = ['alpha-one', '+1234567'];
    const e2 = createEntity('Unknown Subject', 'person');
    e2.aliases = ['+1234567'];
    entities.set(e1.id, e1);
    entities.set(e2.id, e2);

    const dupes = findDuplicates(entities, { minScore: 0.3 });
    expect(dupes.length).toBeGreaterThan(0);
    expect(dupes[0].reasons.some(r => r.includes('Alias'))).toBe(true);
  });
});

describe('attachments', () => {
  beforeEach(() => clearAttachments());

  it('adds and retrieves attachments', () => {
    const file = new Blob(['test content'], { type: 'text/plain' });
    file.name = 'report.txt';

    const att = addAttachment(file, ['entity-1'], { notes: 'Intelligence report' });
    expect(att.id).toBeDefined();
    expect(att.name).toBe('report.txt');

    const atts = getEntityAttachments('entity-1');
    expect(atts.length).toBe(1);
    expect(atts[0].notes).toBe('Intelligence report');
  });

  it('links and unlinks attachments', () => {
    const file = new Blob(['test'], { type: 'text/plain' });
    file.name = 'evidence.pdf';

    const att = addAttachment(file, ['entity-1']);
    linkAttachment(att.id, 'entity-2');
    expect(getEntityAttachments('entity-2').length).toBe(1);

    unlinkAttachment(att.id, 'entity-1');
    expect(getEntityAttachments('entity-1').length).toBe(0);
    expect(getEntityAttachments('entity-2').length).toBe(1);
  });

  it('searches attachments by name', () => {
    const f1 = new Blob(['a'], { type: 'text/plain' });
    f1.name = 'intercept-report.txt';
    const f2 = new Blob(['b'], { type: 'image/png' });
    f2.name = 'satellite-image.png';

    addAttachment(f1, ['e1']);
    addAttachment(f2, ['e1']);

    expect(searchAttachments('intercept').length).toBe(1);
    expect(searchAttachments('satellite').length).toBe(1);
  });
});

describe('timeline-correlation', () => {
  it('builds timeline from tracks and links', () => {
    const entities = new Map();
    entities.set('e1', createEntity('Alice', 'person'));
    entities.set('e2', createEntity('Bob', 'person'));

    const track = createTrack('e1', [
      createEvent('e1', 1000, -73.9, 40.7),
      createEvent('e1', 2000, -73.91, 40.71),
    ]);
    const link = createLink('e1', 'e2', 'communication');
    const items = buildTimeline([track], entities, [link], [], []);

    expect(items.length).toBe(3); // 2 events + 1 link
    expect(items.some(i => i.type === 'movement')).toBe(true);
    expect(items.some(i => i.type === 'link')).toBe(true);
  });

  it('filters timeline by type and entity', () => {
    const items = [
      { entityId: 'e1', type: 'movement', timestamp: 1000, label: 'a' },
      { entityId: 'e2', type: 'link', timestamp: 2000, label: 'b' },
      { entityId: 'e1', type: 'alert', timestamp: 3000, label: 'c' },
    ];

    expect(filterTimeline(items, { types: ['movement'] }).length).toBe(1);
    expect(filterTimeline(items, { entityIds: ['e1'] }).length).toBe(2);
    expect(filterTimeline(items, { startTime: 2000 }).length).toBe(2);
  });

  it('buckets timeline items', () => {
    const items = [
      { timestamp: 1000 }, { timestamp: 2000 }, { timestamp: 5000 },
    ];
    const buckets = bucketTimeline(items, 3000);
    expect(buckets.size).toBe(2); // [0-3000) and [3000-6000)
  });
});

describe('classification', () => {
  it('checks access based on clearance level', () => {
    setUserClearance({ userId: 'analyst1', displayName: 'Analyst', level: 'secret', compartments: ['SIGINT'], role: 'analyst' });

    expect(checkAccess('unclassified').allowed).toBe(true);
    expect(checkAccess('secret').allowed).toBe(true);
    expect(checkAccess('top_secret').allowed).toBe(false);
  });

  it('checks compartment access', () => {
    setUserClearance({ userId: 'analyst1', displayName: 'Analyst', level: 'ts_sci', compartments: ['SIGINT', 'HUMINT'], role: 'analyst' });

    expect(checkAccess('secret', ['SIGINT']).allowed).toBe(true);
    expect(checkAccess('secret', ['IMINT']).allowed).toBe(false);
  });

  it('checks role-based permissions', () => {
    setUserClearance({ userId: 'viewer1', displayName: 'Viewer', level: 'secret', compartments: [], role: 'viewer' });
    expect(checkPermission('viewer')).toBe(true);
    expect(checkPermission('analyst')).toBe(false);
    expect(checkPermission('admin')).toBe(false);
  });

  it('formats classification markings', () => {
    expect(formatMarking('secret', ['SIGINT', 'HUMINT'])).toBe('SECRET // SIGINT / HUMINT');
    expect(formatMarking('unclassified')).toBe('UNCLASSIFIED');
  });

  it('filters items by access', () => {
    setUserClearance({ userId: 'a1', displayName: 'A', level: 'secret', compartments: ['SIGINT'], role: 'analyst' });

    const items = [
      { id: 1, classification: 'unclassified' },
      { id: 2, classification: 'secret', compartments: ['SIGINT'] },
      { id: 3, classification: 'top_secret' },
    ];

    const filtered = filterByAccess(items);
    expect(filtered.length).toBe(2);
    expect(filtered.map(i => i.id)).toEqual([1, 2]);
  });
});

describe('case-management', () => {
  beforeEach(() => clearCases());

  it('creates and retrieves cases', () => {
    const c = createCase('Operation Alpha', { analyst: 'Smith', tags: ['priority'] });
    expect(c.id).toBeDefined();
    expect(c.name).toBe('Operation Alpha');
    expect(c.status).toBe('draft');

    const retrieved = getCase(c.id);
    expect(retrieved.analyst).toBe('Smith');
  });

  it('adds entities and notes to cases', () => {
    const c = createCase('Test Case');
    addEntitiesToCase(c.id, ['e1', 'e2']);
    expect(c.entityIds).toEqual(['e1', 'e2']);

    const note = addCaseNote(c.id, 'Initial analysis complete', 'Analyst1');
    expect(c.notes.length).toBe(1);
    expect(note.text).toBe('Initial analysis complete');
  });

  it('updates case phases', () => {
    const c = createCase('Phase Test');
    updatePhase(c.id, 'collect', 'complete', 'All sources ingested');
    const phase = c.phases.find(p => p.id === 'collect');
    expect(phase.status).toBe('complete');
    expect(phase.notes).toBe('All sources ingested');
  });

  it('searches cases', () => {
    createCase('Operation Alpha', { tags: ['urgent'] });
    createCase('Operation Beta');
    createCase('Project Gamma');

    expect(searchCases('alpha').length).toBe(1);
    expect(searchCases('operation').length).toBe(2);
  });

  it('exports and imports cases', () => {
    const c = createCase('Export Test', { analyst: 'Test', tags: ['test'] });
    addCaseNote(c.id, 'Test note');
    const json = exportCase(c.id);
    expect(json).toContain('Export Test');

    clearCases();
    const imported = importCase(json);
    expect(imported.name).toBe('Export Test');
    expect(imported.notes.length).toBe(1);
  });
});

describe('data-fusion', () => {
  beforeEach(() => clearFusionData());

  it('registers and retrieves data sources', () => {
    const src = registerSource('Cell Tower Feed', 'sigint', { classification: 'secret' });
    expect(src.id).toBeDefined();
    expect(getSources().length).toBe(1);
    expect(getSource(src.id).name).toBe('Cell Tower Feed');
  });

  it('records and queries provenance', () => {
    const src1 = registerSource('Source A', 'humint');
    const src2 = registerSource('Source B', 'sigint');

    recordProvenance('entity-1', src1.id, 'name', 'John Smith', 0.8);
    recordProvenance('entity-1', src2.id, 'name', 'Jon Smith', 0.9);
    recordProvenance('entity-1', src1.id, 'location', 'London', 0.7);

    const prov = getProvenance('entity-1');
    expect(prov.length).toBe(3);

    const entityIds = getEntitiesBySource(src1.id);
    expect(entityIds).toContain('entity-1');
  });

  it('detects field conflicts', () => {
    const src1 = registerSource('Source A', 'humint');
    const src2 = registerSource('Source B', 'sigint');

    recordProvenance('entity-1', src1.id, 'name', 'John Smith');
    recordProvenance('entity-1', src2.id, 'name', 'Jon Smith'); // Different value!

    const conflicts = getFieldConflicts('entity-1');
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].field).toBe('name');
    expect(conflicts[0].records.length).toBe(2);
  });

  it('provides fusion summary', () => {
    const src = registerSource('Test Source', 'osint');
    recordProvenance('e1', src.id, 'name', 'Test');
    recordProvenance('e2', src.id, 'name', 'Test2');

    const summary = fusionSummary();
    expect(summary.totalSources).toBe(1);
    expect(summary.totalRecords).toBe(2);
    expect(summary.sources[0].entityCount).toBe(2);
  });
});
