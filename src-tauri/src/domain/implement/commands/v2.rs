use crate::domain::implement::modules::v2::pipeline::eventbus::StorageCommand;
use crate::domain::implement::modules::v2::storage::connection::PmpDatabase;
use crate::domain::implement::state::hydrator::{self, AppState, StoredRecentProject};
use base64::{engine::general_purpose, Engine as _};
use calamine::{open_workbook_auto, Reader};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashMap};
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::{AppHandle, Manager, State};
use tokio::sync::{mpsc, oneshot};
use uuid::Uuid;

#[derive(Clone)]
pub struct ActorState {
    pub gateway_tx: mpsc::Sender<StorageCommand>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DashboardProjectStats {
    pub total_files: i64,
    pub total_size: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DashboardExtensionStat {
    pub extension: String,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DashboardFileStat {
    pub name: String,
    pub size: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ImportMappingPayload {
    pub name_column: String,
    pub lat_column: String,
    pub lng_column: String,
    pub description_column: Option<String>,
    pub order_column: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ImportFieldMeta {
    pub name: String,
    pub field_type: String,
    pub display_name: String,
    pub required: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DatasetMetaResponse {
    pub dataset_id: String,
    pub fields: Vec<ImportFieldMeta>,
    pub sample_data: Option<Vec<BTreeMap<String, String>>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportMediaAssetPayload {
    pub project_id: String,
    pub feature_id: String,
    pub data_url: Option<String>,
    pub file_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ImportFeatureRecord {
    pub id: String,
    pub geom_type: String,
    pub geometry: [f64; 2],
    pub center_lat: f64,
    pub center_lon: f64,
    pub tile_id: String,
    pub properties: BTreeMap<String, String>,
}

fn ensure_absolute_path(path: &Path) -> Result<(), String> {
    if path.is_absolute() {
        return Ok(());
    }
    Err("Import file path must be an absolute path".to_string())
}

fn ensure_excel_extension(path: &Path) -> Result<(), String> {
    let Some(ext) = path.extension().and_then(|value| value.to_str()) else {
        return Err("Unsupported import file type".to_string());
    };
    if ["xlsx", "xls", "xlsm", "xlsb"]
        .iter()
        .any(|allowed| ext.eq_ignore_ascii_case(allowed))
    {
        return Ok(());
    }
    Err(
        "Only Excel files (.xlsx, .xls, .xlsm, .xlsb) are supported in this import flow"
            .to_string(),
    )
}

#[tauri::command]
pub async fn save_binary_file(path: String, data: Vec<u8>) -> Result<(), String> {
    let path = PathBuf::from(path);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create parent directory: {error}"))?;
    }
    std::fs::write(&path, data).map_err(|error| format!("Failed to save file: {error}"))
}

#[tauri::command]
pub async fn read_binary_file(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(PathBuf::from(path)).map_err(|error| format!("Failed to read file: {error}"))
}

#[tauri::command]
pub fn copy_text_to_system_clipboard(text: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::Foundation::GlobalFree;
        use windows_sys::Win32::System::DataExchange::{
            CloseClipboard, EmptyClipboard, OpenClipboard, SetClipboardData,
        };
        use windows_sys::Win32::System::Memory::{
            GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE, GMEM_ZEROINIT,
        };
        use windows_sys::Win32::System::Ole::CF_UNICODETEXT;

        log::info!(
            "[Clipboard] copy_text_to_system_clipboard requested on Windows, len={}",
            text.len()
        );
        let utf16: Vec<u16> = text.encode_utf16().chain(std::iter::once(0)).collect();
        let bytes = utf16.len() * std::mem::size_of::<u16>();

        for attempt in 0..30 {
            log::info!("[Clipboard] Windows clipboard attempt {}", attempt + 1);
            let opened = unsafe { OpenClipboard(std::ptr::null_mut()) };
            if opened == 0 {
                log::warn!(
                    "[Clipboard] Windows OpenClipboard failed on attempt {}; retrying",
                    attempt + 1
                );
                std::thread::sleep(Duration::from_millis(80 + (attempt as u64 * 20).min(220)));
                continue;
            }

            let clipboard_opened = true;
            let result = (|| {
                let cleared = unsafe { EmptyClipboard() };
                if cleared == 0 {
                    return Err("EmptyClipboard failed".to_string());
                }

                let handle = unsafe { GlobalAlloc(GMEM_MOVEABLE | GMEM_ZEROINIT, bytes) };
                if handle.is_null() {
                    return Err("GlobalAlloc failed".to_string());
                }

                let lock = unsafe { GlobalLock(handle) as *mut u16 };
                if lock.is_null() {
                    unsafe {
                        let _ = GlobalFree(handle);
                    }
                    return Err("GlobalLock failed".to_string());
                }

                unsafe {
                    std::ptr::copy_nonoverlapping(utf16.as_ptr(), lock, utf16.len());
                    let _ = GlobalUnlock(handle);
                }

                let set_result = unsafe { SetClipboardData(CF_UNICODETEXT as u32, handle) };
                if set_result.is_null() {
                    unsafe {
                        let _ = GlobalFree(handle);
                    }
                    return Err("SetClipboardData failed".to_string());
                }

                Ok(())
            })();

            unsafe {
                if clipboard_opened {
                    let _ = CloseClipboard();
                }
            }

            match result {
                Ok(_) => {
                    log::info!("[Clipboard] Windows clipboard write succeeded on attempt {}", attempt + 1);
                    return Ok(());
                }
                Err(error) if attempt < 29 => {
                    log::warn!(
                        "[Clipboard] Windows clipboard attempt {} failed: {}; retrying",
                        attempt + 1,
                        error
                    );
                    std::thread::sleep(Duration::from_millis(120 + (attempt as u64 * 30).min(300)));
                }
                Err(error) => {
                    log::error!(
                        "[Clipboard] Windows clipboard write failed after {} attempts: {}",
                        attempt + 1,
                        error
                    );
                    return Err(format!("Failed to write to Windows clipboard: {error}"));
                }
            }
        }

        log::error!("[Clipboard] Windows clipboard write failed after exhausting retries");
        return Err("Failed to write to Windows clipboard".to_string());
    }

    #[cfg(not(target_os = "windows"))]
    {
        log::info!(
            "[Clipboard] copy_text_to_system_clipboard requested on non-Windows, len={}",
            text.len()
        );
        for attempt in 0..8 {
            log::info!("[Clipboard] Browser clipboard attempt {}", attempt + 1);
            let mut clipboard = match arboard::Clipboard::new() {
                Ok(clipboard) => clipboard,
                Err(error) if attempt < 7 => {
                    log::warn!(
                        "[Clipboard] Browser clipboard init failed on attempt {}: {}; retrying",
                        attempt + 1,
                        error
                    );
                    std::thread::sleep(Duration::from_millis(150));
                    let _ = error;
                    continue;
                }
                Err(error) => {
                    log::error!(
                        "[Clipboard] Browser clipboard init failed after {} attempts: {}",
                        attempt + 1,
                        error
                    );
                    return Err(format!("Failed to access clipboard: {error}"));
                }
            };

            let _ = clipboard.clear();

            match clipboard.set_text(text.clone()) {
                Ok(_) => {
                    log::info!(
                        "[Clipboard] Browser clipboard write succeeded on attempt {}",
                        attempt + 1
                    );
                    return Ok(());
                }
                Err(_error) if attempt < 7 => {
                    log::warn!(
                        "[Clipboard] Browser clipboard write failed on attempt {}; retrying",
                        attempt + 1
                    );
                    std::thread::sleep(Duration::from_millis(150));
                }
                Err(error) => {
                    log::error!(
                        "[Clipboard] Browser clipboard write failed after {} attempts: {}",
                        attempt + 1,
                        error
                    );
                    return Err(format!("Failed to write to clipboard: {error}"));
                }
            }
        }

        log::error!("[Clipboard] Browser clipboard write failed after exhausting retries");
        Err("Failed to write to clipboard".to_string())
    }
}

#[tauri::command]
pub async fn fetch_url_as_data_url(url: String) -> Result<String, String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("Only http/https URLs are supported".to_string());
    }

    tokio::task::spawn_blocking(move || {
        let client = reqwest::blocking::Client::builder()
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
            .timeout(std::time::Duration::from_secs(12))
            .build()
            .map_err(|error| format!("Failed to create HTTP client: {error}"))?;

        let response = client
            .get(&url)
            .send()
            .map_err(|error| format!("Failed to fetch URL: {error}"))?
            .error_for_status()
            .map_err(|error| format!("HTTP error while fetching URL: {error}"))?;

        let content_type = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or("image/png")
            .split(';')
            .next()
            .unwrap_or("image/png")
            .to_string();

        let bytes = response
            .bytes()
            .map_err(|error| format!("Failed to read response bytes: {error}"))?;
        Ok(format!(
            "data:{};base64,{}",
            content_type,
            general_purpose::STANDARD.encode(bytes)
        ))
    })
    .await
    .map_err(|error| format!("Failed to join fetch task: {error}"))?
}

fn normalize_column_key(value: &str) -> String {
    value.trim().to_lowercase()
}

fn cell_to_string<T: ToString>(value: &T) -> String {
    value.to_string().trim().to_string()
}

fn read_excel_table(path: &Path) -> Result<(String, Vec<String>, Vec<Vec<String>>), String> {
    ensure_absolute_path(path)?;
    ensure_excel_extension(path)?;
    if !path.exists() {
        return Err(format!("Import file does not exist: {}", path.display()));
    }

    let mut workbook =
        open_workbook_auto(path).map_err(|e| format!("Failed to open workbook: {}", e))?;
    let sheet_names = workbook.sheet_names().to_vec();
    let Some(sheet_name) = sheet_names.first().cloned() else {
        return Err("Workbook does not contain any sheets".to_string());
    };

    let range = workbook
        .worksheet_range(&sheet_name)
        .map_err(|e| format!("Failed to read worksheet '{}': {}", sheet_name, e))?;
    let mut rows = range.rows();
    let Some(header_row) = rows.next() else {
        return Err("Worksheet is empty and does not contain a header row".to_string());
    };

    let headers = header_row
        .iter()
        .enumerate()
        .map(|(idx, cell)| {
            let raw = cell_to_string(cell);
            if raw.is_empty() {
                format!("column_{}", idx + 1)
            } else {
                raw
            }
        })
        .collect::<Vec<_>>();

    if headers.is_empty() {
        return Err("Worksheet header row is missing".to_string());
    }

    let data_rows = rows
        .map(|row| row.iter().map(cell_to_string).collect::<Vec<_>>())
        .filter(|row| row.iter().any(|value| !value.trim().is_empty()))
        .collect::<Vec<_>>();

    Ok((sheet_name, headers, data_rows))
}

fn infer_field_type(rows: &[Vec<String>], column_index: usize) -> String {
    let samples = rows
        .iter()
        .filter_map(|row| row.get(column_index))
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .take(5)
        .collect::<Vec<_>>();
    if !samples.is_empty() && samples.iter().all(|value| value.parse::<f64>().is_ok()) {
        return "number".to_string();
    }
    "string".to_string()
}

fn build_dataset_meta(
    path: &Path,
    headers: &[String],
    rows: &[Vec<String>],
) -> DatasetMetaResponse {
    let fields = headers
        .iter()
        .enumerate()
        .map(|(index, header)| ImportFieldMeta {
            name: header.clone(),
            field_type: infer_field_type(rows, index),
            display_name: header.clone(),
            required: false,
        })
        .collect::<Vec<_>>();

    let sample_data = rows
        .iter()
        .take(5)
        .map(|row| {
            headers
                .iter()
                .enumerate()
                .map(|(index, header)| {
                    (header.clone(), row.get(index).cloned().unwrap_or_default())
                })
                .collect::<BTreeMap<_, _>>()
        })
        .collect::<Vec<_>>();

    DatasetMetaResponse {
        dataset_id: Uuid::new_v5(&Uuid::NAMESPACE_URL, path.to_string_lossy().as_bytes())
            .to_string(),
        fields,
        sample_data: Some(sample_data),
    }
}

fn get_required_column_index(
    headers: &[String],
    column_name: &str,
    label: &str,
) -> Result<usize, String> {
    let lookup = headers
        .iter()
        .enumerate()
        .map(|(index, header)| (normalize_column_key(header), index))
        .collect::<HashMap<_, _>>();
    lookup
        .get(&normalize_column_key(column_name))
        .copied()
        .ok_or_else(|| {
            format!(
                "Required mapping column '{}' ({}) was not found in the worksheet",
                column_name, label
            )
        })
}

fn get_optional_column_index(headers: &[String], column_name: &Option<String>) -> Option<usize> {
    let lookup = headers
        .iter()
        .enumerate()
        .map(|(index, header)| (normalize_column_key(header), index))
        .collect::<HashMap<_, _>>();
    column_name
        .as_ref()
        .and_then(|value| lookup.get(&normalize_column_key(value)).copied())
}

fn parse_coordinate(value: &str, label: &str, row_number: usize) -> Result<f64, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(format!("Row {} is missing {}", row_number, label));
    }
    trimmed.replace(',', ".").parse::<f64>().map_err(|_| {
        format!(
            "Row {} has an invalid {} value: {}",
            row_number, label, value
        )
    })
}

fn parse_feature_records(
    headers: &[String],
    rows: &[Vec<String>],
    mapping: &ImportMappingPayload,
) -> Result<Vec<ImportFeatureRecord>, String> {
    let name_index = get_required_column_index(headers, &mapping.name_column, "name_column")?;
    let lat_index = get_required_column_index(headers, &mapping.lat_column, "lat_column")?;
    let lng_index = get_required_column_index(headers, &mapping.lng_column, "lng_column")?;
    let description_index = get_optional_column_index(headers, &mapping.description_column);
    let order_index = get_optional_column_index(headers, &mapping.order_column);

    let mut records = Vec::new();
    let mut skipped_errors = Vec::new();

    for (row_index, row) in rows.iter().enumerate() {
        let excel_row_number = row_index + 2;
        let lat = match parse_coordinate(
            row.get(lat_index).map(String::as_str).unwrap_or_default(),
            "latitude",
            excel_row_number,
        ) {
            Ok(value) => value,
            Err(error) => {
                skipped_errors.push(error);
                continue;
            }
        };
        let lng = match parse_coordinate(
            row.get(lng_index).map(String::as_str).unwrap_or_default(),
            "longitude",
            excel_row_number,
        ) {
            Ok(value) => value,
            Err(error) => {
                skipped_errors.push(error);
                continue;
            }
        };

        let name_from_row = row
            .get(name_index)
            .map(|value| value.trim())
            .unwrap_or_default();
        let order_value = order_index
            .and_then(|index| row.get(index))
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        let feature_name = if !name_from_row.is_empty() {
            name_from_row.to_string()
        } else if let Some(order) = order_value.clone() {
            order
        } else {
            format!("Point {}", records.len() + 1)
        };

        let mut properties = headers
            .iter()
            .enumerate()
            .filter_map(|(index, header)| {
                let value = row.get(index).cloned().unwrap_or_default();
                if value.trim().is_empty() {
                    None
                } else {
                    Some((header.clone(), value))
                }
            })
            .collect::<BTreeMap<_, _>>();

        properties.insert("name".to_string(), feature_name.clone());

        if let Some(index) = description_index {
            let description = row.get(index).cloned().unwrap_or_default();
            if !description.trim().is_empty() {
                properties.insert("description".to_string(), description);
            }
        }

        if let Some(order) = order_value {
            properties.insert("display_order".to_string(), order);
        }

        let record_id = Uuid::new_v4().to_string();
        records.push(ImportFeatureRecord {
            id: record_id.clone(),
            geom_type: "Point".to_string(),
            geometry: [lng, lat],
            center_lat: lat,
            center_lon: lng,
            tile_id: format!("excel-row-{}", excel_row_number),
            properties,
        });
    }

    if records.is_empty() {
        if skipped_errors.is_empty() {
            return Err("No valid data rows were found in the worksheet".to_string());
        }
        return Err(format!(
            "No valid rows could be imported. {}",
            skipped_errors.join(" | ")
        ));
    }

    if !skipped_errors.is_empty() {
        log::warn!(
            "[Import] Skipped {} invalid Excel rows: {}",
            skipped_errors.len(),
            skipped_errors.join(" | ")
        );
    }

    Ok(records)
}

async fn exec_query(state: &ActorState, sql: &str, params: Vec<String>) -> Result<Value, String> {
    let (tx, rx) = oneshot::channel();
    state
        .gateway_tx
        .send(StorageCommand::Query {
            sql: sql.to_string(),
            params,
            reply: tx,
        })
        .await
        .map_err(|e| e.to_string())?;
    rx.await.map_err(|e| e.to_string())?
}

async fn switch_database(state: &ActorState, path: PathBuf) -> Result<(), String> {
    let (tx, rx) = oneshot::channel();
    state
        .gateway_tx
        .send(StorageCommand::OpenDatabase { path, reply: tx })
        .await
        .map_err(|e| format!("IPC Queue error: {}", e))?;
    rx.await.map_err(|e| e.to_string())?
}

fn trim_to_option(input: Option<String>) -> Option<String> {
    input
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn ensure_pmp_extension(path: &Path) -> Result<(), String> {
    if path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("pmp"))
        == Some(true)
    {
        return Ok(());
    }
    Err("Project file path must end with .pmp".to_string())
}

fn parse_uuid_value(value: Option<&Value>, field: &str) -> Result<Uuid, String> {
    let raw = value
        .and_then(Value::as_str)
        .ok_or_else(|| format!("Missing required UUID field: {}", field))?;
    Uuid::parse_str(raw).map_err(|_| format!("Invalid UUID for field: {}", field))
}

fn parse_optional_uuid_value(value: Option<&Value>) -> Result<Option<Uuid>, String> {
    match value {
        Some(Value::String(raw)) if raw.trim().is_empty() => Ok(None),
        Some(Value::String(raw)) => Uuid::parse_str(raw)
            .map(Some)
            .map_err(|_| format!("Invalid UUID value: {}", raw)),
        Some(Value::Null) | None => Ok(None),
        Some(other) => Err(format!("Expected UUID string or null, got {}", other)),
    }
}

fn parse_json_payload_field(value: Option<&Value>) -> Value {
    match value {
        Some(Value::String(raw)) => serde_json::from_str(raw).unwrap_or_else(|_| json!({})),
        Some(Value::Object(_)) | Some(Value::Array(_)) => {
            value.cloned().unwrap_or_else(|| json!({}))
        }
        Some(Value::Null) | None => json!({}),
        Some(other) => other.clone(),
    }
}

fn metadata_string(value: &Value) -> String {
    match value {
        Value::String(raw) => raw.clone(),
        other => other.to_string(),
    }
}

fn infer_entity_type(event_type: &str) -> &'static str {
    if event_type.starts_with("Region") {
        "region"
    } else if event_type.starts_with("Layer") {
        "layer"
    } else if event_type.starts_with("FeatureGroup") {
        "feature_group"
    } else if event_type.starts_with("Feature") {
        "feature"
    } else if event_type.starts_with("Settings") {
        "settings"
    } else {
        "unknown"
    }
}

fn extract_event_type(obj: &serde_json::Map<String, Value>) -> String {
    obj.get("type")
        .or_else(|| obj.get("eventType"))
        .and_then(Value::as_str)
        .unwrap_or("unknown")
        .to_string()
}

fn frontend_event_to_envelope(
    project_id: &str,
    obj: serde_json::Map<String, Value>,
) -> Result<(crate::domain::models::v2::EventEnvelope, Value), String> {
    let event_type = extract_event_type(&obj);
    if event_type == "preview_update" {
        return Err("preview_update is preview-only and is not persisted".to_string());
    }

    let payload = obj
        .get("payload")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();

    let envelope_id = obj
        .get("id")
        .and_then(Value::as_str)
        .and_then(|raw| Uuid::parse_str(raw).ok())
        .unwrap_or_else(Uuid::new_v4);
    let resolved_project_id = obj
        .get("projectId")
        .and_then(Value::as_str)
        .filter(|raw| Uuid::parse_str(raw).is_ok())
        .unwrap_or(project_id);
    let project_uuid = Uuid::parse_str(resolved_project_id)
        .map_err(|_| "Invalid projectId in design event batch".to_string())?;
    let entity_id = parse_optional_uuid_value(obj.get("entityId").or_else(|| payload.get("id")))?
        .unwrap_or_else(Uuid::new_v4);
    let entity_type = obj
        .get("entityType")
        .and_then(Value::as_str)
        .map(|value| value.to_string())
        .unwrap_or_else(|| infer_entity_type(&event_type).to_string());
    let device_id = obj
        .get("deviceId")
        .and_then(Value::as_str)
        .unwrap_or("frontend-ui")
        .to_string();

    let app_event = match event_type.as_str() {
        "RegionCreated" => crate::domain::models::v2::AppEvent::RegionCreated {
            id: parse_uuid_value(payload.get("id"), "payload.id")?,
            name: payload
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or("Untitled Region")
                .to_string(),
            parent_id: parse_optional_uuid_value(payload.get("parent_id"))?,
            metadata: parse_json_payload_field(payload.get("metadata")),
        },
        "RegionUpdated" => crate::domain::models::v2::AppEvent::RegionUpdated {
            id: parse_uuid_value(payload.get("id"), "payload.id")?,
            changes: Value::Object(
                payload
                    .iter()
                    .filter(|(key, _)| key.as_str() != "id")
                    .map(|(key, value)| (key.clone(), value.clone()))
                    .collect(),
            ),
        },
        "RegionDeleted" => crate::domain::models::v2::AppEvent::RegionDeleted {
            id: parse_uuid_value(payload.get("id"), "payload.id")?,
        },
        "LayerCreated" => crate::domain::models::v2::AppEvent::LayerCreated {
            id: parse_uuid_value(payload.get("id"), "payload.id")?,
            region_id: parse_optional_uuid_value(payload.get("region_id"))?,
            name: payload
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or("Untitled Layer")
                .to_string(),
            metadata: parse_json_payload_field(payload.get("metadata")),
        },
        "LayerUpdated" => crate::domain::models::v2::AppEvent::LayerUpdated {
            id: parse_uuid_value(payload.get("id"), "payload.id")?,
            changes: Value::Object(
                payload
                    .iter()
                    .filter(|(key, _)| key.as_str() != "id")
                    .map(|(key, value)| (key.clone(), value.clone()))
                    .collect(),
            ),
        },
        "LayerDeleted" => crate::domain::models::v2::AppEvent::LayerDeleted {
            id: parse_uuid_value(payload.get("id"), "payload.id")?,
        },
        "FeatureGroupCreated" => crate::domain::models::v2::AppEvent::FeatureGroupCreated {
            id: parse_uuid_value(payload.get("id"), "payload.id")?,
            name: payload
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or("Untitled Group")
                .to_string(),
            layer_id: parse_uuid_value(payload.get("layer_id"), "payload.layer_id")?,
            parent_id: parse_optional_uuid_value(payload.get("parent_id"))?,
            group_type: payload
                .get("group_type")
                .or_else(|| payload.get("type"))
                .and_then(Value::as_str)
                .map(|value| value.to_string()),
            metadata: parse_json_payload_field(payload.get("metadata")),
        },
        "FeatureGroupUpdated" => crate::domain::models::v2::AppEvent::FeatureGroupUpdated {
            id: parse_uuid_value(payload.get("id"), "payload.id")?,
            changes: Value::Object(
                payload
                    .iter()
                    .filter(|(key, _)| key.as_str() != "id")
                    .map(|(key, value)| (key.clone(), value.clone()))
                    .collect(),
            ),
        },
        "FeatureGroupDeleted" => crate::domain::models::v2::AppEvent::FeatureGroupDeleted {
            id: parse_uuid_value(payload.get("id"), "payload.id")?,
        },
        "FeatureCreated" => crate::domain::models::v2::AppEvent::FeatureCreated {
            id: parse_uuid_value(payload.get("id"), "payload.id")?,
            layer_id: parse_uuid_value(payload.get("layer_id"), "payload.layer_id")?,
            group_id: parse_optional_uuid_value(payload.get("group_id"))?,
            task_id: parse_optional_uuid_value(payload.get("task_id"))?,
            name: payload
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or("Untitled Feature")
                .to_string(),
            geom_type: payload
                .get("geom_type")
                .and_then(Value::as_str)
                .unwrap_or("Point")
                .to_string(),
            geometry: payload
                .get("coordinates")
                .cloned()
                .or_else(|| payload.get("geometry").cloned())
                .unwrap_or(Value::Null),
            properties: parse_json_payload_field(payload.get("properties")),
            style_id: parse_optional_uuid_value(payload.get("style_id"))?,
            is_visible: payload
                .get("is_visible")
                .and_then(Value::as_bool)
                .unwrap_or(true),
            note: payload
                .get("note")
                .and_then(Value::as_str)
                .map(|value| value.to_string()),
            bbox: payload
                .get("bbox")
                .cloned()
                .filter(|value| !value.is_null()),
            metadata: parse_json_payload_field(payload.get("metadata")),
        },
        "FeatureUpdated" | "update_metadata" => {
            let mut changes = serde_json::Map::new();
            for (key, value) in &payload {
                if key == "id" {
                    continue;
                }
                if key == "coordinates" {
                    changes.insert("coordinates".to_string(), value.clone());
                    continue;
                }
                if key == "metadata" {
                    changes.insert(
                        "metadata".to_string(),
                        Value::String(parse_json_payload_field(Some(value)).to_string()),
                    );
                    continue;
                }
                changes.insert(key.clone(), value.clone());
            }
            crate::domain::models::v2::AppEvent::FeatureUpdated {
                id: parse_uuid_value(payload.get("id"), "payload.id")?,
                changes: Value::Object(changes),
            }
        }
        "FeatureDeleted" => crate::domain::models::v2::AppEvent::FeatureDeleted {
            id: parse_uuid_value(payload.get("id"), "payload.id")?,
        },
        "SettingsUpdated" => crate::domain::models::v2::AppEvent::SettingsUpdated {
            changes: payload
                .get("settings")
                .cloned()
                .or_else(|| payload.get("changes").cloned())
                .unwrap_or_else(|| json!({})),
        },
        other => return Err(format!("Unsupported design event type: {}", other)),
    };

    let response_event = match event_type.as_str() {
        "FeatureCreated" => json!({
            "type": event_type,
            "payload": {
                "id": payload.get("id").cloned().unwrap_or_else(|| json!(entity_id.to_string())),
                "layer_id": payload.get("layer_id").cloned().unwrap_or(Value::Null),
                "group_id": payload.get("group_id").cloned().unwrap_or(Value::Null),
                "name": payload.get("name").cloned().unwrap_or_else(|| json!("Untitled Feature")),
                "geom_type": payload.get("geom_type").cloned().unwrap_or_else(|| json!("Point")),
                "metadata": metadata_string(&parse_json_payload_field(payload.get("metadata"))),
                "properties": parse_json_payload_field(payload.get("properties")),
                "coordinates": payload.get("coordinates").cloned().or_else(|| payload.get("geometry").cloned()).unwrap_or(Value::Null),
            }
        }),
        "FeatureUpdated" | "update_metadata" => json!({
            "type": "FeatureUpdated",
            "payload": payload
        }),
        "SettingsUpdated" => json!({
            "type": "SettingsUpdated",
            "payload": {
                "settings": payload.get("settings").cloned().or_else(|| payload.get("changes").cloned()).unwrap_or_else(|| json!({}))
            }
        }),
        _ => json!({
            "type": event_type,
            "payload": Value::Object(payload.clone())
        }),
    };

    Ok((
        crate::domain::models::v2::EventEnvelope {
            id: envelope_id,
            entity_id,
            project_id: project_uuid,
            entity_type,
            event: app_event,
            version: 1,
            global_seq: 0,
            device_id,
            created_at: chrono::Utc::now(),
            metadata: None,
            correlation_id: None,
            causal_id: None,
            schema_version: 1,
            hash: None,
        },
        response_event,
    ))
}

fn app_state_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))
}

