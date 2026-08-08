import { describe, expect, it } from 'vitest';
import {
  commentExportFilename,
  commentsAsCsv,
  commentsAsGeoJson,
} from '../../src/live/commentExport';
import type { LiveComment } from '../../src/live/types';

function byId(comments: LiveComment[]): Record<string, LiveComment> {
  return Object.fromEntries(comments.map((entry) => [entry.id, entry]));
}

const ANCHORED_ROOT: LiveComment = {
  id: 'root-1',
  actor: 'ada',
  authorName: 'Ada Lovelace',
  text: 'check the "north" edge, and this comma',
  createdAt: Date.UTC(2026, 7, 8, 10, 0, 0),
  resolved: true,
  anchor: { lng: 7.42, lat: 43.73, zoom: 12 },
};

const REPLY: LiveComment = {
  id: 'reply-1',
  parentId: 'root-1',
  actor: 'grace',
  authorName: 'Grace',
  text: 'two\nlines',
  createdAt: Date.UTC(2026, 7, 8, 11, 0, 0),
};

const PLAIN_ROOT: LiveComment = {
  id: 'root-2',
  actor: 'ada',
  authorName: 'Ada Lovelace',
  text: 'no anchor here',
  createdAt: Date.UTC(2026, 7, 9, 9, 0, 0),
  resolved: false,
};

describe('comment csv export', () => {
  it('writes threads in order with escaped fields and anchor columns', () => {
    const csv = commentsAsCsv(byId([PLAIN_ROOT, REPLY, ANCHORED_ROOT]));
    const lines = csv.split('\n');
    expect(lines[0]).toBe('id,parentId,author,text,createdAt,resolved,lng,lat,zoom');
    expect(lines[1]).toBe(
      'root-1,,Ada Lovelace,"check the ""north"" edge, and this comma",' +
        '2026-08-08T10:00:00.000Z,true,7.42,43.73,12',
    );
    // the reply's newline keeps it one csv record across two text lines
    expect(lines[2]).toBe('reply-1,root-1,Grace,"two');
    expect(lines[3]).toBe('lines",2026-08-08T11:00:00.000Z,,,,');
    expect(lines[4]).toBe('root-2,,Ada Lovelace,no anchor here,2026-08-09T09:00:00.000Z,false,,,');
    expect(lines).toHaveLength(5);
  });
});

describe('comment geojson export', () => {
  it('points anchored comments and leaves the rest geometry null', () => {
    const collection = JSON.parse(commentsAsGeoJson(byId([PLAIN_ROOT, REPLY, ANCHORED_ROOT])));
    expect(collection.type).toBe('FeatureCollection');
    expect(collection.features).toHaveLength(3);

    const [root, reply, plain] = collection.features;
    expect(root.geometry).toEqual({ type: 'Point', coordinates: [7.42, 43.73] });
    expect(root.properties).toEqual({
      id: 'root-1',
      parentId: null,
      author: 'Ada Lovelace',
      text: 'check the "north" edge, and this comma',
      createdAt: '2026-08-08T10:00:00.000Z',
      resolved: true,
      zoom: 12,
    });
    expect(reply.geometry).toBeNull();
    expect(reply.properties.parentId).toBe('root-1');
    expect(reply.properties.resolved).toBeNull();
    expect(plain.geometry).toBeNull();
    expect(plain.properties.resolved).toBe(false);
  });
});

describe('comment export filenames', () => {
  it('slugs the document name and falls back when it yields nothing', () => {
    expect(commentExportFilename('Coastline Review #2', 'csv')).toBe(
      'comments-coastline-review-2.csv',
    );
    expect(commentExportFilename('   ', 'geojson')).toBe('comments-live-map.geojson');
  });
});
