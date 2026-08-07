pub mod domain;

pub use crate::domain::implement;
pub use implement::commands;
pub use implement::modules;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();
    let (tx, rx) = tokio::sync::mpsc::channel(1024);

    // Khởi tạo DB & Worker ngay khi app start (sử dụng in-memory database để tránh tự sinh file default_project.pmp)
    let pmp_path = std::path::PathBuf::from(":memory:");
    let db =
        crate::domain::implement::modules::v2::storage::connection::PmpDatabase::open_or_create(
            pmp_path,
        )
        .expect("Failed to init V2 DB");

    let _handle =
        crate::domain::implement::modules::v2::pipeline::worker_storage::StorageWorker::spawn(
            rx, db,
        );

    use tauri::Manager;
    tauri::Builder::default()
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data dir");
            let state = crate::domain::implement::state::hydrator::load_state(&app_data_dir);
            app.manage(state);
            let ai_state = crate::domain::implement::modules::v2::ai::AiState::default();
            let app_handle = app.handle().clone();
            
            // Spawn 2 Async Tasks (Tokio Workers) cho Basemap & Database GIS Streaming ngay khi Boot
            let (_bm_tx, bm_rx) = tokio::sync::mpsc::channel(256);
            let _bm_worker = crate::domain::implement::modules::v2::basemap::BasemapWorker::spawn(bm_rx, Some(app_handle.clone()));

            let (_gis_tx, gis_rx) = tokio::sync::mpsc::channel(256);
            let _gis_worker = crate::domain::implement::modules::v2::gis::GisStreamWorker::spawn(gis_rx, Some(app_handle.clone()));

            tauri::async_runtime::block_on(
                crate::domain::implement::modules::v2::ai::init_from_disk(&app_handle, &ai_state),
            );
            app.manage(ai_state);
            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .manage(crate::domain::implement::commands::v2::ActorState { gateway_tx: tx })
        .invoke_handler(crate::register_tauri_commands!())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
