import LayersPass from "./layers-pass.js";
import type { LayersPassRenderOptions, RenderStats } from "./layers-pass.js";
export default class DrawLayersPass extends LayersPass {
    shouldDrawLayer(layer: any): any;
    render(options: LayersPassRenderOptions): RenderStats[];
}
//# sourceMappingURL=draw-layers-pass.d.ts.map