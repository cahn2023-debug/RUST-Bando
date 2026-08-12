#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    env, fs,
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    path::{Path, PathBuf},
    sync::Mutex,
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{Emitter, Manager, State};

const DEFAULT_HTTP_PORT: u16 = 38_741;
const MAX_HTTP_BODY_BYTES: usize = 4 * 1024 * 1024;
const GOOGLE_TILE_HOST: &str = "mt1.google.com";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PreviewLaunchConfig {
    package_root: Option<String>,
    source: String,
    config_origin: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FileLaunchConfig {
    package_root: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BasemapLayerVisibility {
    landcover: bool,
    water: bool,
    boundaries: bool,
    roads: bool,
    labels: bool,
    pois: bool,
    buildings: bool,
    terrain: bool,
}

impl Default for BasemapLayerVisibility {
    fn default() -> Self {
        Self {
            landcover: true,
            water: true,
            boundaries: true,
            roads: true,
            labels: true,
            pois: true,
            buildings: true,
            terrain: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LayerVisibilityState {
    google_street: BasemapLayerVisibility,
    google_hybrid: BasemapLayerVisibility,
    local_package: BasemapLayerVisibility,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PreviewUserConfig {
    layer: String,
    package_root: Option<String>,
    download_url: String,
    download_directory: Option<String>,
    watcher_folder: Option<String>,
    http_port: u16,
    auto_zoom: bool,
    #[serde(default)]
    layer_visibility: Option<LayerVisibilityState>,
    #[serde(default)]
    sub_layers: Option<Value>,
}

impl Default for PreviewUserConfig {
    fn default() -> Self {
        Self {
            layer: "google-street".to_string(),
            package_root: None,
            download_url: String::new(),
            download_directory: None,
            watcher_folder: None,
            http_port: 38741,
            auto_zoom: true,
            layer_visibility: None,
            sub_layers: None,
        }
    }
}

struct AppState {
    launch: Mutex<PreviewLaunchConfig>,
    user: Mutex<Option<PreviewUserConfig>>,
    pending_package_root: Mutex<Option<PathBuf>>,
    integration_error: Mutex<Option<String>>,
    http_port: Mutex<u16>,
    user_config_path: PathBuf,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PreviewIntegrationStatus {
    http_port: u16,
    error: Option<String>,
}

#[tauri::command]
fn get_preview_launch_config(state: State<'_, AppState>) -> Result<PreviewLaunchConfig, String> {
    state
        .launch
        .lock()
        .map(|config| config.clone())
        .map_err(|_| "Không đọc được cấu hình khởi chạy preview".to_string())
}

#[tauri::command]
fn get_preview_user_config(
    state: State<'_, AppState>,
) -> Result<Option<PreviewUserConfig>, String> {
    state
        .user
        .lock()
        .map(|config| config.clone())
        .map_err(|_| "Không đọc được cấu hình người dùng preview".to_string())
}

#[tauri::command]
fn save_preview_user_config(
    config: PreviewUserConfig,
    state: State<'_, AppState>,
) -> Result<(), String> {
    validate_user_config(&config)?;
    let content = serde_json::to_string_pretty(&config).map_err(|error| error.to_string())?;
    if let Some(parent) = state
        .user_config_path
        .parent()
        .filter(|path| !path.as_os_str().is_empty())
    {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Không tạo được thư mục cấu hình preview: {error}"))?;
    }
    fs::write(&state.user_config_path, content)
        .map_err(|error| format!("Không lưu được cấu hình preview: {error}"))?;
    *state
        .user
        .lock()
        .map_err(|_| "Không cập nhật được cấu hình preview".to_string())? = Some(config);
    Ok(())
}

#[tauri::command]
fn submit_preview_extent_payload(payload: Value, app: tauri::AppHandle) -> Result<(), String> {
    validate_transport_payload(&payload)?;
    app.emit("preview_extent_payload", payload)
        .map_err(|error| format!("Không phát sự kiện extent IPC: {error}"))
}

#[tauri::command]
fn get_preview_integration_status(
    state: State<'_, AppState>,
) -> Result<PreviewIntegrationStatus, String> {
    let configured_port = state
        .user
        .lock()
        .map_err(|_| "Không đọc được cấu hình HTTP preview".to_string())?
        .as_ref()
        .map(|config| config.http_port)
        .unwrap_or(DEFAULT_HTTP_PORT);
    let port = state
        .http_port
        .lock()
        .map_err(|_| "Không đọc được trạng thái HTTP preview".to_string())?
        .to_owned();
    let port = if port == 0 { configured_port } else { port };
    let error = state
        .integration_error
        .lock()
        .map_err(|_| "Không đọc được trạng thái tích hợp preview".to_string())?
        .clone();
    Ok(PreviewIntegrationStatus {
        http_port: port,
        error,
    })
}

#[tauri::command]
fn prepare_preview_package_directory(
    directory: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let base = PathBuf::from(directory.trim())
        .canonicalize()
        .map_err(|_| "Thư mục lưu package không tồn tại".to_string())?;
    if !base.is_dir() {
        return Err("Thư mục lưu package không tồn tại".to_string());
    }
    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_millis();
    let target = base.join(format!("vietnam-basemap-{suffix}"));
    fs::create_dir_all(&target)
        .map_err(|error| format!("Không tạo được thư mục package: {error}"))?;
    *state
        .pending_package_root
        .lock()
        .map_err(|_| "Không cập nhật được package đang tải".to_string())? = Some(target.clone());
    Ok(target.to_string_lossy().into_owned())
}

#[tauri::command]
fn register_preview_package_root(
    package_root: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let root = PathBuf::from(package_root.trim())
        .canonicalize()
        .map_err(|_| "Local package root không tồn tại".to_string())?;
    if !root.is_dir() {
        return Err("Local package root không phải thư mục".to_string());
    }
    *state
        .pending_package_root
        .lock()
        .map_err(|_| "Không cập nhật được local package root".to_string())? = Some(root.clone());
    Ok(root.to_string_lossy().into_owned())
}

#[tauri::command]
fn write_preview_package_entry(
    package_root: String,
    entry_path: String,
    bytes: Vec<u8>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    if !is_safe_package_path(&entry_path) {
        return Err(format!("Package entry không an toàn: {entry_path}"));
    }
    let root = PathBuf::from(package_root)
        .canonicalize()
        .map_err(|_| "Package root không tồn tại".to_string())?;
    if state
        .pending_package_root
        .lock()
        .map_err(|_| "Không đọc được package đang tải".to_string())?
        .as_ref()
        != Some(&root)
    {
        return Err("Package root không nằm trong phiên tải hiện tại".to_string());
    }
    if !root.is_dir() {
        return Err("Package root không tồn tại".to_string());
    }
    let candidate = root.join(&entry_path);
    let parent = candidate
        .parent()
        .ok_or_else(|| "Package entry không có thư mục cha".to_string())?;
    if !parent.starts_with(&root) {
        return Err("Package entry nằm ngoài package root".to_string());
    }
    if !parent.exists() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Không tạo được thư mục package: {error}"))?;
    }
    let canonical_parent = parent
        .canonicalize()
        .map_err(|_| "Không xác thực được thư mục package entry".to_string())?;
    if !canonical_parent.starts_with(&root) {
        return Err("Package entry nằm ngoài package root".to_string());
    }
    let file_name = candidate
        .file_name()
        .ok_or_else(|| "Package entry không có tên file".to_string())?;
    fs::write(canonical_parent.join(file_name), bytes)
        .map_err(|error| format!("Không ghi được package entry: {error}"))
}

#[tauri::command]
fn read_preview_package_file(
    package_path: String,
    package_root: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<u8>, String> {
    if !is_safe_package_path(&package_path) {
        return Err(format!("Package path không an toàn: {package_path}"));
    }
    let root = resolve_package_root(package_root, &state)?;
    let candidate = root.join(&package_path);
    let canonical = candidate
        .canonicalize()
        .map_err(|_| format!("Không đọc được package asset: {package_path}"))?;
    if !canonical.starts_with(&root) || !canonical.is_file() {
        return Err(format!(
            "Package asset nằm ngoài package root: {package_path}"
        ));
    }
    fs::read(canonical).map_err(|error| format!("Không đọc được package asset: {error}"))
}

#[tauri::command]
fn read_preview_package_range(
    package_path: String,
    package_root: Option<String>,
    offset: u64,
    length: usize,
    state: State<'_, AppState>,
) -> Result<Vec<u8>, String> {
    if !is_safe_package_path(&package_path) {
        return Err(format!("Package path không an toàn: {package_path}"));
    }
    let root = resolve_package_root(package_root, &state)?;
    let candidate = root.join(&package_path);
    let canonical = candidate
        .canonicalize()
        .map_err(|_| format!("Không đọc được package asset: {package_path}"))?;
    if !canonical.starts_with(&root) || !canonical.is_file() {
        return Err(format!(
            "Package asset nằm ngoài package root: {package_path}"
        ));
    }
    let mut file = fs::File::open(canonical).map_err(|error| error.to_string())?;
    use std::io::{Read, Seek, SeekFrom};
    file.seek(SeekFrom::Start(offset))
        .map_err(|error| error.to_string())?;
    let mut bytes = vec![0; length];
    file.read_exact(&mut bytes)
        .map_err(|error| error.to_string())?;
    Ok(bytes)
}

fn main() {
    let config = parse_launch_config();
    let user_config_path = runtime_user_config_path();
    let user_config =
        read_user_config(&user_config_path).or_else(|| read_user_config(&launch_config_path()));

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            launch: Mutex::new(config),
            user: Mutex::new(user_config),
            pending_package_root: Mutex::new(None),
            integration_error: Mutex::new(None),
            http_port: Mutex::new(0),
            user_config_path,
        })
        .invoke_handler(tauri::generate_handler![
            get_preview_launch_config,
            get_preview_user_config,
            save_preview_user_config,
            submit_preview_extent_payload,
            get_preview_integration_status,
            prepare_preview_package_directory,
            register_preview_package_root,
            write_preview_package_entry,
            read_preview_package_file,
            read_preview_package_range
        ])
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                window.set_title("Vietnam Basemap Preview")?;
            }
            let state = app.state::<AppState>();
            start_preview_integrations(app.handle().clone(), &state);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Không thể khởi chạy Vietnam Basemap Preview");
}

fn parse_launch_config() -> PreviewLaunchConfig {
    let args: Vec<String> = env::args().skip(1).collect();
    let env_package = env::var("VIETNAM_BASEMAP_PACKAGE").ok();
    let file_config = read_file_config();
    parse_launch_args(&args, env_package.as_deref(), file_config.as_ref())
}

fn parse_launch_args(
    args: &[String],
    env_package: Option<&str>,
    file_config: Option<&FileLaunchConfig>,
) -> PreviewLaunchConfig {
    let mut package_root = None;
    let mut config_origin = "mặc định".to_string();

    let mut index = 0;
    while index < args.len() {
        let argument = &args[index];
        if let Some(value) = argument.strip_prefix("--package=") {
            package_root = normalize_package_root(value);
            config_origin = "command line".to_string();
        } else if argument == "--package" {
            if let Some(value) = args.get(index + 1) {
                package_root = normalize_package_root(value);
                config_origin = "command line".to_string();
                index += 1;
            }
        }
        index += 1;
    }

    if package_root.is_none() {
        if let Some(value) = env_package {
            package_root = normalize_package_root(value);
            if package_root.is_some() {
                config_origin = "VIETNAM_BASEMAP_PACKAGE".to_string();
            }
        }
    }

    if package_root.is_none() {
        if let Some(config) = file_config {
            if let Some(value) = config.package_root.as_deref() {
                package_root = normalize_package_root(value);
                if package_root.is_some() {
                    config_origin = "basemap-preview.config.json".to_string();
                }
            }
        }
    }

    PreviewLaunchConfig {
        source: if package_root.is_some() {
            "offline"
        } else {
            "online"
        }
        .to_string(),
        package_root,
        config_origin,
    }
}

fn read_file_config() -> Option<FileLaunchConfig> {
    let path = launch_config_path();
    serde_json::from_str(&fs::read_to_string(path).ok()?).ok()
}

fn launch_config_path() -> PathBuf {
    env::var_os("VIETNAM_BASEMAP_CONFIG")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("basemap-preview.config.json"))
}

fn runtime_user_config_path() -> PathBuf {
    if let Some(path) = env::var_os("VIETNAM_BASEMAP_USER_CONFIG") {
        return PathBuf::from(path);
    }

    env::var_os("LOCALAPPDATA")
        .or_else(|| env::var_os("APPDATA"))
        .map(PathBuf::from)
        .map(|directory| {
            directory
                .join("Vietnam Basemap Preview")
                .join("basemap-preview.config.json")
        })
        .unwrap_or_else(|| PathBuf::from("basemap-preview.user.config.json"))
}

fn read_user_config(path: &Path) -> Option<PreviewUserConfig> {
    fs::read_to_string(path)
        .ok()
        .and_then(|content| serde_json::from_str(&content).ok())
}

fn resolve_package_root(package_root: Option<String>, state: &AppState) -> Result<PathBuf, String> {
    let requested = package_root.map(PathBuf::from);
    let mut allowed = Vec::new();
    if let Ok(config) = state.launch.lock() {
        if let Some(root) = config
            .package_root
            .as_deref()
            .and_then(|path| PathBuf::from(path).canonicalize().ok())
        {
            allowed.push(root);
        }
    }
    if let Ok(config) = state.user.lock() {
        if let Some(root) = config
            .as_ref()
            .and_then(|value| value.package_root.as_deref())
            .and_then(|path| PathBuf::from(path).canonicalize().ok())
        {
            if !allowed.contains(&root) {
                allowed.push(root);
            }
        }
    }
    if let Some(root) = state
        .pending_package_root
        .lock()
        .ok()
        .and_then(|value| value.clone())
    {
        if !allowed.contains(&root) {
            allowed.push(root);
        }
    }
    if let Some(path) = requested {
        let root = path
            .canonicalize()
            .map_err(|_| "Local package root không tồn tại".to_string())?;
        if allowed.contains(&root) {
            return Ok(root);
        }
        return Err("Local package root chưa được cấu hình bởi người dùng".to_string());
    }
    allowed
        .into_iter()
        .next()
        .ok_or_else(|| "Chưa cấu hình local package".to_string())
}

fn validate_user_config(config: &PreviewUserConfig) -> Result<(), String> {
    if !matches!(
        config.layer.as_str(),
        "google-street" | "google-hybrid" | "local-package"
    ) {
        return Err("Layer preview không hợp lệ".to_string());
    }
    if config.http_port == 0 {
        return Err("HTTP port phải lớn hơn 0".to_string());
    }
    Ok(())
}

fn start_preview_integrations(app: tauri::AppHandle, state: &AppState) {
    let config = state.user.lock().ok().and_then(|value| value.clone());
    let configured_port = config
        .as_ref()
        .map(|value| value.http_port)
        .unwrap_or(DEFAULT_HTTP_PORT);

    let listener = match TcpListener::bind(("127.0.0.1", configured_port)) {
        Ok(listener) => listener,
        Err(bind_error) => match TcpListener::bind(("127.0.0.1", 0)) {
            Ok(listener) => listener,
            Err(fallback_error) => {
                let message = format!(
                    "Không bind được HTTP API localhost:{configured_port}: {bind_error};                      không bind được port dự phòng: {fallback_error}"
                );
                set_integration_error(&app, message.clone());
                let _ = app.emit(
                    "preview_extent_error",
                    json!({ "source": "http", "message": message }),
                );
                return;
            }
        },
    };

    let actual_port = listener
        .local_addr()
        .map(|address| address.port())
        .unwrap_or(configured_port);
    if let Ok(mut port) = state.http_port.lock() {
        *port = actual_port;
    }

    let http_app = app.clone();
    thread::spawn(move || run_http_server(http_app, listener));

    if let Some(folder) = config.and_then(|value| value.watcher_folder) {
        thread::spawn(move || run_folder_watcher(app, PathBuf::from(folder)));
    }
}

fn run_http_server(app: tauri::AppHandle, listener: TcpListener) {
    let client = match reqwest::blocking::Client::builder()
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(15))
        .pool_max_idle_per_host(32)
        .build()
    {
        Ok(client) => client,
        Err(error) => {
            let message = format!("Không khởi tạo được Google tile client: {error}");
            set_integration_error(&app, message.clone());
            let _ = app.emit(
                "preview_extent_error",
                json!({ "source": "http", "message": message }),
            );
            return;
        }
    };

    for stream in listener.incoming() {
        match stream {
            Ok(stream) => {
                let http_app = app.clone();
                let http_client = client.clone();
                thread::spawn(move || handle_http_connection(&http_app, stream, &http_client));
            }
            Err(error) => {
                set_integration_error(&app, format!("Lỗi nhận kết nối HTTP localhost: {error}"));
                let _ = app.emit(
                    "preview_extent_error",
                    json!({
                        "source": "http",
                        "message": format!("Lỗi nhận kết nối HTTP localhost: {error}"),
                    }),
                );
            }
        }
    }
}

fn handle_http_connection(
    app: &tauri::AppHandle,
    mut stream: TcpStream,
    client: &reqwest::blocking::Client,
) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(3)));
    let mut buffer = Vec::new();
    let mut chunk = [0_u8; 8192];
    let header_end = loop {
        match stream.read(&mut chunk) {
            Ok(0) => break None,
            Ok(read) => {
                buffer.extend_from_slice(&chunk[..read]);
                if buffer.len() > MAX_HTTP_BODY_BYTES {
                    break None;
                }
                if let Some(index) = find_header_end(&buffer) {
                    break Some(index);
                }
            }
            Err(_) => break None,
        }
    };
    let Some(header_end) = header_end else {
        write_http_response(&mut stream, 400, "Payload HTTP không hợp lệ");
        return;
    };
    let headers = String::from_utf8_lossy(&buffer[..header_end]).into_owned();
    let content_length = headers
        .lines()
        .find_map(|line| {
            line.strip_prefix("Content-Length:")
                .or_else(|| line.strip_prefix("content-length:"))
        })
        .and_then(|value| value.trim().parse::<usize>().ok())
        .unwrap_or(0);
    if content_length > MAX_HTTP_BODY_BYTES {
        write_http_response(&mut stream, 413, "Payload quá lớn");
        return;
    }
    let body_start = header_end + 4;
    while buffer.len() < body_start + content_length {
        match stream.read(&mut chunk) {
            Ok(0) => break,
            Ok(read) => buffer.extend_from_slice(&chunk[..read]),
            Err(_) => break,
        }
    }
    let request_line = headers.lines().next().unwrap_or_default();
    if request_line.starts_with("GET /api/v1/google-tile?") {
        handle_google_tile_request(&mut stream, request_line, client);
        return;
    }
    if !request_line.starts_with("POST /api/v1/extent") {
        write_http_response(&mut stream, 404, "Endpoint không tồn tại");
        return;
    }
    let body = buffer
        .get(body_start..body_start.saturating_add(content_length))
        .unwrap_or_default();
    let payload = match serde_json::from_slice::<Value>(body) {
        Ok(payload) => payload,
        Err(error) => {
            write_http_response(&mut stream, 400, &format!("JSON parse error: {error}"));
            return;
        }
    };
    if let Err(error) = validate_transport_payload(&payload) {
        write_http_response(
            &mut stream,
            400,
            &format!("Payload validation error: {error}"),
        );
        return;
    }
    match app.emit("preview_extent_payload", payload) {
        Ok(()) => write_http_response(&mut stream, 202, "Accepted"),
        Err(error) => write_http_response(&mut stream, 500, &format!("Emit error: {error}")),
    }
}

