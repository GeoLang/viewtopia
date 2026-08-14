import { describe, expect, it } from 'vitest';
import { submissionsToGeoJson } from '../../src/lib/collecta';

function submission(overrides: Record<string, unknown>): Record<string, unknown> {
  return { id: 'a2f1b9c0-0000-0000-0000-000000000001', values: {}, ...overrides };
}

describe('submissionsToGeoJson', () => {
  it('takes geometry from the first geo field in form order, not value order', () => {
    const { geojson } = submissionsToGeoJson(
      ['site', 'boundary'],
      [
        submission({
          values: {
            boundary: {
              GeoShape: [
                { latitude: 0, longitude: 0 },
                { latitude: 0, longitude: 1 },
                { latitude: 1, longitude: 1 },
              ],
            },
            site: { GeoPoint: { latitude: 45.5, longitude: -73.6, altitude: 30 } },
          },
        }),
      ],
    );
    expect(geojson.features).toHaveLength(1);
    expect(geojson.features[0].geometry).toEqual({
      type: 'Point',
      coordinates: [-73.6, 45.5, 30],
    });
  });

  it('closes an open shape ring', () => {
    const { geojson } = submissionsToGeoJson(
      ['boundary'],
      [
        submission({
          values: {
            boundary: {
              GeoShape: [
                { latitude: 0, longitude: 0 },
                { latitude: 0, longitude: 1 },
                { latitude: 1, longitude: 1 },
              ],
            },
          },
        }),
      ],
    );
    const polygon = geojson.features[0].geometry as GeoJSON.Polygon;
    expect(polygon.type).toBe('Polygon');
    expect(polygon.coordinates[0]).toHaveLength(4);
    expect(polygon.coordinates[0][0]).toEqual(polygon.coordinates[0][3]);
  });

  it('falls back to the device location and marks the rest unlocated', () => {
    const { geojson, submissions } = submissionsToGeoJson(
      ['site'],
      [
        submission({ device_location: { latitude: 1, longitude: 2 } }),
        submission({ id: 'a2f1b9c0-0000-0000-0000-000000000002' }),
      ],
    );
    expect(geojson.features).toHaveLength(1);
    expect(geojson.features[0].geometry).toEqual({ type: 'Point', coordinates: [2, 1] });
    expect(submissions.map((s) => s.located)).toEqual([true, false]);
  });

  it('ignores a trace too short to be a line', () => {
    const { geojson, submissions } = submissionsToGeoJson(
      ['path'],
      [submission({ values: { path: { GeoTrace: [{ latitude: 1, longitude: 2 }] } } })],
    );
    expect(geojson.features).toHaveLength(0);
    expect(submissions[0].located).toBe(false);
  });

  it('flattens scalar values to properties and drops files and repeats', () => {
    const { geojson } = submissionsToGeoJson(
      ['site'],
      [
        submission({
          status: 'Complete',
          completed_at: '2026-08-14T12:00:00Z',
          collector_id: 'user-1',
          values: {
            site: { GeoPoint: { latitude: 1, longitude: 2 } },
            species: { Text: 'oak' },
            count: { Integer: 3 },
            healthy: { Boolean: true },
            symptoms: { MultiChoice: ['rot', 'rust'] },
            photo: { Attachment: 'a2f1b9c0-0000-0000-0000-00000000000f' },
            plots: { Repeat: [{ area: { Decimal: 1.5 } }] },
          },
        }),
      ],
    );
    expect(geojson.features[0].properties).toEqual({
      submission_id: 'a2f1b9c0-0000-0000-0000-000000000001',
      status: 'Complete',
      completed_at: '2026-08-14T12:00:00Z',
      collector: 'user-1',
      species: 'oak',
      count: 3,
      healthy: true,
      symptoms: 'rot, rust',
    });
  });

  it('lists attachments per submission for the panel', () => {
    const { submissions } = submissionsToGeoJson(
      [],
      [
        submission({
          attachments: [
            {
              id: 'a2f1b9c0-0000-0000-0000-00000000000f',
              field_name: 'photo',
              filename: 'tree.jpg',
              mime_type: 'image/jpeg',
              size_bytes: 12345,
            },
          ],
        }),
      ],
    );
    expect(submissions[0].attachments).toEqual([
      {
        id: 'a2f1b9c0-0000-0000-0000-00000000000f',
        fieldName: 'photo',
        filename: 'tree.jpg',
        mimeType: 'image/jpeg',
      },
    ]);
  });
});
