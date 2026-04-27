use crate::domain::implement::modules::core::active_pmp::ActivePmpState;
use crate::implement::modules::core::config;
use arc_swap::ArcSwap;
use log::info;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::Manager;

pub fn init(app: &tauri::App) -> Result<(), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("local_data"));

    // 1. Load Config
    let app_config = config::AppConfig::load(&app_data_dir);
    let config_state = config::ConfigState(Arc::new(ArcSwap::from_pointee(app_config)));

    // 2. Manage in Tauri
    app.manage(config_state.clone());

    // 3. Update ActivePmpState with loaded config
    let active_pmp = app.state::<ActivePmpState>();
    active_pmp.set_config(config_state);

    info!("Application core systems initialized.");
    Ok(())
}
