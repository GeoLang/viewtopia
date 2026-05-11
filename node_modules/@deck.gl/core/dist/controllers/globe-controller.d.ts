import Controller, { ControllerProps } from "./controller.js";
import { MapState, MapStateProps } from "./map-controller.js";
import type { MapStateInternal } from "./map-controller.js";
import LinearInterpolator from "../transitions/linear-interpolator.js";
type GlobeStateInternal = MapStateInternal & {
    startPanPos?: [number, number];
};
declare class GlobeState extends MapState {
    constructor(options: MapStateProps & GlobeStateInternal & {
        makeViewport: (props: Record<string, any>) => any;
    });
    panStart({ pos }: {
        pos: [number, number];
    }): GlobeState;
    pan({ pos, startPos }: {
        pos: [number, number];
        startPos?: [number, number];
    }): GlobeState;
    panEnd(): GlobeState;
    zoom({ scale }: {
        scale: number;
    }): MapState;
    applyConstraints(props: Required<MapStateProps>): Required<MapStateProps>;
    _constrainZoom(zoom: number, props?: Required<MapStateProps>): number;
}
export default class GlobeController extends Controller<MapState> {
    ControllerState: typeof GlobeState;
    transition: {
        transitionDuration: number;
        transitionInterpolator: LinearInterpolator;
    };
    dragMode: 'pan' | 'rotate';
    setProps(props: ControllerProps): void;
}
export {};
//# sourceMappingURL=globe-controller.d.ts.map