// @types/vt-pbf types fromGeojsonVt as taking a whole geojson-vt index; the
// real API (github.com/mapbox/vt-pbf) takes one tile per layer name.
declare module 'vt-pbf' {
  import geojsonvt = require('geojson-vt');

  export function fromGeojsonVt(
    layers: Record<string, geojsonvt.Tile>,
    options?: { version?: number; extent?: number },
  ): Uint8Array<ArrayBuffer>;
}
