// deck.gl
// SPDX-License-Identifier: MIT
// Copyright (c) vis.gl contributors
const colorWGSL = /* WGSL */ `

@must_use
fn deckgl_premultiplied_alpha(fragColor: vec4<f32>) -> vec4<f32> {
    return vec4(fragColor.rgb * fragColor.a, fragColor.a); 
};
`;
export default {
    name: 'color',
    dependencies: [],
    source: colorWGSL,
    getUniforms: (_props) => {
        // TODO (kaapp) Handle layer opacity
        // apply gamma to opacity to make it visually "linear"
        // TODO - v10: use raw opacity?
        // opacity: Math.pow(props.opacity!, 1 / 2.2)
        return {};
    }
    // @ts-ignore TODO v9.1
};
//# sourceMappingURL=color.js.map