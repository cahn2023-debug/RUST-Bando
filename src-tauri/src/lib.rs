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
            tauri::async_runtime::block_on(
                crate::domain::implement::modules::v2::ai::init_from_disk(&app_handle, &ai_state),
            );
            app.manage(ai_state);
            Ok(())
        })
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(crate::domain::implement::commands::v2::ActorState { gateway_tx: tx })
        .invoke_handler(tauri::generate_handler![
            crate::domain::implement::commands::v2::create_pmp_v2,
            crate::domain::implement::commands::v2::add_file_v2,
            crate::domain::implement::commands::v2::update_metadata_v2,
            crate::domain::implement::commands::v2::get_app_config,
            crate::domain::implement::commands::v2::update_app_config,
            crate::domain::implement::commands::v2::get_ai_config,
            crate::domain::implement::commands::v2::update_ai_config,
            crate::domain::implement::commands::v2::set_ai_api_key,
            crate::domain::implement::commands::v2::delete_ai_api_key,
            crate::domain::implement::commands::v2::get_ai_status,
            crate::domain::implement::commands::v2::install_ai_models,
            crate::domain::implement::commands::v2::cancel_ai_model_install,
            crate::domain::implement::commands::v2::remove_ai_models,
            crate::domain::implement::commands::v2::release_ai_memory,
            crate::domain::implement::commands::v2::predict_task,
            crate::domain::implement::commands::v2::analyze_contract_metadata,
            crate::domain::implement::commands::v2::save_ai_correction,
            crate::domain::implement::commands::v2::create_ai_conversation,
            crate::domain::implement::commands::v2::list_ai_conversations,
            crate::domain::implement::commands::v2::send_ai_message,
            crate::domain::implement::commands::v2::cancel_ai_request,
            crate::domain::implement::commands::v2::confirm_ai_action,
            crate::domain::implement::commands::v2::reject_ai_action,
            crate::domain::implement::commands::v2::get_pending_pmp_path,
            crate::domain::implement::commands::v2::get_recent_projects,
            crate::domain::implement::commands::v2::analyze_import_file,
            crate::domain::implement::commands::v2::analyze_pmp_import,
            crate::domain::implement::commands::v2::save_binary_file,
            crate::domain::implement::commands::v2::read_binary_file,
            crate::domain::implement::commands::v2::copy_text_to_system_clipboard,
            crate::domain::implement::commands::v2::fetch_url_as_data_url,
            crate::domain::implement::commands::v2::post_collaboration_json,
            crate::domain::implement::commands::v2::start_import_task,
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
            crate::domain::implement::commands::v2::get_dashboard_project_stats,
            crate::domain::implement::commands::v2::get_dashboard_extension_dist,
            crate::domain::implement::commands::v2::get_dashboard_top_files,
            crate::domain::implement::commands::v2::invoke_design_event_batch,
            crate::domain::implement::commands::v2::normalize_metadata,
            crate::domain::implement::commands::v2::find_nearest_snap_point,
            crate::domain::implement::commands::v2::save_project,
            crate::domain::implement::commands::v2::force_save_project,
            crate::domain::implement::commands::v2::update_project_state_v2,
            crate::domain::implement::commands::v2::save_project_bom_table,
            crate::domain::implement::commands::v2_bridge::query_projection_v2,
            crate::domain::implement::commands::v2_bridge::get_fiber_inventory,
            crate::domain::implement::commands::v2_bridge::get_fiber_cable_points,
            crate::domain::implement::commands::v2_bridge::get_fiber_capacity,
            crate::domain::implement::commands::v2_bridge::trace_fiber_circuit,
            crate::domain::implement::commands::v2_bridge::validate_fiber_network,
            crate::domain::implement::commands::v2_bridge::load_design_state_v2,
            crate::domain::implement::commands::v2_bridge::get_task_dependencies_v2,
            crate::domain::implement::commands::v2_bridge::get_content_types_v2,
            crate::domain::implement::commands::v2_bridge::get_project_bom_table_v2,
            crate::domain::implement::commands::v2_bridge::get_tasks,
            crate::domain::implement::commands::v2_bridge::get_notes,
            crate::domain::implement::commands::v2_bridge::get_contracts,
            crate::domain::implement::commands::v2_bridge::get_materials,
            crate::domain::implement::commands::v2_bridge::navigate_webview,
            crate::domain::implement::commands::v2_bridge::eval_webview,
            crate::domain::implement::commands::v2_bridge::get_webview_url,
            crate::domain::implement::commands::v2_bridge::get_task_dependencies,
            crate::domain::implement::commands::v2_bridge::get_content_types,
            crate::domain::implement::commands::v2_bridge::get_project_bom_table,
            crate::domain::implement::commands::v2_bridge::get_tasks_legacy,
            crate::domain::implement::commands::v2_bridge::get_notes_legacy,
            crate::domain::implement::commands::v2::get_projects,
            crate::domain::implement::commands::v2::close_active_project,
            crate::domain::implement::commands::v2::import_media_asset,
            crate::domain::implement::commands::v2::import_pmp_into_project,
            crate::domain::implement::commands::v2::delete_media_asset,
            crate::domain::implement::commands::v2::resolve_media_asset,
            crate::domain::implement::commands::v2::optimize_project_storage,
            crate::domain::implement::commands::v2::get_project_storage_health,
            crate::domain::implement::commands::v2::remove_recent_project,
            crate::domain::implement::commands::v2::delete_project,
            crate::domain::implement::commands::v2::rebuild_fts_v2,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
