import { describe, it, expect } from 'vitest';
import { parseTrack } from '../../src/lib/trackParsers';

const GPX = `<?xml version="1.0"?>
<gpx><trk><trkseg>
<trkpt lat="51.5" lon="-0.1"><ele>10</ele></trkpt>
<trkpt lat="51.51" lon="-0.12"><ele>12</ele></trkpt>
<trkpt lat="51.49" lon="-0.09"></trkpt>
</trkseg></trk></gpx>`;

const KML = `<?xml version="1.0"?>
<kml><Document><Placemark><LineString><coordinates>
-0.1,51.5,10 -0.12,51.51,12 -0.09,51.49,0
</coordinates></LineString></Placemark></Document></kml>`;

const CSV = `name,lat,lon,ele
a,51.5,-0.1,10
b,51.51,-0.12,12
c,51.49,-0.09,`;

describe('parseTrack', () => {
  it('parses GPX trkpt with elevation', () => {
    const t = parseTrack('walk.gpx', GPX);
    expect(t.points.length).toBe(3);
    expect(t.points[0]).toEqual([-0.1, 51.5, 10]);
    expect(t.points[2][2]).toBeUndefined();
  });

  it('parses KML coordinates lon,lat,alt', () => {
    const t = parseTrack('walk.kml', KML);
    expect(t.points.length).toBe(3);
    expect(t.points[1]).toEqual([-0.12, 51.51, 12]);
  });

  it('parses CSV with header-detected lat/lon columns', () => {
    const t = parseTrack('walk.csv', CSV);
    expect(t.points.length).toBe(3);
    expect(t.points[0]).toEqual([-0.1, 51.5, 10]);
    expect(t.points[2][2]).toBeUndefined();
  });

  it('throws on unsupported extension', () => {
    expect(() => parseTrack('walk.xyz', '')).toThrow();
  });
});