fn load_app_state(app: &AppHandle) -> Result<(PathBuf, AppState), String> {
    let app_data_dir = app_state_path(app)?;
    let state = hydrator::load_state(&app_data_dir);
    Ok((app_data_dir, state))
}

fn persist_app_state(app_data_dir: &PathBuf, state: &AppState) -> Result<(), String> {
    hydrator::save_state(app_data_dir, state)
}

fn recent_project_from_value(value: &Value) -> Option<StoredRecentProject> {
    let path = value.get("path")?.as_str()?.trim().to_string();
    let name = value
        .get("name")
        .or_else(|| value.get("title"))?
        .as_str()?
        .trim()
        .to_string();
    if path.is_empty() || name.is_empty() {
        return None;
    }

    Some(StoredRecentProject {
        id: value
            .get("id")
            .and_then(|v| v.as_str())
            .map(uuid_from_text_fallback)
            .unwrap_or_else(|| Uuid::new_v4().to_string()),
        name,
        path,
        description: trim_to_option(
            value
                .get("description")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
        ),
        status: value
            .get("status")
            .and_then(|v| v.as_str())
            .filter(|status| !status.trim().is_empty())
            .unwrap_or("active")
            .to_string(),
        created_at: value
            .get("created_at")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string(),
        updated_at: value
            .get("updated_at")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string(),
    })
}

