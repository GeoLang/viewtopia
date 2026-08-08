import { commentThreads } from './comments';
import type { LiveComment } from './types';

/** Threads flattened in display order: each root followed by its replies. */
function commentsInThreadOrder(comments: Record<string, LiveComment>): LiveComment[] {
  return commentThreads(comments).flatMap((thread) => [thread.root, ...thread.replies]);
}

function csvField(value: string | number | boolean | null): string {
  if (value === null) return '';
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function commentsAsCsv(comments: Record<string, LiveComment>): string {
  const header = 'id,parentId,author,text,createdAt,resolved,lng,lat,zoom';
  const rows = commentsInThreadOrder(comments).map((comment) =>
    [
      comment.id,
      comment.parentId ?? null,
      comment.authorName,
      comment.text,
      new Date(comment.createdAt).toISOString(),
      comment.parentId ? null : Boolean(comment.resolved),
      comment.anchor?.lng ?? null,
      comment.anchor?.lat ?? null,
      comment.anchor?.zoom ?? null,
    ]
      .map(csvField)
      .join(','),
  );
  return [header, ...rows].join('\n');
}

/**
 * A FeatureCollection with one feature per comment. An anchored comment is a
 * Point at its anchor, an unanchored one keeps `geometry: null`, which GeoJSON
 * allows and every consumer can filter on.
 */
export function commentsAsGeoJson(comments: Record<string, LiveComment>): string {
  const features = commentsInThreadOrder(comments).map((comment) => ({
    type: 'Feature' as const,
    geometry: comment.anchor
      ? { type: 'Point' as const, coordinates: [comment.anchor.lng, comment.anchor.lat] }
      : null,
    properties: {
      id: comment.id,
      parentId: comment.parentId ?? null,
      author: comment.authorName,
      text: comment.text,
      createdAt: new Date(comment.createdAt).toISOString(),
      resolved: comment.parentId ? null : Boolean(comment.resolved),
      zoom: comment.anchor?.zoom ?? null,
    },
  }));
  return JSON.stringify({ type: 'FeatureCollection', features }, null, 2);
}

export function commentExportFilename(documentName: string, extension: string): string {
  const slug =
    documentName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'live-map';
  return `comments-${slug}.${extension}`;
}
