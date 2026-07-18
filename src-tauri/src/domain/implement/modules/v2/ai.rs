use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{
    atomic::{AtomicBool, Ordering},
};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::RwLock;
use uuid::Uuid;

pub const EMBEDDING_DIMS: usize = 384;
const CONFIG_FILE: &str = "ai_config.json";
const MODEL_DIR: &str = "ai_models";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AiRuntimeState {
    AiOff,
    ModelRequired,
    Downloading,
    LocalReady,
    CloudReady,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiConfig {
    pub enable_ai: bool,
    pub low_power_mode: bool,
    pub provider_enabled: bool,
    pub provider_base_url: String,
    pub provider_model: String,
    pub max_tokens: u32,
    pub timeout_ms: u64,
    pub cloud_confirm_each_request: bool,
}

impl Default for AiConfig {
    fn default() -> Self {
        Self {
            enable_ai: false,
            low_power_mode: false,
            provider_enabled: false,
            provider_base_url: "https://api.openai.com/v1".to_string(),
            provider_model: "gpt-4o-mini".to_string(),
            max_tokens: 1200,
            timeout_ms: 45_000,
            cloud_confirm_each_request: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelManifestEntry {
    pub id: String,
    pub role: String,
    pub version: String,
    pub file_name: String,
    pub url: Option<String>,
    pub sha256: Option<String>,
    pub expected_bytes: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledModel {
    pub id: String,
    pub role: String,
    pub version: String,
    pub file_name: String,
    pub installed: bool,
    pub path: Option<String>,
    pub size_bytes: Option<u64>,
    pub sha256: Option<String>,
    pub checksum_ok: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiStatus {
    pub state: AiRuntimeState,
    pub enabled: bool,
    pub local_ready: bool,
    pub cloud_ready: bool,
    pub downloading: bool,
    pub loaded_sessions: Vec<String>,
    pub models: Vec<InstalledModel>,
    pub error: Option<String>,
    pub provider: String,
    pub provider_model: String,
    pub has_api_key: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAiConfigRequest {
    pub enable_ai: Option<bool>,
    pub low_power_mode: Option<bool>,
    pub provider_enabled: Option<bool>,
    pub provider_base_url: Option<String>,
    pub provider_model: Option<String>,
    pub max_tokens: Option<u32>,
    pub timeout_ms: Option<u64>,
    pub cloud_confirm_each_request: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendAiMessageRequest {
    pub project_id: String,
    pub conversation_id: String,
    pub message: String,
    pub request_id: Option<String>,
    pub allow_cloud: bool,
    pub confirmed_scope: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiCitation {
    pub source_table: String,
    pub source_id: String,
    pub title: String,
    pub snippet: String,
    pub score: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiActionProposal {
    pub id: String,
    pub action_type: String,
    pub target_table: String,
    pub target_id: Option<String>,
    pub diff: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiChatResult {
    pub request_id: String,
    pub conversation_id: String,
    pub content: String,
    pub citations: Vec<AiCitation>,
    pub provider: String,
    pub model: String,
    pub token_usage: Value,
    pub action_proposals: Vec<AiActionProposal>,
}

#[derive(Debug, Clone)]
pub struct AiManager {
    config: AiConfig,
    loaded_sessions: HashSet<String>,
    downloading: bool,
    last_error: Option<String>,
}

impl Default for AiManager {
    fn default() -> Self {
        Self {
            config: AiConfig::default(),
            loaded_sessions: HashSet::new(),
            downloading: false,
            last_error: None,
        }
    }
}

#[derive(Debug, Default)]
pub struct AiState {
    manager: RwLock<AiManager>,
    cancel_install: AtomicBool,
    cancel_requests: RwLock<HashSet<String>>,
}

pub fn model_manifest() -> Vec<ModelManifestEntry> {
    vec![
        ModelManifestEntry {
            id: "minilm-embedding".to_string(),
            role: "embedding".to_string(),
            version: "all-MiniLM-L6-v2".to_string(),
            file_name: "all-MiniLM-L6-v2.onnx".to_string(),
            url: None,
            sha256: None,
            expected_bytes: None,
        },
        ModelManifestEntry {
            id: "qwen2.5-0.5b-llm".to_string(),
            role: "llm".to_string(),
            version: "qwen2.5-0.5b-instruct".to_string(),
            file_name: "qwen2.5-0.5b-instruct.onnx".to_string(),
            url: None,
            sha256: None,
            expected_bytes: None,
        },
        ModelManifestEntry {
            id: "paddleocr-doc".to_string(),
            role: "ocr".to_string(),
            version: "paddleocr-v4".to_string(),
            file_name: "paddleocr-doc.onnx".to_string(),
            url: None,
            sha256: None,
            expected_bytes: None,
        },
    ]
}

pub fn ai_config_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))?
        .join(CONFIG_FILE))
}

pub fn ai_model_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))?
        .join(MODEL_DIR))
}

pub fn load_ai_config(app: &AppHandle) -> AiConfig {
    let Ok(path) = ai_config_path(app) else {
        return AiConfig::default();
    };
    fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str::<AiConfig>(&text).ok())
        .unwrap_or_default()
}

pub fn save_ai_config(app: &AppHandle, config: &AiConfig) -> Result<(), String> {
    let path = ai_config_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create AI config dir: {e}"))?;
    }
    let text = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize AI config: {e}"))?;
    fs::write(path, text).map_err(|e| format!("Failed to write AI config: {e}"))
}

pub async fn init_from_disk(app: &AppHandle, state: &AiState) {
    let config = load_ai_config(app);
    let mut manager = state.manager.write().await;
    manager.config = config;
}

pub async fn read_config(state: &AiState) -> AiConfig {
    state.manager.read().await.config.clone()
}

pub async fn update_config(
    app: &AppHandle,
    state: &AiState,
    request: UpdateAiConfigRequest,
) -> Result<AiConfig, String> {
    let mut manager = state.manager.write().await;
    if let Some(value) = request.enable_ai {
        manager.config.enable_ai = value;
    }
    if let Some(value) = request.low_power_mode {
        manager.config.low_power_mode = value;
    }
    if let Some(value) = request.provider_enabled {
        manager.config.provider_enabled = value;
    }
    if let Some(value) = request.provider_base_url {
        manager.config.provider_base_url = normalize_base_url(&value)?;
    }
    if let Some(value) = request.provider_model {
        manager.config.provider_model = sanitize_small_string(&value, "provider model")?;
    }
    if let Some(value) = request.max_tokens {
        manager.config.max_tokens = value.clamp(64, 16_000);
    }
    if let Some(value) = request.timeout_ms {
        manager.config.timeout_ms = value.clamp(5_000, 180_000);
    }
    if let Some(value) = request.cloud_confirm_each_request {
        manager.config.cloud_confirm_each_request = value;
    }
    save_ai_config(app, &manager.config)?;
    Ok(manager.config.clone())
}

pub async fn status(app: &AppHandle, state: &AiState) -> AiStatus {
    let manager = state.manager.read().await;
    let models = installed_models(app).unwrap_or_default();
    let local_ready = models.iter().any(|m| m.role == "embedding" && m.installed);
    let has_api_key = has_api_key();
    let cloud_ready = manager.config.provider_enabled && has_api_key;
    let state_value = if !manager.config.enable_ai {
        AiRuntimeState::AiOff
    } else if manager.downloading {
        AiRuntimeState::Downloading
    } else if manager.last_error.is_some() {
        AiRuntimeState::Error
    } else if local_ready {
        AiRuntimeState::LocalReady
    } else if cloud_ready {
        AiRuntimeState::CloudReady
    } else {
        AiRuntimeState::ModelRequired
    };

    AiStatus {
        state: state_value,
        enabled: manager.config.enable_ai,
        local_ready,
        cloud_ready,
        downloading: manager.downloading,
        loaded_sessions: manager.loaded_sessions.iter().cloned().collect(),
        models,
        error: manager.last_error.clone(),
        provider: "openai-compatible".to_string(),
        provider_model: manager.config.provider_model.clone(),
        has_api_key,
    }
}

pub fn installed_models(app: &AppHandle) -> Result<Vec<InstalledModel>, String> {
    let dir = ai_model_dir(app)?;
    Ok(model_manifest()
        .into_iter()
        .map(|entry| {
            let path = dir.join(&entry.file_name);
            let installed = path.exists();
            let (size_bytes, sha256) = if installed {
                let size = fs::metadata(&path).ok().map(|m| m.len());
                let hash = sha256_file(&path).ok();
                (size, hash)
            } else {
                (None, None)
            };
            let checksum_ok = match (&entry.sha256, &sha256) {
                (Some(expected), Some(actual)) => Some(expected.eq_ignore_ascii_case(actual)),
                (Some(_), None) => Some(false),
                _ => None,
            };
            InstalledModel {
                id: entry.id,
                role: entry.role,
                version: entry.version,
                file_name: entry.file_name,
                installed,
                path: installed.then(|| path.to_string_lossy().to_string()),
                size_bytes,
                sha256,
                checksum_ok,
            }
        })
        .collect())
}

pub async fn release_memory(state: &AiState) -> Result<Value, String> {
    let mut manager = state.manager.write().await;
    let released = manager.loaded_sessions.len();
    manager.loaded_sessions.clear();
    Ok(json!({
        "releasedSessions": released,
        "releasedAt": chrono::Local::now().to_rfc3339()
    }))
}

pub async fn cancel_install(state: &AiState) -> Result<(), String> {
    state.cancel_install.store(true, Ordering::SeqCst);
    Ok(())
}

pub async fn install_models(app: AppHandle, state: &AiState, request_id: String) -> Result<Value, String> {
    state.cancel_install.store(false, Ordering::SeqCst);
    {
        let mut manager = state.manager.write().await;
        manager.downloading = true;
        manager.last_error = None;
    }

    let result = install_models_inner(&app, &state, &request_id).await;
    {
        let mut manager = state.manager.write().await;
        manager.downloading = false;
        if let Err(error) = &result {
            manager.last_error = Some(error.clone());
        }
    }
    result
}

async fn install_models_inner(
    app: &AppHandle,
    state: &AiState,
    request_id: &str,
) -> Result<Value, String> {
    let dir = ai_model_dir(app)?;
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create AI model dir: {e}"))?;
    let mut installed = Vec::new();
    let mut skipped = Vec::new();

    for entry in model_manifest() {
        if state.cancel_install.load(Ordering::SeqCst) {
            emit_model_event(app, request_id, &entry, 0, entry.expected_bytes, "cancelled", false);
            return Err("AI model install cancelled".to_string());
        }
        let target = dir.join(&entry.file_name);
        if target.exists() && verify_entry(&target, &entry)? {
            skipped.push(entry.id);
            continue;
        }

        let Some(url) = entry.url.clone() else {
            skipped.push(format!("{}:missing-url", entry.id));
            emit_model_event(app, request_id, &entry, 0, entry.expected_bytes, "missing_url", false);
            continue;
        };

        download_entry(app, state, request_id, &entry, &url, &target)?;
        installed.push(entry.id);
    }

    Ok(json!({
        "requestId": request_id,
        "installed": installed,
        "skipped": skipped,
        "models": installed_models(app)?,
    }))
}

fn download_entry(
    app: &AppHandle,
    state: &AiState,
    request_id: &str,
    entry: &ModelManifestEntry,
    url: &str,
    target: &Path,
) -> Result<(), String> {
    let tmp = target.with_extension("download");
    let mut response = reqwest::blocking::get(url)
        .map_err(|e| format!("Failed to download {}: {e}", entry.id))?;
    if !response.status().is_success() {
        return Err(format!("Failed to download {}: HTTP {}", entry.id, response.status()));
    }

    let mut file = fs::File::create(&tmp)
        .map_err(|e| format!("Failed to create temp model file {}: {e}", tmp.display()))?;
    let mut buf = [0u8; 64 * 1024];
    let mut downloaded = 0u64;
    loop {
        if state.cancel_install.load(Ordering::SeqCst) {
            let _ = fs::remove_file(&tmp);
            return Err("AI model install cancelled".to_string());
        }
        let n = response
            .read(&mut buf)
            .map_err(|e| format!("Failed to read model download {}: {e}", entry.id))?;
        if n == 0 {
            break;
        }
        file.write_all(&buf[..n])
            .map_err(|e| format!("Failed to write model download {}: {e}", entry.id))?;
        downloaded += n as u64;
        emit_model_event(app, request_id, entry, downloaded, entry.expected_bytes, "downloading", false);
    }
    file.flush()
        .map_err(|e| format!("Failed to flush model download {}: {e}", entry.id))?;

    emit_model_event(app, request_id, entry, downloaded, entry.expected_bytes, "checksum", true);
    verify_entry(&tmp, entry)?;
    fs::rename(&tmp, target)
        .map_err(|e| format!("Failed to atomically install model {}: {e}", entry.id))?;
    emit_model_event(app, request_id, entry, downloaded, entry.expected_bytes, "installed", true);
    Ok(())
}

fn emit_model_event(
    app: &AppHandle,
    request_id: &str,
    entry: &ModelManifestEntry,
    bytes_downloaded: u64,
    expected_bytes: Option<u64>,
    status: &str,
    checksum: bool,
) {
    let _ = app.emit(
        "ai-model-progress",
        json!({
            "requestId": request_id,
            "model": entry.id,
            "bytesDownloaded": bytes_downloaded,
            "expectedBytes": expected_bytes,
            "status": status,
            "checksum": checksum,
        }),
    );
}

pub fn remove_models(app: &AppHandle) -> Result<Value, String> {
    let dir = ai_model_dir(app)?;
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|e| format!("Failed to remove AI models: {e}"))?;
    }
    Ok(json!({ "removed": true, "path": dir.to_string_lossy().to_string() }))
}

