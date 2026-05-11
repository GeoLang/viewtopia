import MapController from "./map-controller.js";
import { MapState, MapStateProps } from "./map-controller.js";
import type { ControllerProps, InteractionState } from "./controller.js";
/**
 * Controller that extends MapController with terrain-aware behavior.
 * The camera smoothly follows terrain elevation during pan/zoom.
 */
export default class TerrainController extends MapController {
    /** Cached terrain altitude from depth picking at viewport center (smoothed) */
    private _terrainAltitude?;
    /** Raw (unsmoothed) terrain altitude from latest pick */
    private _terrainAltitudeTarget?;
    /** rAF handle for periodic terrain altitude picking */
    private _pickFrameId;
    /** Timestamp of last pick */
    private _lastPickTime;
    setProps(props: ControllerProps & MapStateProps & {
        rotationPivot?: 'center' | '2d' | '3d';
        getAltitude?: (pos: [number, number]) => number | undefined;
    }): void;
    finalize(): void;
    protected updateViewport(newControllerState: MapState, extraProps?: Record<string, any> | null, interactionState?: InteractionState): void;
    private _pickTerrainCenterAltitude;
    /**
     * Compute viewport adjustments to keep the view visually the same
     * when shifting position to [0, 0, altitude].
     */
    private _rebaseViewport;
}
//# sourceMappingURL=terrain-controller.d.ts.map