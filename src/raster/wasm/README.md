# terrano wasm (vendored)

Built artifact of GeoLang/terrano `crates/terrano-wasm`, committed so the app
builds without a Rust toolchain.

Regenerate after changing terrano:

```sh
cd ../terrano/crates/terrano-wasm
wasm-pack build --target web --release
cp pkg/terrano_wasm.js pkg/terrano_wasm.d.ts pkg/terrano_wasm_bg.wasm \
   pkg/terrano_wasm_bg.wasm.d.ts ../../../viewtopia/src/raster/wasm/
```