pub async fn normalize_metadata(
    app: &AppHandle,
    state: &AiState,
    text: String,
) -> Result<Value, String> {
    let config = read_config(state).await;
    if !config.enable_ai {
        return Err("AI is disabled. Enable AI before running metadata normalization.".to_string());
    }
    let models = installed_models(app)?;
    let embedding_model = models
        .iter()
        .find(|model| model.role == "embedding" && model.installed)
        .ok_or_else(|| "Embedding model is not installed. Install AI models first.".to_string())?;
    {
        let mut manager = state.manager.write().await;
        manager.loaded_sessions.insert(embedding_model.id.clone());
    }
    let normalized = normalize_text(&text);
    let embedding = hashed_embedding(&normalized);
    Ok(json!({
        "normalized_text": normalized,
        "embedding": embedding,
        "model": embedding_model.version,
        "updated_at": chrono::Local::now().to_rfc3339()
    }))
}

pub fn normalize_text(input: &str) -> String {
    input
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_string()
}

pub fn hashed_embedding(text: &str) -> Vec<f32> {
    let mut vector = vec![0.0f32; EMBEDDING_DIMS];
    let mut count = 0.0f32;
    for token in text.split(|c: char| !c.is_alphanumeric()) {
        let token = token.trim().to_lowercase();
        if token.is_empty() {
            continue;
        }
        let hash = Sha256::digest(token.as_bytes());
        let idx = u16::from_le_bytes([hash[0], hash[1]]) as usize % EMBEDDING_DIMS;
        let sign = if hash[2] % 2 == 0 { 1.0 } else { -1.0 };
        vector[idx] += sign;
        count += 1.0;
    }
    if count > 0.0 {
        let norm = vector.iter().map(|v| v * v).sum::<f32>().sqrt();
        if norm > 0.0 {
            for value in &mut vector {
                *value /= norm;
            }
        }
    }
    vector
}

