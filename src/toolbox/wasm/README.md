# topoi wasm (vendored)

Built artifact of GeoLang/topoi `crates/topoi-wasm`, committed so the app
builds without a Rust toolchain.

Regenerate after changing topoi:

```sh
cd ../topoi
wasm-pack build crates/topoi-wasm --target web --release
cp crates/topoi-wasm/pkg/topoi_wasm.js crates/topoi-wasm/pkg/topoi_wasm.d.ts \
   crates/topoi-wasm/pkg/topoi_wasm_bg.wasm crates/topoi-wasm/pkg/topoi_wasm_bg.wasm.d.ts \
   ../viewtopia/src/toolbox/wasm/
```
