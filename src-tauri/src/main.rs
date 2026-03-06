// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;
mod commands;
mod doc_parser;
mod ml;

use db::initialize_database;
use std::path::PathBuf;
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // Get local app data dir to store SQLite DB securely
            let app_data_dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("local_data"));
            
            // Initialize Database
            let db_state = initialize_database(app_data_dir).expect("Failed to initialize SQLite Database");
            app.manage(db_state);
            
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_projects,
            commands::create_project,
            commands::load_pmp_file,
            commands::create_pmp_file,
            commands::get_tasks,
            commands::create_task,
            commands::toggle_task,
            commands::update_task_status,
            commands::update_task_dates,
            commands::update_task_parent,
            commands::get_project_tree,
            commands::get_task_dependencies,
            commands::add_task_dependency,
            commands::index_document,
            commands::search_documents,
            commands::read_file_content,
            commands::predict_task,
            commands::preview_document_text,
            commands::index_project_files,
            commands::get_notes,
            commands::create_note,
            commands::delete_note,
            commands::assign_file_to_task,
            commands::add_project_folder,
            commands::remove_project_folder,
            commands::get_contracts,
            commands::create_contract,
            commands::delete_contract
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