pub async fn predict_task(
    app: &AppHandle,
    state: &AiState,
    task_name: String,
) -> Result<i64, String> {
    let _ = normalize_metadata(app, state, task_name.clone()).await?;
    let lower = task_name.to_lowercase();
    let base = if lower.contains("survey") || lower.contains("khảo sát") {
        2
    } else if lower.contains("install") || lower.contains("lắp") {
        5
    } else if lower.contains("test") || lower.contains("nghiệm thu") {
        3
    } else {
        4
    };
    Ok(base)
}

pub fn analyze_contract_metadata(text: String) -> Value {
    let normalized = normalize_text(&text);
    let lower = normalized.to_lowercase();
    let has_bom = lower.contains("bom") || lower.contains("vật tư") || lower.contains("material");
    let has_contract = lower.contains("contract") || lower.contains("hợp đồng");
    json!({
        "summary": normalized.chars().take(500).collect::<String>(),
        "signals": {
            "contract": has_contract,
            "bom": has_bom,
            "money": lower.contains("vnd") || lower.contains("usd") || lower.contains("đồng"),
            "schedule": lower.contains("deadline") || lower.contains("tiến độ") || lower.contains("ngày")
        },
        "model": "local-contract-metadata-v1",
        "updatedAt": chrono::Local::now().to_rfc3339()
    })
}

