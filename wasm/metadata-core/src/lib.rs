use js_sys::{Date, Uint8Array};
use serde::{Deserialize, Serialize};
use serde_wasm_bindgen::{from_value, to_value};
use wasm_bindgen::prelude::*;

use crc32fast::Hasher;
use exif::{Error as ExifError, Exif, Reader, Tag, Value};
use std::io::Cursor;
use time::{macros::format_description, PrimitiveDateTime, UtcOffset};

const METADATA_SPEC_VERSION: &str = "1.0";
const EXIF_DATETIME_FORMAT: &[time::format_description::FormatItem<'static>] =
    format_description!("[year]:[month]:[day] [hour]:[minute]:[second]");
const PNG_SIGNATURE: [u8; 8] = [137, 80, 78, 71, 13, 10, 26, 10];
const EXIF_HEADER: [u8; 6] = *b"Exif\0\0";

#[cfg(feature = "console_error_panic_hook")]
#[wasm_bindgen(start)]
pub fn init_panic_hook() {
    console_error_panic_hook::set_once();
}

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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp_ms: Option<f64>,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_last_modified_ms: Option<f64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeriveMetadataContext {
    #[serde(default = "bool_true")]
    capture_time_enabled: bool,
    #[serde(default)]
    last_modified_ms: Option<f64>,
    #[serde(default)]
    timestamp_write_mode: TimestampWriteMode,
}

impl Default for DeriveMetadataContext {
    fn default() -> Self {
        Self {
            capture_time_enabled: true,
            last_modified_ms: None,
            timestamp_write_mode: TimestampWriteMode::CopyExif,
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MetadataApplyContext {
    #[serde(default = "bool_true")]
    capture_time_enabled: bool,
    #[serde(default)]
    capture_time: Option<CaptureTimeInfo>,
    ordering: OrderingRequirement,
    timestamp_write_mode: TimestampWriteMode,
    rewrite_exif: bool,
    inject_from_edited_time: bool,
    output_format: OutputFormat,
    #[serde(default)]
    file_name_override: Option<String>,
    #[serde(default)]
    last_modified_override_ms: Option<f64>,
    #[serde(default)]
    gps_enabled: bool,
    #[serde(default)]
    preserve_xmp: bool,
    #[serde(default)]
    preserve_xmp_management: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OrderingRequirement {
    sorting_axis: OrderingAxis,
    #[serde(default)]
    needs_exif: Option<bool>,
    #[serde(default)]
    allow_edited_time_fallback: Option<bool>,
}

impl OrderingRequirement {
    fn requires_exif(&self) -> bool {
        self.needs_exif
            .unwrap_or(matches!(self.sorting_axis, OrderingAxis::Exif))
    }
}

#[derive(Deserialize, Clone, Copy)]
#[serde(rename_all = "kebab-case")]
enum TimestampWriteMode {
    #[serde(rename = "off")]
    Off,
    #[serde(rename = "copy-exif")]
    CopyExif,
    #[serde(rename = "from-file-modified")]
    FromFileModified,
}

impl Default for TimestampWriteMode {
    fn default() -> Self {
        TimestampWriteMode::CopyExif
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
enum OutputFormat {
    Jpeg,
    Png,
    Webp,
    Gif,
}

impl OutputFormat {
    fn as_str(&self) -> &'static str {
        match self {
            OutputFormat::Jpeg => "jpeg",
            OutputFormat::Png => "png",
            OutputFormat::Webp => "webp",
            OutputFormat::Gif => "gif",
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
enum OrderingAxis {
    Exif,
    Filename,
}

#[wasm_bindgen]
pub fn derive_metadata(input_bytes: Uint8Array, context: JsValue) -> Result<JsValue, JsValue> {
    let buffer = input_bytes.to_vec();
    let ctx: DeriveMetadataContext = if context.is_undefined() || context.is_null() {
        DeriveMetadataContext::default()
    } else {
        from_value(context).map_err(|err| JsValue::from_str(&err.to_string()))?
    };

    let mut warnings = Vec::new();
    let capture_time = if ctx.capture_time_enabled {
        match ctx.timestamp_write_mode {
            TimestampWriteMode::FromFileModified => {
                derive_capture_time_from_mtime(ctx.last_modified_ms, &mut warnings)
            }
            _ => derive_capture_time_from_exif(&buffer, &mut warnings),
        }
    } else {
        None
    };

    let response = DerivedMetadataResponse {
        metadata_spec_version: METADATA_SPEC_VERSION.to_string(),
        capture_time,
        warnings,
    };
    to_value(&response).map_err(|err| err.into())
}

#[wasm_bindgen]
pub fn apply_metadata(encoded_bytes: Uint8Array, settings: JsValue) -> Result<JsValue, JsValue> {
    let buffer = encoded_bytes.to_vec();
    let context: MetadataApplyContext =
        from_value(settings).map_err(|err| JsValue::from_str(&err.to_string()))?;

    let mut warnings = Vec::new();
    let mut applied_flags = AppliedFlags::default();
    let mut output = buffer;
    let capture = context.capture_time.clone();

    if !context.capture_time_enabled
        || matches!(context.timestamp_write_mode, TimestampWriteMode::Off)
    {
        let response = ApplyMetadataResponse {
            metadata_spec_version: METADATA_SPEC_VERSION.to_string(),
            output,
            applied_flags,
            capture_time_badge: Some("not-applied".to_string()),
            warnings,
            next_last_modified_ms: context.last_modified_override_ms,
        };
        return to_value(&response).map_err(|err| err.into());
    }

    let capture_info = match capture {
        Some(info) if info.value.is_some() => info,
        _ => {
            match context.timestamp_write_mode {
                TimestampWriteMode::FromFileModified => {
                    warnings.push(warning_mtime_unavailable());
                }
                _ => {
                    warnings.push(warning_missing_capture_time());
                }
            }
            if context.ordering.requires_exif() {
                warnings.push(warning_ordering_not_met(
                    "capture time is required for this scenario",
                ));
            }
            let response = ApplyMetadataResponse {
                metadata_spec_version: METADATA_SPEC_VERSION.to_string(),
                output,
                applied_flags,
                capture_time_badge: Some("not-applied".to_string()),
                warnings,
                next_last_modified_ms: context.last_modified_override_ms,
            };
            return to_value(&response).map_err(|err| err.into());
        }
    };

    if matches!(
        context.timestamp_write_mode,
        TimestampWriteMode::FromFileModified
    ) && capture_info.source != "file"
    {
        warnings.push(warning_mtime_unavailable());
    }

    if context.rewrite_exif {
        match &context.output_format {
            OutputFormat::Jpeg => match rewrite_jpeg_capture_time(&output, &capture_info) {
                Ok(next_bytes) => {
                    output = next_bytes;
                    applied_flags.capture_time = true;
                }
                Err(err) => {
                    warnings.push(err.into_warning());
                }
            },
            OutputFormat::Png => match rewrite_png_capture_time(&output, &capture_info) {
                Ok(next_bytes) => {
                    output = next_bytes;
                    applied_flags.capture_time = true;
                }
                Err(err) => {
                    warnings.push(err.into_warning());
                }
            },
            other => warnings.push(warning_unsupported_format(other.as_str())),
        }
    }

    if !applied_flags.capture_time && context.ordering.requires_exif() {
        warnings.push(warning_ordering_not_met(
            "capture time could not be written to the output image",
        ));
    }

    let capture_time_badge = if applied_flags.capture_time {
        if capture_info.source == "file" {
            Some("from-mtime".to_string())
        } else {
            Some("original".to_string())
        }
    } else {
        Some("not-applied".to_string())
    };

    let next_last_modified_ms = context
        .last_modified_override_ms
        .or_else(|| capture_info.timestamp_ms);

    let response = ApplyMetadataResponse {
        metadata_spec_version: METADATA_SPEC_VERSION.to_string(),
        output,
        applied_flags,
        capture_time_badge,
        warnings,
        next_last_modified_ms,
    };
    to_value(&response).map_err(|err| err.into())
}

#[wasm_bindgen]
pub fn plan_filename(context: JsValue) -> Result<JsValue, JsValue> {
    let _ = context;
    let response = FilenamePlanResponse {
        metadata_spec_version: METADATA_SPEC_VERSION.to_string(),
        applied: false,
        target_name: None,
        fallback_strategy: Some("keep-original".to_string()),
        warnings: vec![placeholder_warning("plan_filename")],
    };
    to_value(&response).map_err(|err| err.into())
}

fn derive_capture_time_from_exif(
    buffer: &[u8],
    warnings: &mut Vec<MetadataWarning>,
) -> Option<CaptureTimeInfo> {
    match parse_exif_capture_time(buffer) {
        Ok(Some(info)) => Some(info),
        Ok(None) => {
            warnings.push(warning_missing_capture_time());
            None
        }
        Err(warning) => {
            warnings.push(warning);
            None
        }
    }
}

fn derive_capture_time_from_mtime(
    last_modified_ms: Option<f64>,
    warnings: &mut Vec<MetadataWarning>,
) -> Option<CaptureTimeInfo> {
    match last_modified_ms.and_then(capture_time_from_last_modified) {
        Some(info) => Some(info),
        None => {
            warnings.push(warning_mtime_unavailable());
            None
        }
    }
}

fn parse_exif_capture_time(bytes: &[u8]) -> Result<Option<CaptureTimeInfo>, MetadataWarning> {
    let is_png = is_png_image(bytes);
    match parse_capture_time_with_reader(bytes) {
        Ok(Some(info)) => return Ok(Some(info)),
        Ok(None) => {}
        Err(err) => {
            if is_png {
                if let Some(info) = parse_png_capture_time(bytes)? {
                    return Ok(Some(info));
                }
            }
            return Err(err);
        }
    }

    if is_png {
        return parse_png_capture_time(bytes);
    }
    Ok(None)
}

fn parse_capture_time_with_reader(
    bytes: &[u8],
) -> Result<Option<CaptureTimeInfo>, MetadataWarning> {
    let mut cursor = Cursor::new(bytes);
    let exif_data = match Reader::new().read_from_container(&mut cursor) {
        Ok(data) => data,
        Err(ExifError::NotFound(_)) | Err(ExifError::BlankValue(_)) => return Ok(None),
        Err(err) => {
            return Err(warning_extract_failed(format!(
                "failed to parse Exif metadata: {err}"
            )))
        }
    };
    Ok(capture_time_from_exif(&exif_data))
}

fn parse_png_capture_time(bytes: &[u8]) -> Result<Option<CaptureTimeInfo>, MetadataWarning> {
    let mut payload = match extract_png_exif_chunk(bytes)? {
        Some(data) => data,
        None => return Ok(None),
    };
    // NOTE: PNG eXIf chunks prepend an \"Exif\\0\\0\" signature, so strip it off before calling Reader::read_raw to avoid parse failures.
    let exif_bytes = if payload.starts_with(&EXIF_HEADER) {
        if payload.len() <= EXIF_HEADER.len() {
            return Err(warning_extract_failed(
                "PNG Exif chunk is missing TIFF payload".to_string(),
            ));
        }
        payload.split_off(EXIF_HEADER.len())
    } else {
        payload
    };
    let exif_data = Reader::new()
        .read_raw(exif_bytes)
        .map_err(|err| {
            warning_extract_failed(format!(
                "failed to parse Exif metadata from PNG chunk: {err}"
            ))
        })?;
    Ok(capture_time_from_exif(&exif_data))
}

fn extract_png_exif_chunk(bytes: &[u8]) -> Result<Option<Vec<u8>>, MetadataWarning> {
    if !is_png_image(bytes) {
        return Ok(None);
    }
    let mut cursor = PNG_SIGNATURE.len();
    while cursor + 8 <= bytes.len() {
        let length = u32::from_be_bytes([
            bytes[cursor],
            bytes[cursor + 1],
            bytes[cursor + 2],
            bytes[cursor + 3],
        ]) as usize;
        let chunk_type_start = cursor + 4;
        let chunk_type_end = chunk_type_start + 4;
        if chunk_type_end > bytes.len() {
            return Err(warning_extract_failed(
                "PNG chunk header exceeds buffer length".to_string(),
            ));
        }
        let data_start = chunk_type_end;
        let data_end = data_start + length;
        let chunk_end = data_end + 4;
        if chunk_end > bytes.len() {
            return Err(warning_extract_failed(
                "PNG chunk exceeds buffer length".to_string(),
            ));
        }
        let chunk_type = &bytes[chunk_type_start..chunk_type_end];
        if chunk_type == b"eXIf" {
            return Ok(Some(bytes[data_start..data_end].to_vec()));
        }
        cursor = chunk_end;
        if chunk_type == b"IEND" {
            break;
        }
    }
    Ok(None)
}

fn capture_time_from_exif(exif_data: &Exif) -> Option<CaptureTimeInfo> {
    let capture_value = [Tag::DateTimeOriginal, Tag::DateTimeDigitized, Tag::DateTime]
        .into_iter()
        .find_map(|tag| read_ascii_field(exif_data, tag));

    let value = capture_value?;

    let offset_string = [
        Tag::OffsetTimeOriginal,
        Tag::OffsetTimeDigitized,
        Tag::OffsetTime,
    ]
    .into_iter()
    .find_map(|tag| read_ascii_field(exif_data, tag));

    let offset_minutes = offset_string.as_deref().and_then(parse_offset_minutes);

    let mut info = CaptureTimeInfo {
        value: Some(value),
        offset_minutes,
        timestamp_ms: None,
        source: "exif".to_string(),
    };
    info.timestamp_ms = capture_time_epoch_ms(&info);
    Some(info)
}

fn is_png_image(bytes: &[u8]) -> bool {
    bytes.len() >= PNG_SIGNATURE.len() && bytes[..PNG_SIGNATURE.len()] == PNG_SIGNATURE
}

fn read_ascii_field(exif_data: &Exif, tag: Tag) -> Option<String> {
    exif_data
        .fields()
        .find(|field| field.tag == tag)
        .and_then(|field| match &field.value {
            Value::Ascii(data) => data.first().and_then(|raw: &Vec<u8>| {
                let bytes: Vec<u8> = raw.iter().copied().take_while(|byte| *byte != 0).collect();
                String::from_utf8(bytes).ok()
            }),
            _ => None,
        })
        .map(|s: String| s.trim().to_string())
        .filter(|s: &String| !s.is_empty())
}

fn capture_time_from_last_modified(ms: f64) -> Option<CaptureTimeInfo> {
    if !ms.is_finite() || ms <= 0.0 {
        return None;
    }
    let floored = (ms / 1000.0).floor() * 1000.0;
    if !floored.is_finite() || floored <= 0.0 {
        return None;
    }
    let date = Date::new(&JsValue::from_f64(floored));
    let offset_minutes = -(date.get_timezone_offset() as i16);
    let value = format!(
        "{:04}:{:02}:{:02} {:02}:{:02}:{:02}",
        date.get_full_year() as i32,
        (date.get_month() as u32) + 1,
        date.get_date() as u32,
        date.get_hours() as u32,
        date.get_minutes() as u32,
        date.get_seconds() as u32,
    );
    Some(CaptureTimeInfo {
        value: Some(value),
        offset_minutes: Some(offset_minutes),
        timestamp_ms: Some(floored),
        source: "file".to_string(),
    })
}

fn capture_time_epoch_ms(info: &CaptureTimeInfo) -> Option<f64> {
    let value = info.value.as_ref()?;
    let parsed = PrimitiveDateTime::parse(value, EXIF_DATETIME_FORMAT).ok()?;
    let offset = info
        .offset_minutes
        .and_then(|minutes| UtcOffset::from_whole_seconds((minutes as i32) * 60).ok())
        .unwrap_or(UtcOffset::UTC);
    let timestamp = parsed.assume_offset(offset).unix_timestamp_nanos();
    Some(timestamp as f64 / 1_000_000.0)
}

fn parse_offset_minutes(raw: &str) -> Option<i16> {
    let trimmed = raw.trim();
    if trimmed.len() < 5 {
        return None;
    }
    let sign = match trimmed.chars().next()? {
        '+' => 1,
        '-' => -1,
        _ => return None,
    };
    let digits: String = trimmed
        .chars()
        .skip(1)
        .filter(|c| c.is_ascii_digit())
        .collect();
    if digits.len() < 4 {
        return None;
    }
    let hours: i16 = digits[0..2].parse().ok()?;
    let minutes: i16 = digits[2..4].parse().ok()?;
    Some(sign * (hours * 60 + minutes))
}

fn rewrite_jpeg_capture_time(
    input: &[u8],
    capture: &CaptureTimeInfo,
) -> Result<Vec<u8>, ApplyFailure> {
    if input.len() < 2 || input[0] != 0xFF || input[1] != 0xD8 {
        return Err(ApplyFailure::Unsupported(
            "output bytes are not a JPEG image".to_string(),
        ));
    }

    let payload = build_exif_payload(capture)?;
    let app1_segment = build_app1_segment(&payload)?;

    let mut output = Vec::with_capacity(input.len() + app1_segment.len());
    output.extend_from_slice(&input[..2]);

    let mut cursor = 2;
    let mut inserted = false;
    while cursor < input.len() {
        if cursor + 1 >= input.len() || input[cursor] != 0xFF {
            return Err(ApplyFailure::Apply(
                "malformed JPEG marker sequence".to_string(),
            ));
        }
        let marker = input[cursor + 1];
        if marker == 0xDA {
            if !inserted {
                output.extend_from_slice(&app1_segment);
            }
            output.extend_from_slice(&input[cursor..]);
            return Ok(output);
        }
        if marker == 0xD9 {
            if !inserted {
                output.extend_from_slice(&app1_segment);
            }
            output.extend_from_slice(&input[cursor..]);
            return Ok(output);
        }

        if is_standalone_marker(marker) {
            output.extend_from_slice(&input[cursor..cursor + 2]);
            cursor += 2;
            continue;
        }

        if cursor + 4 > input.len() {
            return Err(ApplyFailure::Apply(
                "truncated JPEG segment header".to_string(),
            ));
        }
        let length = u16::from_be_bytes([input[cursor + 2], input[cursor + 3]]) as usize;
        if length < 2 || cursor + 2 + length > input.len() {
            return Err(ApplyFailure::Apply(
                "invalid JPEG segment length".to_string(),
            ));
        }
        let segment_end = cursor + 2 + length;

        if !inserted && !is_app_marker(marker) {
            output.extend_from_slice(&app1_segment);
            inserted = true;
        }

        let data_start = cursor + 4;
        let is_existing_exif = marker == 0xE1
            && segment_end - data_start >= 6
            && &input[data_start..data_start + 6] == b"Exif\0\0";
        if !is_existing_exif {
            output.extend_from_slice(&input[cursor..segment_end]);
        }
        cursor = segment_end;
    }

    if !inserted {
        output.extend_from_slice(&app1_segment);
    }
    Ok(output)
}

fn rewrite_png_capture_time(
    input: &[u8],
    capture: &CaptureTimeInfo,
) -> Result<Vec<u8>, ApplyFailure> {
    if input.len() < PNG_SIGNATURE.len() || input[..8] != PNG_SIGNATURE {
        return Err(ApplyFailure::Unsupported(
            "output bytes are not a PNG image".to_string(),
        ));
    }
    let payload = build_exif_payload(capture)?;
    let exif_chunk = build_png_exif_chunk(&payload);

    let mut cursor = PNG_SIGNATURE.len();
    let mut chunks: Vec<Vec<u8>> = Vec::new();
    let mut inserted = false;
    let mut saw_ihdr = false;

    while cursor + 8 <= input.len() {
        let length =
            u32::from_be_bytes([input[cursor], input[cursor + 1], input[cursor + 2], input[cursor + 3]])
                as usize;
        let mut chunk_type = [0u8; 4];
        chunk_type.copy_from_slice(&input[cursor + 4..cursor + 8]);
        let data_start = cursor + 8;
        let data_end = data_start + length;
        let chunk_end = data_end + 4;
        if chunk_end > input.len() {
            return Err(ApplyFailure::Apply(
                "PNG chunk exceeds buffer length".to_string(),
            ));
        }

        if &chunk_type == b"eXIf" {
            cursor = chunk_end;
            continue;
        }

        let chunk_bytes = input[cursor..chunk_end].to_vec();
        chunks.push(chunk_bytes);
        if &chunk_type == b"IHDR" {
            saw_ihdr = true;
            chunks.push(exif_chunk.clone());
            inserted = true;
        }

        cursor = chunk_end;
        if &chunk_type == b"IEND" {
            break;
        }
    }

    if !saw_ihdr {
        return Err(ApplyFailure::Apply(
            "PNG image is missing an IHDR chunk".to_string(),
        ));
    }
    if !inserted {
        let position = chunks
            .iter()
            .position(|chunk| chunk.len() >= 12 && &chunk[4..8] == b"IEND")
            .ok_or_else(|| {
                ApplyFailure::Apply("PNG image is missing an IEND chunk".to_string())
            })?;
        chunks.insert(position, exif_chunk);
    }

    let total_len: usize =
        PNG_SIGNATURE.len() + chunks.iter().map(|chunk| chunk.len()).sum::<usize>();
    let mut output = Vec::with_capacity(total_len);
    output.extend_from_slice(&PNG_SIGNATURE);
    for chunk in chunks {
        output.extend_from_slice(&chunk);
    }
    Ok(output)
}

fn build_png_exif_chunk(payload: &[u8]) -> Vec<u8> {
    let length = payload.len() as u32;
    let mut chunk = Vec::with_capacity(payload.len() + 12);
    chunk.extend_from_slice(&length.to_be_bytes());
    chunk.extend_from_slice(b"eXIf");
    chunk.extend_from_slice(payload);
    let mut hasher = Hasher::new();
    hasher.update(b"eXIf");
    hasher.update(payload);
    let crc = hasher.finalize();
    chunk.extend_from_slice(&crc.to_be_bytes());
    chunk
}

fn is_app_marker(marker: u8) -> bool {
    (0xE0..=0xEF).contains(&marker)
}

fn is_standalone_marker(marker: u8) -> bool {
    marker == 0x01 || (0xD0..=0xD9).contains(&marker)
}

fn build_app1_segment(payload: &[u8]) -> Result<Vec<u8>, ApplyFailure> {
    if payload.len() + 2 > u16::MAX as usize {
        return Err(ApplyFailure::Apply(
            "Exif payload too large to fit in APP1 segment".to_string(),
        ));
    }
    let mut segment = Vec::with_capacity(payload.len() + 4);
    segment.push(0xFF);
    segment.push(0xE1);
    let length = (payload.len() + 2) as u16;
    segment.extend_from_slice(&length.to_be_bytes());
    segment.extend_from_slice(payload);
    Ok(segment)
}

fn build_exif_payload(capture: &CaptureTimeInfo) -> Result<Vec<u8>, ApplyFailure> {
    let value = capture.value.as_ref().ok_or_else(|| {
        ApplyFailure::Apply("capture time value is missing for Exif injection".to_string())
    })?;
    let offset_string = capture.offset_minutes.map(format_offset_string);

    let mut ifd0_entries = Vec::new();
    ifd0_entries.push(IfdEntry::ascii(Tag::DateTime, value.clone()));
    if let Some(offset) = offset_string.as_ref() {
        ifd0_entries.push(IfdEntry::ascii(Tag::OffsetTime, offset.clone()));
    }

    let mut exif_entries = vec![
        IfdEntry::ascii(Tag::DateTimeOriginal, value.clone()),
        IfdEntry::ascii(Tag::DateTimeDigitized, value.clone()),
    ];
    if let Some(offset) = offset_string.as_ref() {
        exif_entries.push(IfdEntry::ascii(Tag::OffsetTimeOriginal, offset.clone()));
        exif_entries.push(IfdEntry::ascii(Tag::OffsetTimeDigitized, offset.clone()));
    }

    let pointer_index = ifd0_entries.len();
    ifd0_entries.push(IfdEntry::pointer(Tag::ExifIFDPointer, 0));

    let ifd0_size = ifd_size(ifd0_entries.len());
    let exif_ifd_size = ifd_size(exif_entries.len());
    let exif_offset = 8 + ifd0_size;
    if let Some(entry) = ifd0_entries.get_mut(pointer_index) {
        entry.value = IfdValue::Inline(exif_offset.to_le_bytes());
    }

    let mut body = Vec::with_capacity((ifd0_size + exif_ifd_size) as usize);
    let mut data = Vec::new();
    let mut data_offset = 8 + ifd0_size + exif_ifd_size;
    write_ifd_entries(&ifd0_entries, &mut body, &mut data, &mut data_offset);
    write_ifd_entries(&exif_entries, &mut body, &mut data, &mut data_offset);

    let mut payload = Vec::with_capacity(body.len() + data.len() + 8 + 6);
    payload.extend_from_slice(b"Exif\0\0");
    payload.extend_from_slice(b"II");
    payload.extend_from_slice(&42u16.to_le_bytes());
    payload.extend_from_slice(&8u32.to_le_bytes());
    payload.extend_from_slice(&body);
    payload.extend_from_slice(&data);
    Ok(payload)
}

fn ifd_size(entry_count: usize) -> u32 {
    2 + (entry_count as u32) * 12 + 4
}

fn write_ifd_entries(
    entries: &[IfdEntry],
    body: &mut Vec<u8>,
    data: &mut Vec<u8>,
    data_offset: &mut u32,
) {
    body.extend_from_slice(&(entries.len() as u16).to_le_bytes());
    for entry in entries {
        body.extend_from_slice(&entry.tag.to_le_bytes());
        body.extend_from_slice(&entry.field_type.to_le_bytes());
        body.extend_from_slice(&entry.count.to_le_bytes());
        match &entry.value {
            IfdValue::Inline(bytes) => body.extend_from_slice(bytes),
            IfdValue::Offset(blob) => {
                let offset = *data_offset;
                body.extend_from_slice(&offset.to_le_bytes());
                *data_offset += blob.len() as u32;
                data.extend_from_slice(blob);
            }
        }
    }
    body.extend_from_slice(&0u32.to_le_bytes());
}

struct IfdEntry {
    tag: u16,
    field_type: u16,
    count: u32,
    value: IfdValue,
}

impl IfdEntry {
    fn ascii(tag: Tag, value: String) -> Self {
        let mut bytes = value.into_bytes();
        if bytes.is_empty() || *bytes.last().unwrap() != 0 {
            bytes.push(0);
        }
        Self {
            tag: tag.number(),
            field_type: 2,
            count: bytes.len() as u32,
            value: IfdValue::Offset(bytes),
        }
    }

    fn pointer(tag: Tag, target: u32) -> Self {
        Self {
            tag: tag.number(),
            field_type: 4,
            count: 1,
            value: IfdValue::Inline(target.to_le_bytes()),
        }
    }
}

enum IfdValue {
    Inline([u8; 4]),
    Offset(Vec<u8>),
}

fn warning(code: &str, field: &str, reason: Option<String>, message: &str) -> MetadataWarning {
    MetadataWarning {
        code: code.to_string(),
        field: field.to_string(),
        reason,
        message: message.to_string(),
    }
}

fn placeholder_warning(action: &str) -> MetadataWarning {
    warning(
        "NOT_IMPLEMENTED",
        action,
        Some("Scaffolding only".to_string()),
        "This action is not implemented in the Rust core yet.",
    )
}

fn warning_missing_capture_time() -> MetadataWarning {
    warning(
        "META_MISSING_INPUT",
        "capture-time",
        Some("capture time metadata was not found in the source".to_string()),
        "Capture time metadata was not found in the source file.",
    )
}

fn warning_extract_failed(reason: String) -> MetadataWarning {
    warning(
        "META_EXTRACT_FAILED",
        "capture-time",
        Some(reason),
        "Failed to parse Exif metadata for capture time.",
    )
}

fn warning_ordering_not_met(reason: &str) -> MetadataWarning {
    warning(
        "ORDERING_REQUIREMENT_NOT_MET",
        "capture-time",
        Some(reason.to_string()),
        "Failed to satisfy the ordering requirement for the selected preset.",
    )
}

fn warning_mtime_unavailable() -> MetadataWarning {
    warning(
        "META_MTIME_UNAVAILABLE",
        "capture-time",
        Some("from-file-modified mode requires a valid file timestamp".to_string()),
        "The file modified timestamp was unavailable, so capture time could not be derived.",
    )
}

fn warning_unsupported_format(format: &str) -> MetadataWarning {
    warning(
        "META_UNSUPPORTED_OUTPUT",
        "capture-time",
        Some(format!(
            "capture time injection is not supported for {format} output"
        )),
        "Capture time injection is not supported for the selected output format.",
    )
}

#[derive(Debug)]
enum ApplyFailure {
    Unsupported(String),
    Apply(String),
}

impl ApplyFailure {
    fn into_warning(self) -> MetadataWarning {
        match self {
            ApplyFailure::Unsupported(reason) => warning(
                "META_UNSUPPORTED_OUTPUT",
                "capture-time",
                Some(reason),
                "Capture time injection is not supported for the selected output format.",
            ),
            ApplyFailure::Apply(reason) => warning(
                "META_APPLY_FAILED",
                "capture-time",
                Some(reason),
                "Failed to write capture time metadata to the output image.",
            ),
        }
    }
}

fn format_offset_string(minutes: i16) -> String {
    let sign = if minutes >= 0 { '+' } else { '-' };
    let abs = minutes.abs();
    let hours = abs / 60;
    let mins = abs % 60;
    format!("{sign}{hours:02}:{mins:02}")
}

fn bool_true() -> bool {
    true
}
