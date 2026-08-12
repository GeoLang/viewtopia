import L from 'leaflet';
import { loadTile } from './cache';

/**
 * Leaflet's raster tiles read through the offline tile cache, the same store
 * and the same keys the cached:// scheme serves MapLibre from.
 *
 * The tile coordinates go to the cache untouched, so the layer must not be
 * given tms, zoomOffset or zoomReverse: those change what {z}/{x}/{y} mean in
 * the URL and the key would stop matching the other renderers.
 */
export class CachedTileLayer extends L.TileLayer {
  private readonly tileUrlTemplate: string;

  constructor(tileUrlTemplate: string, options?: L.TileLayerOptions) {
    super(tileUrlTemplate, options);
    this.tileUrlTemplate = tileUrlTemplate;
  }

  createTile(coords: L.Coords, done: L.DoneCallback): HTMLImageElement {
    const tile = document.createElement('img');
    tile.alt = '';
    void this.fillTile(tile, coords, done);
    return tile;
  }

  private async fillTile(
    tile: HTMLImageElement,
    coords: L.Coords,
    done: L.DoneCallback,
  ): Promise<void> {
    try {
      const { bytes, contentType } = await loadTile(
        this.tileUrlTemplate,
        coords.z,
        coords.x,
        coords.y,
      );
      const objectUrl = URL.createObjectURL(new Blob([bytes], { type: contentType }));
      tile.onload = () => {
        URL.revokeObjectURL(objectUrl);
        done(undefined, tile);
      };
      tile.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        done(new Error(`tile did not decode: ${coords.z}/${coords.x}/${coords.y}`), tile);
      };
      tile.src = objectUrl;
    } catch (err) {
      done(err instanceof Error ? err : new Error(String(err)), tile);
    }
  }
}