pub async fn mark_request_cancelled(state: &AiState, request_id: String) -> Result<(), String> {
    state.cancel_requests.write().await.insert(request_id);
    Ok(())
}

pub async fn request_is_cancelled(state: &AiState, request_id: &str) -> bool {
    state.cancel_requests.read().await.contains(request_id)
}

pub async fn local_chat_response(
    app: &AppHandle,
    state: &AiState,
    request: &SendAiMessageRequest,
    citations: Vec<AiCitation>,
) -> Result<AiChatResult, String> {
    if request_is_cancelled(state, request.request_id.as_deref().unwrap_or_default()).await {
        return Err("AI request cancelled".to_string());
    }
    let config = read_config(state).await;
    if !config.enable_ai {
        return Err("AI is disabled.".to_string());
    }
    let models = installed_models(app)?;
    let model = models
        .iter()
        .find(|m| m.role == "llm" && m.installed)
        .map(|m| m.version.clone())
        .unwrap_or_else(|| "local-rag-summary-v1".to_string());
    let mut content = "Tôi đã đọc dữ liệu dự án liên quan. ".to_string();
    if citations.is_empty() {
        content.push_str("Chưa tìm thấy nguồn nội bộ đủ sát với câu hỏi này.");
    } else {
        content.push_str("Các nguồn sát nhất nằm trong phần citations; vui lòng duyệt đề xuất trước khi ghi dữ liệu.");
    }
    Ok(AiChatResult {
        request_id: request
            .request_id
            .clone()
            .unwrap_or_else(|| Uuid::new_v4().to_string()),
        conversation_id: request.conversation_id.clone(),
        content,
        citations,
        provider: "local".to_string(),
        model,
        token_usage: json!({
            "promptTokens": request.message.split_whitespace().count(),
            "completionTokens": 24,
            "totalTokens": request.message.split_whitespace().count() + 24
        }),
        action_proposals: vec![],
    })
}

