import Controller, { ControllerProps } from "./controller.js";
import ViewState from "./view-state.js";
import type Viewport from "../viewports/viewport.js";
import LinearInterpolator from "../transitions/linear-interpolator.js";
export type OrthographicStateProps = {
    width: number;
    height: number;
    target?: number[];
    zoom?: number | number[];
    zoomX?: number;
    zoomY?: number;
    zoomAxis?: 'X' | 'Y' | 'all';
    /** Viewport constraints */
    maxZoomX?: number;
    minZoomX?: number;
    maxZoomY?: number;
    minZoomY?: number;
    maxBounds?: ControllerProps['maxBounds'];
};
type OrthographicStateInternal = {
    startPanPosition?: number[];
    startZoomPosition?: number[];
    startZoom?: number[];
};
export declare class OrthographicState extends ViewState<OrthographicState, OrthographicStateProps, OrthographicStateInternal> {
    constructor(options: OrthographicStateProps & OrthographicStateInternal & {
        maxZoom?: number;
        minZoom?: number;
        makeViewport: (props: Record<string, any>) => Viewport;
    });
    /**
     * Start panning
     * @param {[Number, Number]} pos - position on screen where the pointer grabs
     */
    panStart({ pos }: {
        pos: [number, number];
    }): OrthographicState;
    /**
     * Pan
     * @param {[Number, Number]} pos - position on screen where the pointer is
     */
    pan({ pos, startPosition }: {
        pos: [number, number];
        startPosition?: number[];
    }): OrthographicState;
    /**
     * End panning
     * Must call if `panStart()` was called
     */
    panEnd(): OrthographicState;
    /**
     * Start rotating
     */
    rotateStart(): OrthographicState;
    /**
     * Rotate
     */
    rotate(): OrthographicState;
    /**
     * End rotating
     */
    rotateEnd(): OrthographicState;
    shortestPathFrom(viewState: OrthographicState): OrthographicStateProps;
    /**
     * Start zooming
     * @param {[Number, Number]} pos - position on screen where the pointer grabs
     */
    zoomStart({ pos }: {
        pos: [number, number];
    }): OrthographicState;
    /**
     * Zoom
     * @param {[Number, Number]} pos - position on screen where the current target is
     * @param {[Number, Number]} startPos - the target position at
     *   the start of the operation. Must be supplied of `zoomStart()` was not called
     * @param {Number} scale - a number between [0, 1] specifying the accumulated
     *   relative scale.
     */
    zoom({ pos, startPos, scale }: {
        pos: [number, number];
        startPos?: [number, number];
        scale: number;
    }): OrthographicState;
    /**
     * End zooming
     * Must call if `zoomStart()` was called
     */
    zoomEnd(): OrthographicState;
    zoomIn(speed?: number): OrthographicState;
    zoomOut(speed?: number): OrthographicState;
    moveLeft(speed?: number): OrthographicState;
    moveRight(speed?: number): OrthographicState;
    moveUp(speed?: number): OrthographicState;
    moveDown(speed?: number): OrthographicState;
    rotateLeft(speed?: number): OrthographicState;
    rotateRight(speed?: number): OrthographicState;
    rotateUp(speed?: number): OrthographicState;
    rotateDown(speed?: number): OrthographicState;
    _project(pos: number[]): number[];
    _unproject(pos: number[]): number[];
    _calculateNewZoom({ scale, startZoom }: {
        scale: number;
        startZoom?: number[];
    }): {
        zoomX: number;
        zoomY: number;
    };
    _panFromCenter(offset: any): OrthographicState;
    _getUpdatedState(newProps: any): OrthographicState;
    applyConstraints(props: Required<OrthographicStateProps>): Required<OrthographicStateProps>;
    _constrainZoom({ zoomX, zoomY }: {
        zoomX: number;
        zoomY: number;
    }, props?: Required<OrthographicStateProps>): {
        zoomX: number;
        zoomY: number;
    };
}
export default class OrthographicController extends Controller<OrthographicState> {
    ControllerState: typeof OrthographicState;
    transition: {
        transitionDuration: number;
        transitionInterpolator: LinearInterpolator;
    };
    dragMode: 'pan' | 'rotate';
    setProps(props: ControllerProps & OrthographicStateProps): void;
    _onPanRotate(): boolean;
}
export {};
//# sourceMappingURL=orthographic-controller.d.ts.map