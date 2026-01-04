# metadata-core (WASM)

> A core crate for consolidating Gyupic’s metadata-preservation logic into Rust/WASM.

## Goals

- Implement the `derive/apply/filename` specification in Rust as a single source of truth.
- Provide an API callable from a Web Worker using `Uint8Array` via `wasm-bindgen`.
- Return `metadataSpecVersion = "1.0"` from one place to eliminate mismatches between the TypeScript side and the docs.

## Build Flow (Temporary)

1. Install Rust and the `wasm32-unknown-unknown` target.
2. Run:
   `wasm-pack build wasm/metadata-core --target web --out-dir ../../src/core/metadata/wasm-pkg --out-name metadata_core`
3. The generated artifacts (`metadata_core_bg.wasm` / `.js`) are placed under `src/core/metadata/wasm-pkg/`, and dynamically imported by `src/core/metadata/wasmBridge.ts`.
4. On the TypeScript side, call `configureMetadataCoreLoader` to lazy-load the WASM during Worker initialization.

> The `wasm-pack` invocation is not yet scripted. We plan to add `npm run wasm:build` later (separate task).

## API Sketch

- `metadata_spec_version() -> String`
- `derive_metadata(input: js_sys::Uint8Array) -> Result<JsValue, JsValue>` : Extract EXIF/mtime + warnings.
- `apply_metadata(blob: js_sys::Uint8Array, settings: JsValue) -> Result<ApplyResult, JsValue>` : Write Capture Time/GPS/XMP/ICC/CICP.
- `plan_filename(settings: JsValue) -> Result<JsValue, JsValue>` : Rename plan when `filenameStrategy` is `timestamped`.

Each return value is structured via Serde, and types are defined in `wasmBridge.ts` and passed through to the UI/Queue layers.
