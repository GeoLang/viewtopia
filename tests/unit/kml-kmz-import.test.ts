import { describe, it, expect } from 'vitest';
import { zipSync } from 'fflate';
import { geojsonFromKmlKmzGpx } from '../../src/plugins/kml-tools/parseKml';

const POINT_KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>spot</name>
      <Point><coordinates>-0.1,51.5,0</coordinates></Point>
    </Placemark>
  </Document>
</kml>`;

describe('geojsonFromKmlKmzGpx', () => {
  it('reads a point from KML', () => {
    const geojson = geojsonFromKmlKmzGpx('spot.kml', new TextEncoder().encode(POINT_KML));
    expect(geojson.features).toHaveLength(1);
    expect(geojson.features[0].geometry).toEqual({
      type: 'Point',
      coordinates: [-0.1, 51.5, 0],
    });
  });

  it('reads doc.kml from a KMZ zip, not the zip bytes as XML', () => {
    const kmz = zipSync({ 'doc.kml': new TextEncoder().encode(POINT_KML) });
    const geojson = geojsonFromKmlKmzGpx('spot.kmz', kmz);
    expect(geojson.features).toHaveLength(1);
    expect(geojson.features[0].properties?.name).toBe('spot');
  });

  it('falls back to the first nested kml when doc.kml is missing', () => {
    const kmz = zipSync({
      'files/inner.kml': new TextEncoder().encode(POINT_KML),
    });
    const geojson = geojsonFromKmlKmzGpx('nested.kmz', kmz);
    expect(geojson.features).toHaveLength(1);
  });

  it('throws when a KMZ has no kml', () => {
    const kmz = zipSync({ 'readme.txt': new TextEncoder().encode('nope') });
    expect(() => geojsonFromKmlKmzGpx('empty.kmz', kmz)).toThrow(/no KML/i);
  });
});
