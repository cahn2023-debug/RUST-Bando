pub mod core;
pub mod domain;

pub use crate::core::error;
pub use crate::core::plugin::tool;
pub use crate::domain::contract;
pub use crate::domain::design;
pub use crate::domain::implement;
pub use crate::domain::resource as resources;

use std::sync::Arc;
use tauri::Manager;
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

pub use implement::commands;
pub use implement::db;
pub use implement::modules;
pub use implement::modules::bootstrap;

pub use contract::design_state;
pub use contract::project_model;
pub use contract::spatial_models;
pub use design::design_events;
pub use design::geometry;
pub use implement::modules::core::config;
pub use implement::modules::core::config::ConfigState;
pub use implement::modules::ingestion::doc_parser;
pub use implement::modules::ingestion::import;
pub use implement::modules::ingestion::preview_service;

#[cfg(feature = "ai")]
pub use implement::modules::ai::ai_engine;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = crate::implement::db::DatabaseState::new();
    let preview_cache = crate::implement::modules::ingestion::preview_service::PreviewCache::default();
    
    // Initialize standby sync engine for global commands
    let standby_conn = Arc::new(parking_lot::Mutex::new(rusqlite::Connection::open_in_memory().unwrap()));
    let standby_store = Arc::new(parking_lot::Mutex::new(crate::domain::implement::db::event_store::EventStore::new(standby_conn.clone(), "STANDBY".to_string())));
    let standby_repo = Arc::new(crate::domain::implement::modules::v2::sync::repository::SyncRepository::new(standby_conn.clone()));
    let sync_engine = Arc::new(crate::domain::implement::modules::v2::sync::engine::SyncEngine::new(
        standby_store,
        standby_repo,
        "http://localhost:3000"
    ));

    let app = tauri::Builder::default()
        .manage(app_state)
        .manage(preview_cache)
        .manage(sync_engine)
        .manage(crate::implement::modules::core::active_pmp::ActivePmpState::new())
        .setup(|app| {
            tracing::info!("Starting setup hook...");
            let main_window = app.get_webview_window("main").ok_or_else(|| {
                let err = "Could not find main webview window";
                tracing::error!("{}", err);
                err
            })?;

            if let Err(e) = bootstrap::init(app) {
                let msg = format!("Ứng dụng không thể khởi chạy: {}", e);
                tracing::error!("{}", msg);

                let handle = app.handle();
                handle
                    .dialog()
                    .message(&msg)
                    .title("Lỗi Hệ Thống")
                    .kind(MessageDialogKind::Error)
                    .blocking_show();

                handle.exit(1);
            }

            tracing::info!("Bootstrap init successful. Showing main window...");
            if let Err(e) = main_window.show() {
                tracing::error!("Failed to show main window: {}", e);
            }

            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .register_uri_scheme_protocol("preview", move |ctx, request| {
            crate::implement::modules::ingestion::preview_service::handle_preview_request(
                ctx.app_handle(),
                request,
            )
        })
        .register_uri_scheme_protocol("tiles", move |ctx, request| {
            crate::implement::modules::gis::tile_protocol::handle_tile_request(
                ctx.app_handle(),
                request,
            )
        })
        .invoke_handler(tauri::generate_handler![
            crate::implement::modules::gis::tile_protocol::get_tile_v2,
            implement::commands::v2_events::invoke_design_event_batch,
            crate::implement::commands::project_manager::get_active_project,
            crate::implement::commands::project_manager::load_pmp_file,
            crate::implement::commands::project_manager::close_active_project,
            crate::implement::commands::project_manager::force_save_project,
            crate::implement::commands::project_manager::save_project,
            crate::implement::commands::project_unified::load_project_unified,
            crate::implement::commands::project_unified::get_project_settings_unified,
            crate::implement::commands::project_unified::create_project_unified,
            crate::design::design_events::trigger_bridge_event,
            crate::implement::commands::project_v2_commands::create_project_v2,
            crate::implement::commands::project_v2_commands::search_v2,
            crate::implement::commands::project_v2_commands::create_task_v2,
            crate::implement::commands::project_v2_commands::update_entity_metadata_v2,
            crate::implement::commands::project_v2_commands::get_stats_v2,
            crate::implement::commands::project_v2_commands::migrate_to_v2,
            crate::implement::commands::project_v2_commands::upload_blob_v2,
            crate::implement::commands::project_v2_commands::get_pmp_info_v2,
            commands::project_v2::create_pmp_v2,
            commands::project_v2::search_pmp_v2,
            crate::implement::commands::project_v4::get_project_settings,
            crate::implement::commands::project_v4::update_project_settings,
            crate::implement::commands::project_v4::get_project_bom_table,
            crate::implement::commands::project_v4::get_audit_logs,
            modules::core::config::get_app_config,
            modules::core::config::update_app_config,
            modules::core::config::get_recent_projects,
            modules::core::config::save_recent_projects,
            modules::core::config::remove_recent_project,
            modules::core::config::clear_last_opened_project,
            modules::core::config::save_last_opened_project,
            modules::core::config::get_pending_pmp_path,
            modules::core::config::release_ai_memory,
            crate::implement::commands::task::get_tasks,
            crate::implement::commands::task::create_task,
            crate::implement::commands::task::toggle_task,
            crate::implement::commands::task::update_task_status,
            commands::task::update_task_dates,
            commands::task::update_task_parent,
            commands::task::get_task_dependencies,
            commands::task::add_task_dependency,
            commands::task::assign_file_to_task,
            commands::task::delete_task,
            commands::task::predict_task,
            commands::search::index_document,
            commands::search::search_documents,
            commands::search::search_universal,
            commands::search::index_project_files,
            commands::utils::read_file_content,
            commands::utils::preview_document_text,
            commands::utils::save_binary_file,
            commands::utils::open_containing_folder,
            commands::utils::open_file_external,
            commands::file_tree::get_project_tree,
            commands::file_tree::move_fs_item,
            commands::note::get_notes,
            commands::note::create_note,
            commands::note::delete_note,
            commands::contract::get_contracts,
            commands::contract::create_contract,
            commands::contract::delete_contract,
            commands::material::get_materials,
            commands::material::create_material,
            commands::material::delete_material,
            commands::material::list_work_items,
            commands::material::add_work_item,
            commands::material::delete_work_item,
            design::map::set_drawing_mode,
            design::map::get_camera_dori_zones,
            design::map::get_project_dori_zones,
            design::map::get_streetview_metadata,
            design::map::sign_streetview_url,
            design::map::navigate_webview,
            design::map::eval_webview,
            design::map::get_webview_url,
            design::map::calculate_ppm,
            design::design_events::get_design_state,
            design::design_events::dispatch_design_events,
            design::design_events::load_design_state,
            design::design_events::undo_design_event,
            design::design_events::redo_design_event,
            design::design_events::deduplicate_project_data,
            design::design_events::aggregate_project_data,
            design::design_events::query_features_in_area,
            design::design_events::find_nearest_snap_point,
            commands::auth::google_login_flow,
            commands::auth::set_current_user,
            commands::auth::logout_user,
            commands::import::analyze_import_file,
            commands::import::start_import_task,
            commands::ingestion_v2::start_ingestion_v2,
            #[cfg(feature = "ai")]
            commands::ai::check_ai_status,
            #[cfg(feature = "ai")]
            commands::ai::normalize_metadata,
            #[cfg(feature = "ai")]
            commands::ai::check_and_download_models,
            #[cfg(feature = "ai")]
            commands::ai_learning::save_ai_correction,
            commands::content::get_content_types,
            commands::content::get_content_fields,
            commands::content::get_content_items,
            commands::content::save_content_item,
            commands::content::delete_content_item,
            commands::analytics::get_dashboard_project_stats,
            commands::analytics::get_dashboard_extension_dist,
            commands::analytics::get_dashboard_top_files,
            commands::gis::validate_topology,
            commands::gis::export_geojson_command,
            commands::gis::get_gis_audit_logs,
            crate::domain::implement::modules::v2::reporting::commands::get_gis_report_v2,
            crate::domain::implement::modules::v2::reporting::commands::get_active_gis_report_v2,
            crate::domain::implement::modules::v2::sync::commands::sync_v2_start,
            crate::domain::implement::modules::v2::sync::commands::sync_v2_get_status,
            crate::domain::implement::modules::v2::sync::commands::sync_v2_go_online,
            crate::domain::implement::modules::v2::sync::commands::sync_v2_go_offline,
            crate::domain::implement::modules::v2::sync::commands::sync_v2_is_online,
            tool::dispatcher::dispatch_command,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::Exit = event {
            tracing::info!("Application exiting, performing graceful shutdown...");

            // 1. Shutdown Active PMP Worker (using block_on for async)
            let active_pmp =
                app_handle.state::<crate::implement::modules::core::active_pmp::ActivePmpState>();
            tauri::async_runtime::block_on(async {
                if let Err(e) = active_pmp.shutdown().await {
                    tracing::error!("Failed to shutdown active PMP worker: {}", e);
                }
            });

            // 2. Database connections are handled by ActivePmp shutdown above
            tracing::info!("Graceful shutdown completed.");
        }
    });
}
