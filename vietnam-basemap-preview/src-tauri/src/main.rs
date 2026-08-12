#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::{env, fs, path::PathBuf, sync::Mutex};
use tauri::{Manager, State};

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

struct AppState(Mutex<PreviewLaunchConfig>);

#[tauri::command]
fn get_preview_launch_config(state: State<'_, AppState>) -> Result<PreviewLaunchConfig, String> {
    state
        .0
        .lock()
        .map(|config| config.clone())
        .map_err(|_| "Không đọc được cấu hình khởi chạy preview".to_string())
}

#[tauri::command]
fn read_preview_package_file(
    package_path: String,
    state: State<'_, AppState>,
) -> Result<Vec<u8>, String> {
    if !is_safe_package_path(&package_path) {
        return Err(format!("Package path không an toàn: {package_path}"));
    }
    let config = state
        .0
        .lock()
        .map_err(|_| "Không đọc được cấu hình package".to_string())?;
    let root = config
        .package_root
        .as_deref()
        .ok_or_else(|| "Chưa cấu hình local package".to_string())?;
    let root = PathBuf::from(root);
    let candidate = root.join(&package_path);
    let canonical = candidate
        .canonicalize()
        .map_err(|_| format!("Không đọc được package asset: {package_path}"))?;
    if !canonical.starts_with(&root) || !canonical.is_file() {
        return Err(format!("Package asset nằm ngoài package root: {package_path}"));
    }
    fs::read(canonical).map_err(|error| format!("Không đọc được package asset: {error}"))
}

#[tauri::command]
fn read_preview_package_range(
    package_path: String,
    offset: u64,
    length: usize,
    state: State<'_, AppState>,
) -> Result<Vec<u8>, String> {
    if !is_safe_package_path(&package_path) {
        return Err(format!("Package path không an toàn: {package_path}"));
    }
    let config = state
        .0
        .lock()
        .map_err(|_| "Không đọc được cấu hình package".to_string())?;
    let root = config
        .package_root
        .as_deref()
        .ok_or_else(|| "Chưa cấu hình local package".to_string())?;
    let root = PathBuf::from(root);
    let candidate = root.join(&package_path);
    let canonical = candidate
        .canonicalize()
        .map_err(|_| format!("Không đọc được package asset: {package_path}"))?;
    if !canonical.starts_with(&root) || !canonical.is_file() {
        return Err(format!("Package asset nằm ngoài package root: {package_path}"));
    }
    let mut file = fs::File::open(canonical).map_err(|error| error.to_string())?;
    use std::io::{Read, Seek, SeekFrom};
    file.seek(SeekFrom::Start(offset)).map_err(|error| error.to_string())?;
    let mut bytes = vec![0; length];
    file.read_exact(&mut bytes).map_err(|error| error.to_string())?;
    Ok(bytes)
}

fn main() {
    let config = parse_launch_config();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState(Mutex::new(config)))
        .invoke_handler(tauri::generate_handler![
            get_preview_launch_config,
            read_preview_package_file,
            read_preview_package_range
        ])
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                window.set_title("Vietnam Basemap Preview")?;
            }
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
        source: if package_root.is_some() { "offline" } else { "online" }.to_string(),
        package_root,
        config_origin,
    }
}

fn read_file_config() -> Option<FileLaunchConfig> {
    let path = env::var_os("VIETNAM_BASEMAP_CONFIG")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("basemap-preview.config.json"));
    serde_json::from_str(&fs::read_to_string(path).ok()?).ok()
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
        && !path.split('/').any(|segment| segment.is_empty() || segment == "..")
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
}
