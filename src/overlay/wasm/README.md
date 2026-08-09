# projicio wasm (vendored)

Built artifact of GeoLang/projicio `crates/projicio-wasm`, committed so the app
builds without a Rust toolchain.

Regenerate after changing projicio:

```sh
cd ../projicio
wasm-pack build crates/projicio-wasm --target web --release
cp crates/projicio-wasm/pkg/projicio_wasm.js crates/projicio-wasm/pkg/projicio_wasm.d.ts \
   crates/projicio-wasm/pkg/projicio_wasm_bg.wasm crates/projicio-wasm/pkg/projicio_wasm_bg.wasm.d.ts \
   ../viewtopia/src/overlay/wasm/
```