fn recent_project_to_value(project: &StoredRecentProject) -> Value {
    json!({
        "id": project.id,
        "name": project.name,
        "title": project.name,
        "path": project.path,
        "description": project.description,
        "status": project.status,
        "created_at": project.created_at,
        "updated_at": project.updated_at,
        "contract_number": Value::Null,
        "investor": Value::Null,
        "contractor": Value::Null,
        "signed_date": Value::Null,
        "duration": Value::Null,
        "end_date": Value::Null
    })
}

fn sanitize_recent_projects(mut projects: Vec<StoredRecentProject>) -> Vec<StoredRecentProject> {
    let mut deduped = Vec::new();
    for project in projects.drain(..) {
        if project.path.trim().is_empty() || project.name.trim().is_empty() {
            continue;
        }
        if !Path::new(&project.path).exists() {
            continue;
        }
        if deduped
            .iter()
            .any(|item: &StoredRecentProject| item.path.eq_ignore_ascii_case(&project.path))
        {
            continue;
        }
        deduped.push(project);
        if deduped.len() == 10 {
            break;
        }
    }
    deduped
}

fn write_recent_projects(
    app_data_dir: &PathBuf,
    state: &mut AppState,
    projects: Vec<StoredRecentProject>,
) -> Result<Vec<StoredRecentProject>, String> {
    state.recent_pmps = sanitize_recent_projects(projects);
    persist_app_state(app_data_dir, state)?;
    Ok(state.recent_pmps.clone())
}

