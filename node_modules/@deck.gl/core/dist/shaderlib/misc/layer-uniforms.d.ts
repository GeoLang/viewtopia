import type { LayerProps } from "../../types/layer-props.js";
export type LayerUniforms = {
    opacity?: number;
};
export declare const layerUniforms: {
    readonly name: "layer";
    readonly source: "struct LayerUniforms {\n  opacity: f32,\n};\n\n@group(0) @binding(auto)\nvar<uniform> layer: LayerUniforms;\n";
    readonly vs: "layout(std140) uniform layerUniforms {\n  uniform float opacity;\n} layer;\n";
    readonly fs: "layout(std140) uniform layerUniforms {\n  uniform float opacity;\n} layer;\n";
    readonly getUniforms: (props: Partial<LayerProps>) => {
        opacity: number;
    };
    readonly uniformTypes: {
        readonly opacity: "f32";
    };
};
//# sourceMappingURL=layer-uniforms.d.ts.map