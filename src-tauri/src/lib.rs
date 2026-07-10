pub mod domain;

pub use crate::domain::implement;
pub use implement::commands;
pub use implement::modules;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();
    let (tx, rx) = tokio::sync::mpsc::channel(1024);
    
    // Khởi tạo DB & Worker ngay khi app start
    let pmp_path = std::path::PathBuf::from("./default_project.pmp");
    let db = crate::domain::implement::modules::v2::storage::connection::PmpDatabase::open_or_create(pmp_path)
        .expect("Failed to init V2 DB");
    
    let _handle = crate::domain::implement::modules::v2::pipeline::worker_storage::StorageWorker::spawn(rx, db);

    use tauri::Manager;
    tauri::Builder::default()
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir().expect("Failed to get app data dir");
            let state = crate::domain::implement::state::hydrator::load_state(&app_data_dir);
            app.manage(state);
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(crate::domain::implement::commands::v2::ActorState { gateway_tx: tx })
        .invoke_handler(tauri::generate_handler![
            crate::domain::implement::commands::v2::create_pmp_v2,
            crate::domain::implement::commands::v2::add_file_v2,
            crate::domain::implement::commands::v2::update_metadata_v2,
            crate::domain::implement::commands::v2::get_app_config,
            crate::domain::implement::commands::v2::get_pending_pmp_path,
            crate::domain::implement::commands::v2::get_recent_projects,
            crate::domain::implement::commands::v2::sync_v2_get_status,
            crate::domain::implement::commands::v2::sync_v2_is_online,
            crate::domain::implement::commands::v2::load_pmp_file,
            crate::domain::implement::commands::v2::get_active_project,
            crate::domain::implement::commands::v2::get_project_tree,
            crate::domain::implement::commands::v2::save_recent_projects,
            crate::domain::implement::commands::v2::save_last_opened_project,
            crate::domain::implement::commands::v2::index_project_files,
            crate::domain::implement::commands::v2::search_v2,
            crate::domain::implement::commands::v2::get_stats_v2,
            crate::domain::implement::commands::v2::invoke_design_event_batch,
            crate::domain::implement::commands::v2::normalize_metadata,
            crate::domain::implement::commands::v2::find_nearest_snap_point,
            crate::domain::implement::commands::v2::save_project,
            crate::domain::implement::commands::v2::force_save_project,
            crate::domain::implement::commands::v2::update_project_state_v2,
            crate::domain::implement::commands::v2::save_project_bom_table,
            crate::domain::implement::commands::v2_bridge::query_projection_v2,
            crate::domain::implement::commands::v2_bridge::load_design_state_v2,
            crate::domain::implement::commands::v2_bridge::get_task_dependencies_v2,
            crate::domain::implement::commands::v2_bridge::get_content_types_v2,
            crate::domain::implement::commands::v2_bridge::get_project_bom_table_v2,
            crate::domain::implement::commands::v2_bridge::get_tasks,
            crate::domain::implement::commands::v2_bridge::get_notes,
            crate::domain::implement::commands::v2_bridge::get_contracts,
            crate::domain::implement::commands::v2_bridge::get_materials,
            crate::domain::implement::commands::v2_bridge::get_task_dependencies,
            crate::domain::implement::commands::v2_bridge::get_content_types,
            crate::domain::implement::commands::v2_bridge::get_project_bom_table,
            crate::domain::implement::commands::v2_bridge::get_tasks_legacy,
            crate::domain::implement::commands::v2_bridge::get_notes_legacy,
            crate::domain::implement::commands::v2::get_projects,
            crate::domain::implement::commands::v2::close_active_project,
            crate::domain::implement::commands::v2::remove_recent_project,
            crate::domain::implement::commands::v2::delete_project,
            crate::domain::implement::commands::v2::rebuild_fts_v2,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
