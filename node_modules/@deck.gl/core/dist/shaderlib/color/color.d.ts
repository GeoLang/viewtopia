export type ColorProps = {
    /**
     * Opacity of the layer, between 0 and 1. Default 1.
     */
    opacity?: number;
};
export type ColorUniforms = {
    opacity?: number;
};
declare const _default: {
    readonly name: "color";
    readonly dependencies: [];
    readonly source: "\n\n@must_use\nfn deckgl_premultiplied_alpha(fragColor: vec4<f32>) -> vec4<f32> {\n    return vec4(fragColor.rgb * fragColor.a, fragColor.a); \n};\n";
    readonly getUniforms: (_props: Partial<ColorProps>) => {};
};
export default _default;
//# sourceMappingURL=color.d.ts.map