import { AccessorFunction, DefaultProps } from '@deck.gl/core';
import GeoCellLayer, { GeoCellLayerProps } from "../geo-cell-layer/GeoCellLayer.js";
/** All properties supported by GeohashLayer. */
export type GeohashLayerProps<DataT = unknown> = _GeohashLayerProps<DataT> & GeoCellLayerProps<DataT>;
/** Properties added by GeohashLayer. */
type _GeohashLayerProps<DataT> = {
    /**
     * Called for each data object to retrieve the geohash string identifier.
     *
     * By default, it reads `geohash` property of data object.
     */
    getGeohash?: AccessorFunction<DataT, string>;
};
/** Render filled and/or stroked polygons based on the [Geohash](https://en.wikipedia.org/wiki/Geohash) geospatial indexing system. */
export default class GeohashLayer<DataT = any, ExtraProps extends {} = {}> extends GeoCellLayer<DataT, Required<_GeohashLayerProps<DataT>> & ExtraProps> {
    static layerName: string;
    static defaultProps: DefaultProps<GeohashLayerProps<unknown>>;
    indexToBounds(): Partial<GeoCellLayer['props']> | null;
}
export {};
//# sourceMappingURL=geohash-layer.d.ts.map