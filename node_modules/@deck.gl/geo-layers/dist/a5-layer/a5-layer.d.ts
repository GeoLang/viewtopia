import { AccessorFunction, DefaultProps } from '@deck.gl/core';
import GeoCellLayer, { GeoCellLayerProps } from "../geo-cell-layer/GeoCellLayer.js";
/** All properties supported by A5Layer. */
export type A5LayerProps<DataT = unknown> = _A5LayerProps<DataT> & GeoCellLayerProps<DataT>;
/** Properties added by A5Layer. */
type _A5LayerProps<DataT> = {
    /**
     * Called for each data object to retrieve the A5 pentagonal cell identifier.
     *
     * By default, it reads `pentagon` property of data object.
     */
    getPentagon?: AccessorFunction<DataT, string | bigint>;
};
/** Render filled and/or stroked polygons based on the [A5](https://a5geo.org) geospatial indexing system. */
export default class A5Layer<DataT = any, ExtraProps extends {} = {}> extends GeoCellLayer<DataT, Required<_A5LayerProps<DataT>> & ExtraProps> {
    static layerName: string;
    static defaultProps: DefaultProps<A5LayerProps<unknown>>;
    indexToBounds(): Partial<GeoCellLayer['props']> | null;
}
export {};
//# sourceMappingURL=a5-layer.d.ts.map