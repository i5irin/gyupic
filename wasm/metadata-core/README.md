# metadata-core (WASM)

> ぎゅっぴくのメタデータ保持処理を Rust/WASM へ集約するためのコアクレート。

## 目的
- metadata-spec v1.0 の `derive/apply/filename` 仕様を Rust で一元実装する。
- `wasm-bindgen` を用い、Web Worker から `Uint8Array` ベースで呼び出せる API を提供する。
- `metadataSpecVersion = "1.0"` を単一箇所で返し、TS 側とdocsの齟齬をなくす。

## ビルドフロー（暫定）
1. Rust + wasm32-unknown-unknown ターゲットをインストール。
2. `wasm-pack build wasm/metadata-core --target web --out-dir ../../src/core/metadata/wasm-pkg --out-name metadata_core` を実行。
3. 生成物（`metadata_core_bg.wasm` / `.js`）は `src/core/metadata/wasm-pkg/` 以下に配置され、`src/core/metadata/wasmBridge.ts` が動的 import する。
4. TypeScript 側で `configureMetadataCoreLoader` を呼び、Worker 初期化時にWASMをlazyロードする。

> wasm-pack 実行はまだスクリプト化していない。今後 `npm run wasm:build` を追加する予定（別タスク）。

## API スケッチ
- `metadata_spec_version() -> String`
- `derive_metadata(input: js_sys::Uint8Array) -> Result<JsValue, JsValue>` : EXIF/mtime抽出 + warning.
- `apply_metadata(blob: js_sys::Uint8Array, settings: JsValue) -> Result<ApplyResult, JsValue>` : Capture Time/GPS/XMP/ICC/CICP 書き込み。
- `plan_filename(settings: JsValue) -> Result<JsValue, JsValue>` : `filenameStrategy` ＝ timestamped の場合の Rename プラン。

各戻り値は Serde で構造化し、`wasmBridge.ts` で型を定義してUI/Queue層へ流す。