fn upsert_recent_project(state: &mut AppState, project: StoredRecentProject) {
    let project_path = project.path.clone();
    let mut next = vec![project];
    next.extend(
        state
            .recent_pmps
            .iter()
            .filter(|item| !item.path.eq_ignore_ascii_case(&project_path))
            .cloned(),
    );
    state.recent_pmps = sanitize_recent_projects(next);
}

fn build_project_value(
    id: String,
    name: String,
    path: String,
    description: Option<String>,
    status: Option<String>,
    created_at: Option<String>,
    updated_at: Option<String>,
    metadata_json: Option<Value>,
) -> Value {
    json!({
        "id": uuid_from_text_fallback(&id),
        "name": name,
        "title": name,
        "path": path,
        "description": description,
        "status": status.unwrap_or_else(|| "active".to_string()),
        "created_at": created_at.unwrap_or_default(),
        "updated_at": updated_at.unwrap_or_default(),
        "metadata_json": metadata_json,
        "contract_number": Value::Null,
        "investor": Value::Null,
        "contractor": Value::Null,
        "signed_date": Value::Null,
        "duration": Value::Null,
        "end_date": Value::Null
    })
}

fn project_from_query_result(result: &Value, path: &str) -> Option<Value> {
    let row = result.as_array()?.first()?;
    let id = row.get("id")?.as_str()?.to_string();
    let name = row
        .get("title")
        .or_else(|| row.get("name"))
        .and_then(|value| value.as_str())
        .unwrap_or("Untitled Project")
        .to_string();
    let description = trim_to_option(
        row.get("description")
            .and_then(|value| value.as_str())
            .map(|s| s.to_string()),
    );
    let status = row
        .get("status")
        .and_then(|value| value.as_str())
        .map(|s| s.to_string());
    let created_at = row
        .get("created_at")
        .and_then(|value| value.as_str())
        .map(|s| s.to_string());
    let updated_at = row
        .get("updated_at")
        .and_then(|value| value.as_str())
        .map(|s| s.to_string());
    let metadata_json = row.get("metadata_json").cloned();

    Some(build_project_value(
        id,
        name,
        path.to_string(),
        description,
        status,
        created_at,
        updated_at,
        metadata_json,
    ))
}

async fn persist_active_project_keys(
    state: &ActorState,
    project_id: Option<String>,
    project_path: Option<String>,
) -> Result<(), String> {
    if let Some(id) = project_id {
        exec_query(
            state,
            "INSERT OR REPLACE INTO sys_config(key, value) VALUES ('active_project_id', ?)",
            vec![id],
        )
        .await?;
    }
    if let Some(path) = project_path {
        exec_query(
            state,
            "INSERT OR REPLACE INTO sys_config(key, value) VALUES ('active_project_path', ?)",
            vec![path],
        )
        .await?;
    }
    Ok(())
}

fn uuid_from_text_fallback(input: &str) -> String {
    let trimmed = input.trim();
    if let Ok(parsed) = Uuid::parse_str(trimmed) {
        return parsed.to_string();
    }
    Uuid::new_v5(&Uuid::NAMESPACE_OID, trimmed.as_bytes()).to_string()
}