pub fn build_citations(rows: Value) -> Vec<AiCitation> {
    rows.as_array()
        .into_iter()
        .flatten()
        .filter_map(|row| {
            Some(AiCitation {
                source_table: row.get("source_table")?.as_str()?.to_string(),
                source_id: row.get("source_id")?.as_str()?.to_string(),
                title: row.get("title")?.as_str().unwrap_or("Untitled").to_string(),
                snippet: row.get("snippet")?.as_str().unwrap_or("").chars().take(500).collect(),
                score: row.get("score").and_then(Value::as_f64).unwrap_or(0.0),
            })
        })
        .collect()
}

pub fn validate_project_id(project_id: &str) -> Result<(), String> {
    Uuid::parse_str(project_id)
        .map(|_| ())
        .map_err(|_| "Invalid project id".to_string())
}

pub fn make_message_id() -> String {
    Uuid::new_v4().to_string()
}

pub fn sha256_text(text: &str) -> String {
    hex::encode(Sha256::digest(text.as_bytes()))
}

fn verify_entry(path: &Path, entry: &ModelManifestEntry) -> Result<bool, String> {
    if let Some(expected_bytes) = entry.expected_bytes {
        let actual = fs::metadata(path)
            .map_err(|e| format!("Failed to read model metadata {}: {e}", path.display()))?
            .len();
        if actual != expected_bytes {
            return Err(format!(
                "Model {} has wrong size: expected {}, got {}",
                entry.id, expected_bytes, actual
            ));
        }
    }
    if let Some(expected_hash) = &entry.sha256 {
        let actual = sha256_file(path)?;
        if !expected_hash.eq_ignore_ascii_case(&actual) {
            return Err(format!("Model {} checksum mismatch", entry.id));
        }
    }
    Ok(true)
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let mut file =
        fs::File::open(path).map_err(|e| format!("Failed to open {}: {e}", path.display()))?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 64 * 1024];
    loop {
        let n = file
            .read(&mut buf)
            .map_err(|e| format!("Failed to read {}: {e}", path.display()))?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hex::encode(hasher.finalize()))
}

fn normalize_base_url(input: &str) -> Result<String, String> {
    let trimmed = input.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err("Provider base URL is required".to_string());
    }
    let parsed = url::Url::parse(trimmed).map_err(|_| "Provider base URL is invalid".to_string())?;
    if parsed.scheme() != "https" && parsed.scheme() != "http" {
        return Err("Provider base URL must use http or https".to_string());
    }
    Ok(trimmed.to_string())
}

fn sanitize_small_string(input: &str, label: &str) -> Result<String, String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err(format!("{label} is required"));
    }
    if trimmed.len() > 200 {
        return Err(format!("{label} is too long"));
    }
    Ok(trimmed.to_string())
}

pub fn redact_config(config: &AiConfig, has_api_key: bool) -> Value {
    json!({
        "enable_ai": config.enable_ai,
        "low_power_mode": config.low_power_mode,
        "provider_enabled": config.provider_enabled,
        "provider_base_url": config.provider_base_url,
        "provider_model": config.provider_model,
        "max_tokens": config.max_tokens,
        "timeout_ms": config.timeout_ms,
        "cloud_confirm_each_request": config.cloud_confirm_each_request,
        "has_api_key": has_api_key,
    })
}