fn handle_google_tile_request(
    stream: &mut TcpStream,
    request_line: &str,
    client: &reqwest::blocking::Client,
) {
    let Some(query) = request_line
        .strip_prefix("GET /api/v1/google-tile?")
        .and_then(|value| value.split_whitespace().next())
    else {
        write_http_response(stream, 400, "Google tile query không hợp lệ");
        return;
    };
    let Some((layer, x, y, z, apistyle)) = parse_google_tile_query(query) else {
        write_http_response(stream, 400, "Google tile query không hợp lệ");
        return;
    };

    let upstream =
        format!("https://{GOOGLE_TILE_HOST}/vt/lyrs={layer}&x={x}&y={y}&z={z}{apistyle}");
    let response = match client
        .get(upstream)
        .header("User-Agent", "Vietnam-Basemap-Preview/0.1")
        .send()
    {
        Ok(response) => response,
        Err(error) => {
            write_http_response(stream, 502, &format!("Google tile proxy error: {error}"));
            return;
        }
    };
    if !response.status().is_success() {
        write_http_response(
            stream,
            502,
            &format!("Google tile upstream returned {}", response.status()),
        );
        return;
    }
    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|value| value.to_str().ok())
        .unwrap_or("image/png")
        .to_string();
    match response.bytes() {
        Ok(bytes) => write_binary_http_response(stream, 200, &content_type, &bytes),
        Err(error) => write_http_response(stream, 502, &format!("Google tile read error: {error}")),
    }
}

