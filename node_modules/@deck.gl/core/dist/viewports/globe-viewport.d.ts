import Viewport from "./viewport.js";
export declare const GLOBE_RADIUS = 256;
export type GlobeViewportOptions = {
    /** Name of the viewport */
    id?: string;
    /** Left offset from the canvas edge, in pixels */
    x?: number;
    /** Top offset from the canvas edge, in pixels */
    y?: number;
    /** Viewport width in pixels */
    width?: number;
    /** Viewport height in pixels */
    height?: number;
    /** Longitude in degrees */
    longitude?: number;
    /** Latitude in degrees */
    latitude?: number;
    /** Camera altitude relative to the viewport height, used to control the FOV. Default `1.5` */
    altitude?: number;
    position?: number[];
    /** Zoom level */
    zoom?: number;
    /** Use orthographic projection */
    orthographic?: boolean;
    /** Camera fovy in degrees. If provided, overrides `altitude` */
    fovy?: number;
    /** Scaler for the near plane, 1 unit equals to the height of the viewport. Default `0.5` */
    nearZMultiplier?: number;
    /** Scaler for the far plane, 1 unit equals to the distance from the camera to the edge of the screen. Default `1` */
    farZMultiplier?: number;
    /** Optionally override the near plane position. `nearZMultiplier` is ignored if `nearZ` is supplied. */
    nearZ?: number;
    /** Optionally override the far plane position. `farZMultiplier` is ignored if `farZ` is supplied. */
    farZ?: number;
    /** The resolution at which to turn flat features into 3D meshes, in degrees. Smaller numbers will generate more detailed mesh. Default `10` */
    resolution?: number;
};
export default class GlobeViewport extends Viewport {
    static displayName: string;
    longitude: number;
    latitude: number;
    fovy: number;
    resolution: number;
    constructor(opts?: GlobeViewportOptions);
    get projectionMode(): 2;
    getDistanceScales(): import("./viewport").DistanceScales;
    getBounds(options?: {
        z?: number;
    }): [number, number, number, number];
    unproject(xyz: number[], { topLeft, targetZ }?: {
        topLeft?: boolean;
        targetZ?: number;
    }): number[];
    projectPosition(xyz: number[]): [number, number, number];
    unprojectPosition(xyz: number[]): [number, number, number];
    projectFlat(xyz: number[]): [number, number];
    unprojectFlat(xyz: number[]): [number, number];
    /**
     * Pan the globe using delta-based movement
     * @param coords - the geographic coordinates where the pan started
     * @param pixel - the current screen position
     * @param startPixel - the screen position where the pan started
     * @returns updated viewport options with new longitude/latitude
     */
    panByPosition([startLng, startLat, startZoom]: number[], pixel: number[], startPixel: number[]): GlobeViewportOptions;
}
export declare function zoomAdjust(latitude: number): number;
//# sourceMappingURL=globe-viewport.d.ts.map