#[tauri::command]
pub async fn create_pmp_v2(
    app: AppHandle,
    state: State<'_, ActorState>,
    path: String,
    name: String,
    description: Option<String>,
) -> Result<Value, String> {
    let path_buf = PathBuf::from(&path);
    ensure_pmp_extension(&path_buf)?;

    let project_name = if name.trim().is_empty() {
        path_buf
            .file_stem()
            .and_then(|stem| stem.to_str())
            .unwrap_or("Untitled Project")
            .to_string()
    } else {
        name.trim().to_string()
    };
    let description = trim_to_option(description);
    let project_id = Uuid::new_v4().to_string();
    let created_at = chrono::Local::now().to_rfc3339();

    let db = PmpDatabase::open_or_create(path_buf.clone()).map_err(|e| e.to_string())?;
    let project_count: i64 = db
        .conn
        .query_row("SELECT COUNT(*) FROM projects", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    if project_count > 0 {
        return Err(
            "The selected .pmp file already contains a project. Please choose a new file path."
                .to_string(),
        );
    }

    db.conn
        .execute(
            "INSERT INTO projects (id, name, title, description, base_dir_hint, metadata_json) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![
                project_id.clone(),
                project_name.clone(),
                project_name.clone(),
                description.clone(),
                path_buf.parent().map(|parent| parent.to_string_lossy().to_string()),
                json!({}).to_string()
            ],
        )
        .map_err(|e| e.to_string())?;
    db.conn
        .execute(
            "INSERT OR REPLACE INTO sys_config(key, value) VALUES ('active_project_id', ?1)",
            [project_id.clone()],
        )
        .map_err(|e| e.to_string())?;
    db.conn
        .execute(
            "INSERT OR REPLACE INTO sys_config(key, value) VALUES ('active_project_path', ?1)",
            [path.clone()],
        )
        .map_err(|e| e.to_string())?;
    db.checkpoint_wal().map_err(|e| e.to_string())?;

    switch_database(&state, path_buf).await?;

    let project = build_project_value(
        project_id.clone(),
        project_name,
        path.clone(),
        description,
        Some("active".to_string()),
        Some(created_at.clone()),
        Some(created_at.clone()),
        Some(json!({})),
    );

    let (app_data_dir, mut app_state) = load_app_state(&app)?;
    app_state.project_id = Some(project_id.clone());
    app_state.last_opened_path = Some(path.clone());
    app_state.pending_open_path = None;
    app_state.v2_loaded = true;
    if let Some(recent) = recent_project_from_value(&project) {
        upsert_recent_project(&mut app_state, recent);
    }
    persist_app_state(&app_data_dir, &app_state)?;

    Ok(project)
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn add_file_v2(
    state: State<'_, ActorState>,
    id: String,
    project_id: Option<String>,
    projectId: Option<String>,
    abs_path: Option<String>,
    absPath: Option<String>,
    meta: serde_json::Value,
) -> Result<(), String> {
    let project_id = project_id
        .or(projectId)
        .ok_or_else(|| "Missing project_id".to_string())?;
    let abs_path = abs_path
        .or(absPath)
        .ok_or_else(|| "Missing abs_path".to_string())?;
    let path_buf = abs_path.parse().map_err(|_| "Invalid path")?;
    state
        .gateway_tx
        .send(StorageCommand::AddFile {
            id,
            project_id,
            abs_path: path_buf,
            meta,
        })
        .await
        .map_err(|e| format!("IPC Queue error: {}", e))
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn update_metadata_v2(
    state: State<'_, ActorState>,
    file_id: Option<String>,
    fileId: Option<String>,
    patch: serde_json::Value,
) -> Result<(), String> {
    let file_id = file_id
        .or(fileId)
        .ok_or_else(|| "Missing file_id".to_string())?;
    state
        .gateway_tx
        .send(StorageCommand::PatchMetadata { file_id, patch })
        .await
        .map_err(|e| format!("IPC Queue error: {}", e))
}

// --- Compatibility & Required Stubs ---

#[tauri::command]
pub async fn get_app_config(app: AppHandle) -> Result<serde_json::Value, String> {
    let (app_data_dir, mut state) = load_app_state(&app)?;
    let existing_recent = state.recent_pmps.clone();
    let recent = write_recent_projects(&app_data_dir, &mut state, existing_recent)?;
    Ok(json!({
        "version": "2.0.0-zero-legacy",
        "storage_mode": "monolithic",
        "features": ["fts5", "actor_pipeline"],
        "recent_pmps": recent.iter().map(recent_project_to_value).collect::<Vec<_>>(),
        "last_opened_pmp": state.last_opened_path
    }))
}

#[tauri::command]
pub async fn get_pending_pmp_path(app: AppHandle) -> Result<Option<String>, String> {
    let (_app_data_dir, state) = load_app_state(&app)?;
    Ok(state.pending_open_path)
}

#[tauri::command]
pub async fn get_recent_projects(app: AppHandle) -> Result<Vec<Value>, String> {
    let (app_data_dir, mut state) = load_app_state(&app)?;
    let existing_recent = state.recent_pmps.clone();
    let recent = write_recent_projects(&app_data_dir, &mut state, existing_recent)?;
    Ok(recent.iter().map(recent_project_to_value).collect())
}

#[tauri::command]
pub async fn analyze_import_file(path: String) -> Result<DatasetMetaResponse, String> {
    let path_buf = PathBuf::from(&path);
    let (_sheet_name, headers, rows) = read_excel_table(&path_buf)?;
    Ok(build_dataset_meta(&path_buf, &headers, &rows))
}

#[tauri::command]
pub async fn start_import_task(
    path: String,
    mapping: Option<ImportMappingPayload>,
) -> Result<Vec<ImportFeatureRecord>, String> {
    let path_buf = PathBuf::from(&path);
    let (_sheet_name, headers, rows) = read_excel_table(&path_buf)?;
    let effective_mapping =
        mapping.ok_or_else(|| "Import mapping is required for Excel import".to_string())?;
    parse_feature_records(&headers, &rows, &effective_mapping)
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn get_project_tree(
    state: State<'_, ActorState>,
    projectId: String,
    _path: Option<String>,
) -> Result<Vec<Value>, String> {
    let res = exec_query(
        &state,
        "SELECT * FROM files WHERE project_id = ?",
        vec![projectId],
    )
    .await?;
    Ok(res.as_array().cloned().unwrap_or_default())
}

#[tauri::command]
pub async fn sync_v2_get_status() -> Result<serde_json::Value, String> {
    Ok(json!({ "status": "offline", "reason": "v2_zero_legacy_no_sync" }))
}

#[tauri::command]
pub async fn sync_v2_is_online() -> Result<bool, String> {
    Ok(false)
}

#[tauri::command]
pub async fn load_pmp_file(
    app: AppHandle,
    state: State<'_, ActorState>,
    path: String,
) -> Result<serde_json::Value, String> {
    log::info!("[V2] load_pmp_file requesting switch to: {}", path);
    let path_buf = PathBuf::from(&path);
    ensure_pmp_extension(&path_buf)?;
    let title = path_buf
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Unknown Project")
        .to_string();

    switch_database(&state, path_buf).await?;

    let mut first_project = exec_query(
        &state,
        "SELECT id, title, description, metadata_json, created_at, updated_at FROM projects ORDER BY created_at ASC LIMIT 1",
        vec![],
    ).await?;

    if first_project
        .as_array()
        .map(|arr| arr.is_empty())
        .unwrap_or(true)
    {
        let fallback_id = Uuid::new_v4().to_string();
        state
            .gateway_tx
            .send(StorageCommand::CreateProject {
                id: fallback_id.clone(),
                title: title.clone(),
                base_hint: Path::new(&path)
                    .parent()
                    .map(|parent| parent.to_string_lossy().to_string())
                    .unwrap_or_default(),
            })
            .await
            .map_err(|e| format!("IPC Queue error: {}", e))?;
        first_project = exec_query(
            &state,
            "SELECT id, title, description, metadata_json, created_at, updated_at FROM projects WHERE id = ? LIMIT 1",
            vec![fallback_id],
        ).await?;
    }

    let project = project_from_query_result(&first_project, &path)
        .ok_or_else(|| "Failed to resolve project metadata from .pmp file".to_string())?;
    let project_id = project
        .get("id")
        .and_then(|value| value.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| "Loaded project is missing an id".to_string())?;

    persist_active_project_keys(&state, Some(project_id.clone()), Some(path.clone())).await?;

    let (app_data_dir, mut app_state) = load_app_state(&app)?;
    app_state.project_id = Some(project_id);
    app_state.last_opened_path = Some(path.clone());
    app_state.pending_open_path = None;
    app_state.v2_loaded = true;
    if let Some(recent) = recent_project_from_value(&project) {
        upsert_recent_project(&mut app_state, recent);
    }
    persist_app_state(&app_data_dir, &app_state)?;

    Ok(project)
}

#[tauri::command]
pub async fn get_active_project(state: State<'_, ActorState>) -> Result<Option<Value>, String> {
    let active_id = exec_query(
        &state,
        "SELECT value FROM sys_config WHERE key = 'active_project_id' LIMIT 1",
        vec![],
    )
    .await?
    .as_array()
    .and_then(|arr| arr.first())
    .and_then(|row| row.get("value"))
    .and_then(|v| v.as_str())
    .map(|s| s.to_string());
    let active_path = exec_query(
        &state,
        "SELECT value FROM sys_config WHERE key = 'active_project_path' LIMIT 1",
        vec![],
    )
    .await?
    .as_array()
    .and_then(|arr| arr.first())
    .and_then(|row| row.get("value"))
    .and_then(|v| v.as_str())
    .map(|s| s.to_string());
    let res = if let Some(project_id) = active_id {
        exec_query(
            &state,
            "SELECT id, title, description, metadata_json, created_at, updated_at FROM projects WHERE id = ? LIMIT 1",
            vec![project_id],
        )
        .await?
    } else {
        exec_query(
            &state,
            "SELECT id, title, description, metadata_json, created_at, updated_at FROM projects ORDER BY created_at ASC LIMIT 1",
            vec![],
        )
        .await?
    };

    Ok(project_from_query_result(
        &res,
        &active_path.unwrap_or_else(|| "./default_project.pmp".to_string()),
    ))
}

#[tauri::command]
pub async fn save_recent_projects(app: AppHandle, projects: Vec<Value>) -> Result<(), String> {
    log::info!("[V2] save_recent_projects: count={}", projects.len());
    let (app_data_dir, mut state) = load_app_state(&app)?;
    let next = projects
        .iter()
        .filter_map(recent_project_from_value)
        .collect::<Vec<_>>();
    write_recent_projects(&app_data_dir, &mut state, next)?;
    Ok(())
}

#[tauri::command]
pub async fn save_last_opened_project(
    app: AppHandle,
    state: State<'_, ActorState>,
    project: Option<Value>,
    path: Option<String>,
) -> Result<(), String> {
    let project_id = project
        .as_ref()
        .and_then(|p| p.get("id"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let project_path = path.or_else(|| {
        project
            .as_ref()
            .and_then(|p| p.get("path"))
            .and_then(|v| v.as_str().map(|s| s.to_string()))
    });

    let _ = persist_active_project_keys(&state, project_id, project_path.clone()).await;
    let (app_data_dir, mut st) = load_app_state(&app)?;
    if let Some(p) = project_path.clone() {
        st.last_opened_path = Some(p);
    }
    if let Some(project_value) = project.as_ref().and_then(recent_project_from_value) {
        upsert_recent_project(&mut st, project_value);
    }
    st.v2_loaded = true;
    persist_app_state(&app_data_dir, &st)?;

    log::info!("[V2] save_last_opened_project: path={:?}", project_path);
    Ok(())
}

#[tauri::command]
pub async fn index_project_files(
    _state: State<'_, ActorState>,
    project_id: String,
) -> Result<serde_json::Value, String> {
    log::info!("[V2] index_project_files for project: {}", project_id);
    Ok(json!({
        "status": "indexed",
        "count": 0,
        "indexed_at": chrono::Local::now().to_rfc3339()
    }))
}

#[tauri::command]
pub async fn search_v2(state: State<'_, ActorState>, query: String) -> Result<Vec<Value>, String> {
    log::info!("[V2] Global search: {}", query);
    let sql = "
        SELECT f.id, f.filename, f.rel_path, f.metadata_json 
        FROM fts_files_content fts
        JOIN files f ON f.id = fts.file_id
        WHERE fts.content MATCH ?
        LIMIT 50
    ";
    let res = exec_query(&state, sql, vec![query]).await?;
    Ok(res.as_array().cloned().unwrap_or_default())
}

#[tauri::command]
pub async fn get_stats_v2(state: State<'_, ActorState>) -> Result<Value, String> {
    let project_count =
        exec_query(&state, "SELECT count(*) as count FROM projects", vec![]).await?;
    let file_count = exec_query(&state, "SELECT count(*) as count FROM files", vec![]).await?;
    let tag_count = exec_query(&state, "SELECT count(*) as count FROM tags", vec![]).await?;

    Ok(json!({
        "projects": project_count[0]["count"],
        "files": file_count[0]["count"],
        "tags": tag_count[0]["count"],
        "updated_at": chrono::Local::now().to_rfc3339()
    }))
}

async fn dashboard_project_stats_for_project(
    state: &ActorState,
    project_id: String,
) -> Result<DashboardProjectStats, String> {
    let sql = "
        SELECT
            COUNT(*) as total_files,
            COALESCE(SUM(COALESCE(file_size, 0)), 0) as total_size
        FROM files
        WHERE project_id = ?1
    ";
    let rows = exec_query(state, sql, vec![project_id]).await?;
    let row = rows
        .as_array()
        .and_then(|items| items.first())
        .ok_or_else(|| "Analytics query returned no rows".to_string())?;

    Ok(DashboardProjectStats {
        total_files: row.get("total_files").and_then(Value::as_i64).unwrap_or(0),
        total_size: row.get("total_size").and_then(Value::as_i64).unwrap_or(0),
    })
}

async fn dashboard_extension_dist_for_project(
    state: &ActorState,
    project_id: String,
) -> Result<Vec<DashboardExtensionStat>, String> {
    let sql = "
        SELECT
            COALESCE(NULLIF(TRIM(LOWER(extension)), ''), 'none') as extension,
            COUNT(*) as count
        FROM files
        WHERE project_id = ?1
        GROUP BY COALESCE(NULLIF(TRIM(LOWER(extension)), ''), 'none')
        ORDER BY count DESC, extension ASC
    ";
    let rows = exec_query(state, sql, vec![project_id]).await?;

    Ok(rows
        .as_array()
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .map(|row| DashboardExtensionStat {
            extension: row
                .get("extension")
                .and_then(Value::as_str)
                .unwrap_or("none")
                .to_string(),
            count: row.get("count").and_then(Value::as_i64).unwrap_or(0),
        })
        .collect())
}

async fn dashboard_top_files_for_project(
    state: &ActorState,
    project_id: String,
    limit: i64,
) -> Result<Vec<DashboardFileStat>, String> {
    let sql = "
        SELECT
            filename as name,
            COALESCE(file_size, 0) as size
        FROM files
        WHERE project_id = ?1
        ORDER BY COALESCE(file_size, 0) DESC, filename ASC
        LIMIT ?2
    ";
    let rows = exec_query(state, sql, vec![project_id, limit.to_string()]).await?;

    Ok(rows
        .as_array()
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .map(|row| DashboardFileStat {
            name: row
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            size: row.get("size").and_then(Value::as_i64).unwrap_or(0),
        })
        .collect())
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn get_dashboard_project_stats(
    state: State<'_, ActorState>,
    project_id: Option<String>,
    projectId: Option<String>,
) -> Result<DashboardProjectStats, String> {
    let project_id = project_id
        .or(projectId)
        .ok_or_else(|| "Missing project_id".to_string())?;
    dashboard_project_stats_for_project(&state, project_id).await
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn get_dashboard_extension_dist(
    state: State<'_, ActorState>,
    project_id: Option<String>,
    projectId: Option<String>,
) -> Result<Vec<DashboardExtensionStat>, String> {
    let project_id = project_id
        .or(projectId)
        .ok_or_else(|| "Missing project_id".to_string())?;
    dashboard_extension_dist_for_project(&state, project_id).await
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn get_dashboard_top_files(
    state: State<'_, ActorState>,
    project_id: Option<String>,
    projectId: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<DashboardFileStat>, String> {
    let project_id = project_id
        .or(projectId)
        .ok_or_else(|| "Missing project_id".to_string())?;
    let limit = limit.unwrap_or(10).clamp(1, 100);
    dashboard_top_files_for_project(&state, project_id, limit).await
}

// --- V1/V2 Realized Projections ---
// Moved to v2_bridge.rs with project_id support

#[tauri::command]
pub async fn get_projects(state: State<'_, ActorState>) -> Result<Vec<Value>, String> {
    let active_path = exec_query(
        &state,
        "SELECT value FROM sys_config WHERE key = 'active_project_path' LIMIT 1",
        vec![],
    )
    .await?
    .as_array()
    .and_then(|arr| arr.first())
    .and_then(|row| row.get("value"))
    .and_then(|v| v.as_str())
    .unwrap_or("./default_project.pmp")
    .to_string();
    let res = exec_query(
        &state,
        "SELECT id, title, description, metadata_json, created_at, updated_at FROM projects",
        vec![],
    )
    .await?;
    Ok(res
        .as_array()
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|row| project_from_query_result(&json!([row]), &active_path))
        .collect())
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn invoke_design_event_batch(
    state: State<'_, ActorState>,
    projectId: String,
    events: Vec<serde_json::Value>,
    requestId: Option<i32>,
) -> Result<Value, String> {
    log::info!(
        "[V2] Processing design event batch: count={}, requestId={:?}",
        events.len(),
        requestId
    );
    let mut envelopes = Vec::new();
    let mut applied_events = Vec::new();
    let mut skipped_events = 0usize;

    for v in events {
        let mut obj = v
            .as_object()
            .cloned()
            .ok_or_else(|| "Event must be an object".to_string())?;
        let event_type = extract_event_type(&obj);

        // Inject projectId if missing
        if !obj.contains_key("projectId") {
            obj.insert("projectId".to_string(), json!(projectId));
        }

        // Ensure id is present (UUID)
        if obj.get("id").map(|id| id.is_null()).unwrap_or(true) {
            obj.insert("id".to_string(), json!(uuid::Uuid::new_v4().to_string()));
        }
        if let Some(id_str) = obj.get("id").and_then(|v| v.as_str()) {
            if uuid::Uuid::parse_str(id_str).is_err() {
                obj.insert("id".to_string(), json!(uuid::Uuid::new_v4().to_string()));
            }
        }
        if let Some(pid_str) = obj.get("projectId").and_then(|v| v.as_str()) {
            if uuid::Uuid::parse_str(pid_str).is_err() {
                obj.insert(
                    "projectId".to_string(),
                    json!(uuid::Uuid::new_v4().to_string()),
                );
            }
        }

        // Fill fields expected by EventEnvelope if missing.
        if !obj.contains_key("entityType") {
            let inferred_entity_type = if event_type.starts_with("Region") {
                "region"
            } else if event_type.starts_with("Layer") {
                "layer"
            } else if event_type.starts_with("FeatureGroup") {
                "feature_group"
            } else if event_type.starts_with("Feature") {
                "feature"
            } else if event_type.starts_with("Settings") {
                "settings"
            } else {
                "unknown"
            };
            obj.insert("entityType".to_string(), json!(inferred_entity_type));
        }
        if !obj.contains_key("entityId") {
            let entity_id = obj
                .get("payload")
                .and_then(|p| p.get("id"))
                .and_then(|v| v.as_str())
                .and_then(|id| uuid::Uuid::parse_str(id).ok())
                .unwrap_or_else(uuid::Uuid::new_v4)
                .to_string();
            obj.insert("entityId".to_string(), json!(entity_id));
        }
        if let Some(eid_str) = obj.get("entityId").and_then(|v| v.as_str()) {
            if uuid::Uuid::parse_str(eid_str).is_err() {
                obj.insert(
                    "entityId".to_string(),
                    json!(uuid::Uuid::new_v4().to_string()),
                );
            }
        }

        match frontend_event_to_envelope(&projectId, obj) {
            Ok((envelope, response_event)) => {
                envelopes.push(envelope);
                applied_events.push(response_event);
            }
            Err(e) => {
                skipped_events += 1;
                if event_type == "preview_update" {
                    log::info!("[V2] Skipping non-persisted preview event");
                } else {
                    log::warn!("[V2] Skipping invalid design event: {}", e);
                }
            }
        }
    }

    let last_event_id = envelopes
        .last()
        .map(|e| e.id.to_string())
        .unwrap_or_default();

    if envelopes.is_empty() {
        return Err("No valid design events to persist".to_string());
    }

    let (tx, rx) = oneshot::channel();
    state
        .gateway_tx
        .send(StorageCommand::DispatchEvents {
            events: envelopes,
            reply: tx,
        })
        .await
        .map_err(|e| format!("IPC Queue error: {}", e))?;
    let persisted_count = rx.await.map_err(|e| e.to_string())??;

    Ok(json!({
        "success": true,
        "last_event_id": last_event_id,
        "applied_events": applied_events,
        "side_effects": [],
        "skipped_events": skipped_events,
        "persisted_count": persisted_count
    }))
}

#[tauri::command]
pub async fn normalize_metadata(
    _state: State<'_, ActorState>,
    text: String,
) -> Result<serde_json::Value, String> {
    log::info!("[V2] AI Normalization requested for: {}", text);
    // Mock response for now, to be replaced by ONNX/Burn actor
    Ok(json!({
        "normalized_text": text.trim().to_uppercase(),
        "embedding": vec![0.0; 384],
        "model": "all-MiniLM-L6-v2-mock",
        "updated_at": chrono::Local::now().to_rfc3339()
    }))
}

#[tauri::command]
pub async fn rebuild_fts_v2(state: State<'_, ActorState>) -> Result<(), String> {
    let (tx, rx) = oneshot::channel();
    state
        .gateway_tx
        .send(StorageCommand::Query {
            sql: "REBUILD_FTS".to_string(), // We'll handle this special "SQL" in StorageWorker or add a dedicated command
            params: vec![],
            reply: tx,
        })
        .await
        .map_err(|e| e.to_string())?;

    rx.await.map_err(|e| e.to_string())?.map(|_| ())
}

#[tauri::command]
pub async fn close_active_project(
    app: AppHandle,
    state: State<'_, ActorState>,
) -> Result<(), String> {
    _save_project(&state).await?;
    let _ = exec_query(
        &state,
        "DELETE FROM sys_config WHERE key IN ('active_project_id', 'active_project_path')",
        vec![],
    )
    .await?;
    let (app_data_dir, mut app_state) = load_app_state(&app)?;
    app_state.project_id = None;
    app_state.pending_open_path = None;
    app_state.v2_loaded = false;
    persist_app_state(&app_data_dir, &app_state)
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn import_media_asset(
    state: State<'_, ActorState>,
    projectId: Option<String>,
    featureId: Option<String>,
    dataUrl: Option<String>,
    filePath: Option<String>,
    payload: Option<ImportMediaAssetPayload>,
) -> Result<Value, String> {
    let (project_id, feature_id, data_url, file_path) = if let Some(payload) = payload {
        (
            payload.project_id,
            payload.feature_id,
            payload.data_url,
            payload.file_path,
        )
    } else {
        (
            projectId.ok_or_else(|| "Missing projectId".to_string())?,
            featureId.ok_or_else(|| "Missing featureId".to_string())?,
            dataUrl,
            filePath,
        )
    };
    let (tx, rx) = oneshot::channel();
    state
        .gateway_tx
        .send(StorageCommand::ImportMediaAsset {
            project_id,
            feature_id,
            data_url,
            file_path,
            reply: tx,
        })
        .await
        .map_err(|e| e.to_string())?;
    rx.await.map_err(|e| e.to_string())?
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn delete_media_asset(
    state: State<'_, ActorState>,
    projectId: String,
    assetId: String,
) -> Result<(), String> {
    let (tx, rx) = oneshot::channel();
    state
        .gateway_tx
        .send(StorageCommand::DeleteMediaAsset {
            project_id: projectId,
            asset_id: assetId,
            reply: tx,
        })
        .await
        .map_err(|e| e.to_string())?;
    rx.await.map_err(|e| e.to_string())?
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn resolve_media_asset(
    state: State<'_, ActorState>,
    projectId: String,
    assetId: String,
) -> Result<Value, String> {
    let (tx, rx) = oneshot::channel();
    state
        .gateway_tx
        .send(StorageCommand::ResolveMediaAsset {
            project_id: projectId,
            asset_id: assetId,
            reply: tx,
        })
        .await
        .map_err(|e| e.to_string())?;
    rx.await.map_err(|e| e.to_string())?
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn optimize_project_storage(
    state: State<'_, ActorState>,
    projectId: String,
) -> Result<Value, String> {
    let (tx, rx) = oneshot::channel();
    state
        .gateway_tx
        .send(StorageCommand::OptimizeProjectStorage {
            project_id: projectId,
            reply: tx,
        })
        .await
        .map_err(|e| e.to_string())?;
    rx.await.map_err(|e| e.to_string())?
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn get_project_storage_health(
    state: State<'_, ActorState>,
    projectId: String,
) -> Result<Value, String> {
    let (tx, rx) = oneshot::channel();
    state
        .gateway_tx
        .send(StorageCommand::GetProjectHealth {
            project_id: projectId,
            reply: tx,
        })
        .await
        .map_err(|e| e.to_string())?;
    rx.await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn remove_recent_project(app: AppHandle, path: String) -> Result<(), String> {
    let (app_data_dir, mut app_state) = load_app_state(&app)?;
    app_state
        .recent_pmps
        .retain(|project| !project.path.eq_ignore_ascii_case(&path));
    persist_app_state(&app_data_dir, &app_state)
}

#[tauri::command]
pub async fn delete_project(app: AppHandle, id: String) -> Result<(), String> {
    let (app_data_dir, mut app_state) = load_app_state(&app)?;
    app_state.recent_pmps.retain(|project| project.id != id);
    persist_app_state(&app_data_dir, &app_state)
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn find_nearest_snap_point(
    _state: State<'_, ActorState>,
    _projectId: String,
    x: f64,
    y: f64,
    threshold: Option<f64>,
) -> Result<Value, String> {
    log::info!(
        "[V2] find_nearest_snap_point: x={}, y={}, threshold={:?}",
        x,
        y,
        threshold
    );
    Ok(json!(null))
}

async fn _save_project(state: &ActorState) -> Result<(), String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    state
        .gateway_tx
        .send(StorageCommand::SaveProject { reply: tx })
        .await
        .map_err(|e| e.to_string())?;
    rx.await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn save_project(state: State<'_, ActorState>) -> Result<(), String> {
    log::info!("[V2] save_project requested via Actor flow");
    _save_project(&state).await
}

#[tauri::command]
pub async fn force_save_project(state: State<'_, ActorState>) -> Result<(), String> {
    _save_project(&state).await
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn save_project_bom_table(
    state: State<'_, ActorState>,
    projectId: String,
    bomData: Value,
) -> Result<(), String> {
    log::info!("[V2] save_project_bom_table for project: {}", projectId);
    let patch = json!({
        "custom": {
            "bom_table": bomData
        }
    });

    state
        .gateway_tx
        .send(StorageCommand::PatchProjectMetadata {
            project_id: projectId,
            patch,
        })
        .await
        .map_err(|e| e.to_string())?;

    _save_project(&state).await
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn update_project_state_v2(
    state: State<'_, ActorState>,
    project_id: Option<String>,
    projectId: Option<String>,
    project_state: Option<Value>,
    projectState: Option<Value>,
) -> Result<(), String> {
    let project_id = project_id
        .or(projectId)
        .ok_or_else(|| "Missing project_id".to_string())?;
    let project_state = project_state
        .or(projectState)
        .ok_or_else(|| "Missing project_state".to_string())?;
    log::info!("[V2] update_project_state_v2 for project: {}", project_id);

    let (tx, rx) = oneshot::channel();
    state
        .gateway_tx
        .send(StorageCommand::UpdateProjectState {
            project_id,
            state: project_state,
            reply: tx,
        })
        .await
        .map_err(|e| e.to_string())?;

    rx.await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::implement::modules::v2::pipeline::eventbus::StorageCommand;
    use crate::domain::implement::modules::v2::pipeline::worker_storage::StorageWorker;
    use crate::domain::implement::modules::v2::storage::connection::PmpDatabase;
    use tempfile::tempdir;
    use tokio::sync::mpsc;
    use tokio::sync::oneshot;

    #[tokio::test]
    async fn binary_file_commands_round_trip_bytes() {
        let dir = tempdir().expect("tempdir");
        let file_path = dir.path().join("analysis_export.xlsx");
        let bytes = vec![0_u8, 1, 2, 3, 254, 255];

        save_binary_file(file_path.to_string_lossy().to_string(), bytes.clone())
            .await
            .expect("save binary file");

        let actual = read_binary_file(file_path.to_string_lossy().to_string())
            .await
            .expect("read binary file");

        assert_eq!(actual, bytes);
    }

    #[tokio::test]
    async fn active_project_keys_roundtrip_for_reopen_flow() {
        let dir = tempdir().expect("tempdir");
        let pmp_path = dir.path().join("active_path_in_command.pmp");
        let pmp_path_str = pmp_path.to_string_lossy().to_string();

        let db = PmpDatabase::open_or_create(pmp_path.clone()).expect("open db");
        db.conn
            .execute(
                "INSERT INTO projects (id, name, title, base_dir_hint) VALUES (?1, ?2, ?3, ?4)",
                rusqlite::params![
                    "p1",
                    "Project One",
                    "Project One",
                    dir.path().to_string_lossy().to_string()
                ],
            )
            .expect("seed project");

        let (tx, rx) = mpsc::channel(32);
        let _handle = StorageWorker::spawn(rx, db);
        let actor_state = ActorState { gateway_tx: tx };

        let first_project = exec_query(
            &actor_state,
            "SELECT id, title FROM projects ORDER BY created_at ASC LIMIT 1",
            vec![],
        )
        .await
        .expect("query first project");
        let resolved_id = first_project
            .as_array()
            .and_then(|arr| arr.first())
            .and_then(|row| row.get("id"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        assert_eq!(resolved_id, "p1");

        let _ = exec_query(
            &actor_state,
            "INSERT OR REPLACE INTO sys_config(key, value) VALUES ('active_project_id', ?)",
            vec![resolved_id.clone()],
        )
        .await
        .expect("write active_project_id");
        let _ = exec_query(
            &actor_state,
            "INSERT OR REPLACE INTO sys_config(key, value) VALUES ('active_project_path', ?)",
            vec![pmp_path_str.clone()],
        )
        .await
        .expect("write active_project_path");

        let loaded_id = exec_query(
            &actor_state,
            "SELECT value FROM sys_config WHERE key = 'active_project_id' LIMIT 1",
            vec![],
        )
        .await
        .expect("read active_project_id");
        let loaded_path = exec_query(
            &actor_state,
            "SELECT value FROM sys_config WHERE key = 'active_project_path' LIMIT 1",
            vec![],
        )
        .await
        .expect("read active_project_path");

        assert_eq!(
            loaded_id
                .as_array()
                .and_then(|arr| arr.first())
                .and_then(|row| row.get("value"))
                .and_then(|v| v.as_str()),
            Some("p1")
        );
        assert_eq!(
            loaded_path
                .as_array()
                .and_then(|arr| arr.first())
                .and_then(|row| row.get("value"))
                .and_then(|v| v.as_str()),
            Some(pmp_path_str.as_str())
        );
    }

    #[tokio::test]
    async fn persist_active_project_keys_writes_sys_config() {
        let dir = tempdir().expect("tempdir");
        let pmp_path = dir.path().join("save_last_opened_project.pmp");
        let pmp_path_str = pmp_path.to_string_lossy().to_string();

        let db = PmpDatabase::open_or_create(pmp_path).expect("open db");
        let (tx, rx) = mpsc::channel(32);
        let _handle = StorageWorker::spawn(rx, db);
        let actor_state = ActorState { gateway_tx: tx };

        let project_id = "last_p1".to_string();
        let project_path = pmp_path_str;
        persist_active_project_keys(
            &actor_state,
            Some(project_id.clone()),
            Some(project_path.clone()),
        )
        .await
        .expect("persist active keys");

        let loaded_id = exec_query(
            &actor_state,
            "SELECT value FROM sys_config WHERE key = 'active_project_id' LIMIT 1",
            vec![],
        )
        .await
        .expect("read active_project_id");
        let loaded_path = exec_query(
            &actor_state,
            "SELECT value FROM sys_config WHERE key = 'active_project_path' LIMIT 1",
            vec![],
        )
        .await
        .expect("read active_project_path");

        assert_eq!(
            loaded_id
                .as_array()
                .and_then(|arr| arr.first())
                .and_then(|row| row.get("value"))
                .and_then(|v| v.as_str()),
            Some(project_id.as_str())
        );
        assert_eq!(
            loaded_path
                .as_array()
                .and_then(|arr| arr.first())
                .and_then(|row| row.get("value"))
                .and_then(|v| v.as_str()),
            Some(project_path.as_str())
        );
    }

    #[tokio::test]
    async fn reopen_flow_restores_active_project_and_design_state() {
        let dir = tempdir().expect("tempdir");
        let pmp_path = dir.path().join("reopen_flow_full.pmp");
        let pmp_path_str = pmp_path.to_string_lossy().to_string();
        let project_id = "reopen_p1".to_string();

        let db = PmpDatabase::open_or_create(pmp_path.clone()).expect("open db");
        db.conn
            .execute(
                "INSERT INTO projects (id, name, title, base_dir_hint) VALUES (?1, ?2, ?3, ?4)",
                rusqlite::params![
                    project_id.clone(),
                    "Reopen Project",
                    "Reopen Project",
                    dir.path().to_string_lossy().to_string()
                ],
            )
            .expect("seed project");

        let (tx, rx) = mpsc::channel(32);
        let _handle = StorageWorker::spawn(rx, db);
        let actor_state = ActorState {
            gateway_tx: tx.clone(),
        };

        persist_active_project_keys(
            &actor_state,
            Some(project_id.clone()),
            Some(pmp_path_str.clone()),
        )
        .await
        .expect("persist active keys");

        let (update_tx, update_rx) = oneshot::channel();
        tx.send(StorageCommand::UpdateProjectState {
            project_id: project_id.clone(),
            state: json!({
                "features": { "f1": { "id": "f1", "layer_id": "l1", "group_id": null, "name": "F1", "geom_type": "Point", "metadata": "{}", "properties": {}, "coordinates": [106.0, 10.0] } },
                "layers": { "l1": { "id": "l1", "region_id": "r1", "name": "L1", "is_visible": true } },
                "regions": { "r1": { "id": "r1", "parent_id": null, "name": "R1", "description": null } },
                "feature_groups": {},
                "settings": {}
            }),
            reply: update_tx,
        })
        .await
        .expect("update state send");
        update_rx.await.expect("update ack").expect("update ok");

        let (save_tx, save_rx) = oneshot::channel();
        tx.send(StorageCommand::SaveProject { reply: save_tx })
            .await
            .expect("save send");
        save_rx.await.expect("save ack").expect("save ok");

        let reopened = PmpDatabase::open_or_create(pmp_path).expect("reopen db");

        let active_id: String = reopened
            .conn
            .query_row(
                "SELECT value FROM sys_config WHERE key = 'active_project_id'",
                [],
                |r| r.get(0),
            )
            .expect("active_project_id");
        let active_path: String = reopened
            .conn
            .query_row(
                "SELECT value FROM sys_config WHERE key = 'active_project_path'",
                [],
                |r| r.get(0),
            )
            .expect("active_project_path");
        let metadata_json: String = reopened
            .conn
            .query_row(
                "SELECT metadata_json FROM projects WHERE id = ?1",
                rusqlite::params![project_id.clone()],
                |r| r.get(0),
            )
            .expect("project metadata");
        let metadata: Value = serde_json::from_str(&metadata_json).expect("metadata parse");

        assert_eq!(active_id, project_id);
        assert_eq!(active_path, pmp_path_str);
        assert!(metadata.get("features").is_some());
        assert!(metadata.get("layers").is_some());
        assert!(metadata.get("regions").is_some());
    }

    #[test]
    fn recent_project_roundtrip_preserves_path_and_description() {
        let value = json!({
            "id": "project-1",
            "name": "Roundtrip Project",
            "path": "C:/workspace/roundtrip.pmp",
            "description": "Roundtrip description",
            "status": "active",
            "created_at": "2026-07-10T00:00:00Z",
            "updated_at": "2026-07-10T00:00:00Z"
        });

        let recent = recent_project_from_value(&value).expect("recent project");
        let serialized = recent_project_to_value(&recent);

        assert_eq!(
            serialized.get("path").and_then(|v| v.as_str()),
            Some("C:/workspace/roundtrip.pmp")
        );
        assert_eq!(
            serialized.get("name").and_then(|v| v.as_str()),
            Some("Roundtrip Project")
        );
        assert_eq!(
            serialized.get("description").and_then(|v| v.as_str()),
            Some("Roundtrip description")
        );
    }

    #[test]
    fn sanitize_recent_projects_filters_missing_and_duplicate_paths() {
        let dir = tempdir().expect("tempdir");
        let existing_path = dir.path().join("existing.pmp");
        std::fs::write(&existing_path, b"pmp").expect("write pmp");
        let existing_path_str = existing_path.to_string_lossy().to_string();

        let sanitized = sanitize_recent_projects(vec![
            StoredRecentProject {
                id: "1".to_string(),
                name: "Existing".to_string(),
                path: existing_path_str.clone(),
                description: None,
                status: "active".to_string(),
                created_at: String::new(),
                updated_at: String::new(),
            },
            StoredRecentProject {
                id: "2".to_string(),
                name: "Duplicate Existing".to_string(),
                path: existing_path_str.clone(),
                description: None,
                status: "active".to_string(),
                created_at: String::new(),
                updated_at: String::new(),
            },
            StoredRecentProject {
                id: "3".to_string(),
                name: "Missing".to_string(),
                path: dir.path().join("missing.pmp").to_string_lossy().to_string(),
                description: None,
                status: "active".to_string(),
                created_at: String::new(),
                updated_at: String::new(),
            },
        ]);

        assert_eq!(sanitized.len(), 1);
        assert_eq!(sanitized[0].path, existing_path_str);
    }

    #[test]
    fn parse_feature_records_builds_point_records_and_fallback_names() {
        let headers = vec![
            "STT".to_string(),
            "Tên".to_string(),
            "Vĩ độ".to_string(),
            "Kinh độ".to_string(),
            "Mô tả".to_string(),
        ];
        let rows = vec![
            vec![
                "1".to_string(),
                "Camera A".to_string(),
                "21.0278".to_string(),
                "105.8342".to_string(),
                "Nút giao chính".to_string(),
            ],
            vec![
                "2".to_string(),
                "".to_string(),
                "10.123".to_string(),
                "106.456".to_string(),
                "".to_string(),
            ],
        ];

        let records = parse_feature_records(
            &headers,
            &rows,
            &ImportMappingPayload {
                name_column: "Tên".to_string(),
                lat_column: "Vĩ độ".to_string(),
                lng_column: "Kinh độ".to_string(),
                description_column: Some("Mô tả".to_string()),
                order_column: Some("STT".to_string()),
            },
        )
        .expect("records");

        assert_eq!(records.len(), 2);
        assert_eq!(records[0].geom_type, "Point");
        assert_eq!(records[0].geometry, [105.8342, 21.0278]);
        assert_eq!(
            records[0].properties.get("name").map(String::as_str),
            Some("Camera A")
        );
        assert_eq!(
            records[0].properties.get("description").map(String::as_str),
            Some("Nút giao chính")
        );
        assert_eq!(
            records[1].properties.get("name").map(String::as_str),
            Some("2")
        );
        assert_eq!(
            records[1]
                .properties
                .get("display_order")
                .map(String::as_str),
            Some("2")
        );
    }

    #[test]
    fn parse_feature_records_skips_invalid_rows_when_valid_rows_exist() {
        let headers = vec!["Tên".to_string(), "Lat".to_string(), "Lng".to_string()];
        let rows = vec![
            vec![
                "Điểm lỗi".to_string(),
                "abc".to_string(),
                "105.1".to_string(),
            ],
            vec![
                "Điểm đúng".to_string(),
                "21.5".to_string(),
                "105.9".to_string(),
            ],
        ];

        let records = parse_feature_records(
            &headers,
            &rows,
            &ImportMappingPayload {
                name_column: "Tên".to_string(),
                lat_column: "Lat".to_string(),
                lng_column: "Lng".to_string(),
                description_column: None,
                order_column: None,
            },
        )
        .expect("records");

        assert_eq!(records.len(), 1);
        assert_eq!(
            records[0].properties.get("name").map(String::as_str),
            Some("Điểm đúng")
        );
        assert_eq!(records[0].geometry, [105.9, 21.5]);
    }

    async fn seed_dashboard_project(actor_state: &ActorState, project_id: &str) {
        let _ = exec_query(
            actor_state,
            "INSERT INTO projects (id, name, title, base_dir_hint) VALUES (?1, ?2, ?3, ?4)",
            vec![
                project_id.to_string(),
                "Analytics Project".to_string(),
                "Analytics Project".to_string(),
                "C:/workspace".to_string(),
            ],
        )
        .await
        .expect("insert project");
    }

    #[tokio::test]
    async fn dashboard_commands_aggregate_project_file_data() {
        let dir = tempdir().expect("tempdir");
        let pmp_path = dir.path().join("analytics_commands.pmp");
        let db = PmpDatabase::open_or_create(pmp_path).expect("open db");
        let (tx, rx) = mpsc::channel(32);
        let _handle = StorageWorker::spawn(rx, db);
        let actor_state = ActorState { gateway_tx: tx };
        let project_id = "analytics-project";

        seed_dashboard_project(&actor_state, project_id).await;

        let _ = exec_query(
            &actor_state,
            "INSERT INTO files (id, project_id, rel_path, filename, extension, file_size, metadata_json) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            vec![
                "f1".to_string(),
                project_id.to_string(),
                "src/main.ts".to_string(),
                "main.ts".to_string(),
                "ts".to_string(),
                "512".to_string(),
                "{}".to_string(),
            ],
        )
        .await
        .expect("insert file 1");
        let _ = exec_query(
            &actor_state,
            "INSERT INTO files (id, project_id, rel_path, filename, extension, file_size, metadata_json) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            vec![
                "f2".to_string(),
                project_id.to_string(),
                "docs/readme.md".to_string(),
                "readme.md".to_string(),
                "md".to_string(),
                "128".to_string(),
                "{}".to_string(),
            ],
        )
        .await
        .expect("insert file 2");
        let _ = exec_query(
            &actor_state,
            "INSERT INTO files (id, project_id, rel_path, filename, extension, file_size, metadata_json) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            vec![
                "f3".to_string(),
                project_id.to_string(),
                "assets/logo".to_string(),
                "logo".to_string(),
                "".to_string(),
                "2048".to_string(),
                "{}".to_string(),
            ],
        )
        .await
        .expect("insert file 3");

        let stats = dashboard_project_stats_for_project(&actor_state, project_id.to_string())
            .await
            .expect("stats");
        let dist = dashboard_extension_dist_for_project(&actor_state, project_id.to_string())
            .await
            .expect("dist");
        let top_files = dashboard_top_files_for_project(&actor_state, project_id.to_string(), 2)
            .await
            .expect("top files");

        assert_eq!(
            stats,
            DashboardProjectStats {
                total_files: 3,
                total_size: 2688
            }
        );
        assert_eq!(
            dist,
            vec![
                DashboardExtensionStat {
                    extension: "md".to_string(),
                    count: 1
                },
                DashboardExtensionStat {
                    extension: "none".to_string(),
                    count: 1
                },
                DashboardExtensionStat {
                    extension: "ts".to_string(),
                    count: 1
                }
            ]
        );
        assert_eq!(
            top_files,
            vec![
                DashboardFileStat {
                    name: "logo".to_string(),
                    size: 2048
                },
                DashboardFileStat {
                    name: "main.ts".to_string(),
                    size: 512
                }
            ]
        );
    }

    #[tokio::test]
    async fn dashboard_commands_return_empty_results_for_project_without_files() {
        let dir = tempdir().expect("tempdir");
        let pmp_path = dir.path().join("analytics_empty.pmp");
        let db = PmpDatabase::open_or_create(pmp_path).expect("open db");
        let (tx, rx) = mpsc::channel(32);
        let _handle = StorageWorker::spawn(rx, db);
        let actor_state = ActorState { gateway_tx: tx };
        let project_id = "analytics-empty";

        seed_dashboard_project(&actor_state, project_id).await;

        let stats = dashboard_project_stats_for_project(&actor_state, project_id.to_string())
            .await
            .expect("stats");
        let dist = dashboard_extension_dist_for_project(&actor_state, project_id.to_string())
            .await
            .expect("dist");
        let top_files = dashboard_top_files_for_project(&actor_state, project_id.to_string(), 10)
            .await
            .expect("top files");

        assert_eq!(
            stats,
            DashboardProjectStats {
                total_files: 0,
                total_size: 0
            }
        );
        assert!(dist.is_empty());
        assert!(top_files.is_empty());
    }
}
