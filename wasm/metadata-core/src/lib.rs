use serde::{Deserialize, Serialize};
use serde_wasm_bindgen::to_value;
use wasm_bindgen::prelude::*;

const METADATA_SPEC_VERSION: &str = "1.0";

#[wasm_bindgen]
pub fn metadata_spec_version() -> String {
    METADATA_SPEC_VERSION.to_string()
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct MetadataWarning {
    pub code: String,
    pub field: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    pub message: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CaptureTimeInfo {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub offset_minutes: Option<i16>,
    pub source: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DerivedMetadataResponse {
    pub metadata_spec_version: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub capture_time: Option<CaptureTimeInfo>,
    #[serde(default)]
    pub warnings: Vec<MetadataWarning>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct AppliedFlags {
    pub capture_time: bool,
    pub gps: bool,
    pub xmp: bool,
    pub color_profile: bool,
    pub filename_strategy: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ApplyMetadataResponse {
    pub metadata_spec_version: String,
    pub output: Vec<u8>,
    pub applied_flags: AppliedFlags,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub capture_time_badge: Option<String>,
    #[serde(default)]
    pub warnings: Vec<MetadataWarning>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FilenamePlanResponse {
    pub metadata_spec_version: String,
    pub applied: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fallback_strategy: Option<String>,
    #[serde(default)]
    pub warnings: Vec<MetadataWarning>,
}

fn placeholder_warning(action: &str) -> MetadataWarning {
    MetadataWarning {
        code: "NOT_IMPLEMENTED".to_string(),
        field: action.to_string(),
        reason: Some("Approach3 scaffolding only".to_string()),
        message: format!(
            "{action} is not implemented in the Rust core yet. Please rely on the TS fallback."
        ),
    }
}

#[wasm_bindgen]
pub fn derive_metadata(input_bytes: js_sys::Uint8Array) -> Result<JsValue, JsValue> {
    let _ = input_bytes.to_vec();
    let response = DerivedMetadataResponse {
        metadata_spec_version: METADATA_SPEC_VERSION.to_string(),
        capture_time: None,
        warnings: vec![placeholder_warning("derive_metadata")],
    };
    to_value(&response).map_err(|err| err.into())
}

#[wasm_bindgen]
pub fn apply_metadata(
    encoded_bytes: js_sys::Uint8Array,
    _settings: JsValue,
) -> Result<JsValue, JsValue> {
    let buffer = encoded_bytes.to_vec();
    let response = ApplyMetadataResponse {
        metadata_spec_version: METADATA_SPEC_VERSION.to_string(),
        output: buffer,
        applied_flags: AppliedFlags::default(),
        capture_time_badge: None,
        warnings: vec![placeholder_warning("apply_metadata")],
    };
    to_value(&response).map_err(|err| err.into())
}

#[wasm_bindgen]
pub fn plan_filename(_context: JsValue) -> Result<JsValue, JsValue> {
    let response = FilenamePlanResponse {
        metadata_spec_version: METADATA_SPEC_VERSION.to_string(),
        applied: false,
        target_name: None,
        fallback_strategy: Some("keep-original".to_string()),
        warnings: vec![placeholder_warning("plan_filename")],
    };
    to_value(&response).map_err(|err| err.into())
}