fn parse_google_tile_query(query: &str) -> Option<(&str, u32, u32, u8, String)> {
    let mut layer = None;
    let mut x = None;
    let mut y = None;
    let mut z = None;
    let mut apistyle = String::new();
    for item in query.split('&') {
        let (key, value) = item.split_once('=')?;
        match key {
            "lyrs" => layer = Some(value),
            "x" => x = value.parse::<u32>().ok(),
            "y" => y = value.parse::<u32>().ok(),
            "z" => z = value.parse::<u8>().ok(),
            "apistyle" if value.len() <= 512 && value.bytes().all(is_safe_apistyle_byte) => {
                apistyle = format!("&apistyle={value}");
            }
            _ => return None,
        }
    }
    let layer = layer?;
    let x = x?;
    let y = y?;
    let z = z?;
    if !matches!(layer, "m" | "s" | "h" | "y") || z > 22 {
        return None;
    }
    let tile_count = 1_u32.checked_shl(z as u32)?;
    if x >= tile_count || y >= tile_count {
        return None;
    }
    Some((layer, x, y, z, apistyle))
}

fn is_safe_apistyle_byte(byte: u8) -> bool {
    byte.is_ascii_alphanumeric()
        || matches!(byte, b'%' | b'|' | b':' | b',' | b'.' | b'+' | b'-' | b'_')
}