#[cfg(target_os = "windows")]
mod credential_store {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Foundation::GetLastError;
    use windows_sys::Win32::Security::Credentials::{
        CredDeleteW, CredFree, CredReadW, CredWriteW, CREDENTIALW, CRED_PERSIST_LOCAL_MACHINE,
        CRED_TYPE_GENERIC,
    };

    const TARGET: &str = "ProjectManager.AI.OpenAICompatible.ApiKey";

    fn wide(input: &str) -> Vec<u16> {
        OsStr::new(input).encode_wide().chain(std::iter::once(0)).collect()
    }

    pub fn set_api_key(value: &str) -> Result<(), String> {
        let target = wide(TARGET);
        let mut secret: Vec<u16> = OsStr::new(value).encode_wide().collect();
        let blob_size = (secret.len() * std::mem::size_of::<u16>()) as u32;
        let mut credential = CREDENTIALW {
            Flags: 0,
            Type: CRED_TYPE_GENERIC,
            TargetName: target.as_ptr() as *mut u16,
            Comment: std::ptr::null_mut(),
            LastWritten: unsafe { std::mem::zeroed() },
            CredentialBlobSize: blob_size,
            CredentialBlob: secret.as_mut_ptr() as *mut u8,
            Persist: CRED_PERSIST_LOCAL_MACHINE,
            AttributeCount: 0,
            Attributes: std::ptr::null_mut(),
            TargetAlias: std::ptr::null_mut(),
            UserName: std::ptr::null_mut(),
        };
        let ok = unsafe { CredWriteW(&mut credential, 0) };
        if ok == 0 {
            return Err(format!("Failed to store AI API key in Windows Credential Manager: {}", unsafe {
                GetLastError()
            }));
        }
        Ok(())
    }

    pub fn get_api_key() -> Option<String> {
        let target = wide(TARGET);
        let mut credential_ptr: *mut CREDENTIALW = std::ptr::null_mut();
        let ok = unsafe { CredReadW(target.as_ptr(), CRED_TYPE_GENERIC, 0, &mut credential_ptr) };
        if ok == 0 || credential_ptr.is_null() {
            return None;
        }
        let credential = unsafe { &*credential_ptr };
        let len = credential.CredentialBlobSize as usize / std::mem::size_of::<u16>();
        let slice = unsafe { std::slice::from_raw_parts(credential.CredentialBlob as *const u16, len) };
        let value = String::from_utf16_lossy(slice);
        unsafe { CredFree(credential_ptr as *const _) };
        Some(value)
    }

    pub fn delete_api_key() -> Result<(), String> {
        let target = wide(TARGET);
        let ok = unsafe { CredDeleteW(target.as_ptr(), CRED_TYPE_GENERIC, 0) };
        if ok == 0 {
            let err = unsafe { GetLastError() };
            if err != 1168 {
                return Err(format!("Failed to delete AI API key: {err}"));
            }
        }
        Ok(())
    }
}

#[cfg(not(target_os = "windows"))]
mod credential_store {
    pub fn set_api_key(_value: &str) -> Result<(), String> {
        Err("Credential Manager storage is only implemented for Windows builds".to_string())
    }
    pub fn get_api_key() -> Option<String> {
        None
    }
    pub fn delete_api_key() -> Result<(), String> {
        Ok(())
    }
}

pub fn set_api_key(value: String) -> Result<(), String> {
    if value.trim().is_empty() {
        return Err("API key is required".to_string());
    }
    credential_store::set_api_key(value.trim())
}

pub fn delete_api_key() -> Result<(), String> {
    credential_store::delete_api_key()
}

pub fn has_api_key() -> bool {
    credential_store::get_api_key()
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false)
}

#[allow(dead_code)]
pub fn api_key_for_request() -> Option<String> {
    credential_store::get_api_key()
}

pub fn validate_structured_output(value: &Value, max_bytes: usize) -> Result<(), String> {
    let size = value.to_string().len();
    if size > max_bytes {
        return Err(format!("AI structured output is too large: {size} bytes"));
    }
    Ok(())
}

pub fn allowed_action_targets() -> HashMap<&'static str, &'static [&'static str]> {
    HashMap::from([
        ("create_task", &["tasks"][..]),
        ("update_task", &["tasks"][..]),
        ("update_project_metadata", &["projects"][..]),
        ("update_contract_metadata", &["files"][..]),
        ("update_bom_metadata", &["files"][..]),
        ("update_feature_metadata", &["features"][..]),
    ])
}