fn find_header_end(buffer: &[u8]) -> Option<usize> {
    buffer.windows(4).position(|window| window == b"\r\n\r\n")
}

fn write_http_response(stream: &mut TcpStream, status: u16, body: &str) {
    let response = format!(
        "HTTP/1.1 {status} OK\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let _ = stream.write_all(response.as_bytes());
}

fn write_binary_http_response(
    stream: &mut TcpStream,
    status: u16,
    content_type: &str,
    body: &[u8],
) {
    let header = format!(
        "HTTP/1.1 {status} OK\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nCache-Control: public, max-age=3600\r\nConnection: close\r\n\r\n",
        body.len()
    );
    let _ = stream.write_all(header.as_bytes());
    let _ = stream.write_all(body);
}

fn validate_transport_payload(payload: &Value) -> Result<(), String> {
    let object = payload
        .as_object()
        .ok_or_else(|| "Payload phải là JSON object".to_string())?;
    let has_id = object
        .get("objectId")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .is_some()
        || object
            .get("id")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .is_some();
    if !has_id {
        return Err("Payload thiếu objectId".to_string());
    }
    if !object.contains_key("geometry")
        && !object.contains_key("data")
        && !object.contains_key("feature")
    {
        return Err("Payload thiếu geometry/data/feature".to_string());
    }
    let geometry = object
        .get("geometry")
        .or_else(|| object.get("data"))
        .or_else(|| object.get("feature"));
    if geometry.is_some_and(Value::is_null) {
        return Err("Payload geometry/data/feature không được null".to_string());
    }
    if geometry.is_some_and(|value| !value.is_object() && !value.is_array()) {
        return Err("Payload geometry/data/feature phải là object hoặc array".to_string());
    }
    if geometry.is_none_or(|value| !has_geometry(value)) {
        return Err("Payload geometry/data/feature không có coordinate hợp lệ".to_string());
    }
    Ok(())
}

fn has_geometry(value: &Value) -> bool {
    match value {
        Value::Array(values) => has_coordinate_tree(values),
        Value::Object(object) => {
            if let Some(coordinates) = object.get("coordinates").and_then(Value::as_array) {
                return has_coordinate_tree(coordinates);
            }
            if let Some(geometry) = object.get("geometry") {
                return has_geometry(geometry);
            }
            if let Some(features) = object.get("features").and_then(Value::as_array) {
                return features.iter().any(has_geometry);
            }
            false
        }
        _ => false,
    }
}

fn has_coordinate_tree(values: &[Value]) -> bool {
    if values.len() >= 2 && values[0].as_f64().is_some() && values[1].as_f64().is_some() {
        return true;
    }
    values.iter().any(|value| {
        value
            .as_array()
            .is_some_and(|nested| has_coordinate_tree(nested))
    })
}

fn set_integration_error(app: &tauri::AppHandle, message: String) {
    if let Some(state) = app.try_state::<AppState>() {
        if let Ok(mut error) = state.integration_error.lock() {
            *error = Some(message);
        }
    }
}

fn run_folder_watcher(app: tauri::AppHandle, folder: PathBuf) {
    let mut seen: HashMap<PathBuf, SystemTime> = HashMap::new();
    loop {
        let entries = match fs::read_dir(&folder) {
            Ok(entries) => entries,
            Err(error) => {
                let _ = app.emit("preview_extent_error", json!({ "source": "file", "message": format!("Không đọc được thư mục watcher: {error}") }));
                thread::sleep(Duration::from_secs(2));
                continue;
            }
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let extension = path
                .extension()
                .and_then(|value| value.to_str())
                .unwrap_or_default()
                .to_ascii_lowercase();
            if !matches!(extension.as_str(), "json" | "geojson") {
                continue;
            }
            let modified = entry
                .metadata()
                .and_then(|metadata| metadata.modified())
                .unwrap_or(UNIX_EPOCH);
            if seen.get(&path) == Some(&modified) {
                continue;
            }
            seen.insert(path.clone(), modified);
            match fs::read_to_string(&path)
                .ok()
                .and_then(|content| serde_json::from_str::<Value>(&content).ok())
            {
                Some(data) => {
                    let object_id = path
                        .file_stem()
                        .and_then(|value| value.to_str())
                        .unwrap_or("file-object");
                    let payload = json!({ "objectId": object_id, "data": data, "format": extension, "source": "file" });
                    if validate_transport_payload(&payload).is_ok() {
                        let _ = app.emit("preview_extent_payload", payload);
                    } else {
                        emit_file_error(&app, &path, "File không chứa geometry hợp lệ");
                    }
                }
                None => emit_file_error(&app, &path, "File JSON/GeoJSON không đọc được"),
            }
        }
        thread::sleep(Duration::from_millis(750));
    }
}

fn emit_file_error(app: &tauri::AppHandle, path: &Path, message: &str) {
    let _ = app.emit(
        "preview_extent_error",
        json!({ "source": "file", "path": path, "message": message }),
    );
}

fn normalize_package_root(value: &str) -> Option<String> {
    let path = PathBuf::from(value.trim());
    if path.is_dir() {
        path.canonicalize()
            .ok()
            .map(|canonical| canonical.to_string_lossy().into_owned())
    } else {
        None
    }
}

fn is_safe_package_path(path: &str) -> bool {
    !path.is_empty()
        && !path.starts_with('/')
        && !path.starts_with('\\')
        && !path.contains('\\')
        && !path.contains(':')
        && !path
            .split('/')
            .any(|segment| segment.is_empty() || segment == "..")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn command_line_package_takes_precedence_when_valid() {
        let root = env::current_dir().unwrap();
        let args = vec!["--package".into(), root.to_string_lossy().into_owned()];
        let config = parse_launch_args(&args, None, None);

        assert_eq!(config.source, "offline");
        assert_eq!(config.config_origin, "command line");
    }

    #[test]
    fn invalid_command_line_keeps_last_valid_file_config() {
        let root = env::current_dir().unwrap();
        let args = vec!["--package=Z:\\missing\\package".into()];
        let file_config = FileLaunchConfig {
            package_root: Some(root.to_string_lossy().into_owned()),
        };
        let config = parse_launch_args(&args, None, Some(&file_config));

        assert_eq!(config.source, "offline");
        assert_eq!(config.config_origin, "basemap-preview.config.json");
    }

    #[test]
    fn no_package_defaults_to_online() {
        let config = parse_launch_args(&[], None, None);

        assert_eq!(config.source, "online");
        assert!(config.package_root.is_none());
    }

    #[test]
    fn package_paths_are_relative_and_traversal_safe() {
        assert!(is_safe_package_path("styles/engineering.json"));
        assert!(!is_safe_package_path("../manifest.json"));
        assert!(!is_safe_package_path("C:/outside.json"));
        assert!(!is_safe_package_path("styles\\engineering.json"));
    }

    #[test]
    fn transport_payload_requires_coordinates() {
        assert!(validate_transport_payload(&json!({
            "objectId": "road-1",
            "geometry": { "type": "LineString", "coordinates": [[105.0, 10.0], [106.0, 11.0]] }
        }))
        .is_ok());
        assert!(validate_transport_payload(&json!({
            "objectId": "bad",
            "geometry": {}
        }))
        .is_err());
        assert!(validate_transport_payload(&json!({
            "objectId": "bad",
            "geometry": null
        }))
        .is_err());
    }

    #[test]
    fn google_tile_query_is_strictly_validated() {
        assert_eq!(
            parse_google_tile_query("lyrs=s&x=429303&y=242935&z=19"),
            Some(("s", 429303, 242935, 19, String::new()))
        );
        assert_eq!(
            parse_google_tile_query("lyrs=m&x=1&y=2&z=3&apistyle=s.t%3A3%7Cp.v%3Aoff")
                .unwrap()
                .4,
            "&apistyle=s.t%3A3%7Cp.v%3Aoff"
        );
        assert!(parse_google_tile_query("lyrs=javascript&x=1&y=1&z=1").is_none());
        assert!(parse_google_tile_query("lyrs=s&x=2&y=1&z=1").is_none());
        assert!(parse_google_tile_query("lyrs=s&x=1&y=1&z=23").is_none());
        assert!(parse_google_tile_query("url=https://example.invalid").is_none());
    }

    #[test]
    fn google_tile_upstream_keeps_the_locked_public_template_shape() {
        let (layer, x, y, z, apistyle) = parse_google_tile_query("lyrs=m&x=1&y=2&z=3").unwrap();
        assert_eq!(
            format!("https://{GOOGLE_TILE_HOST}/vt/lyrs={layer}&x={x}&y={y}&z={z}{apistyle}"),
            "https://mt1.google.com/vt/lyrs=m&x=1&y=2&z=3"
        );
    }
}
