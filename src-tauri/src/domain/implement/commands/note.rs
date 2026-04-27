use super::models::Note;
use crate::implement::commands::helpers::{
    active_v2_sender, get_db_connection, project_id_to_uuid, send_v2_event,
};
use crate::implement::db::DatabaseState;
use crate::implement::modules::core::active_pmp::ActivePmpState;
use crate::implement::modules::core::audit;
use crate::implement::modules::v2::events::AppEvent;
use rusqlite::params;
use serde_json::json;
use tauri::State;
use uuid::Uuid;

#[tauri::command]
pub fn get_notes(
    state: tauri::State<DatabaseState>,
    #[allow(non_snake_case)] projectId: String,
) -> Result<Vec<Note>, String> {
    let guard = get_db_connection(&state)?;
    let conn = guard.as_ref().ok_or("No project opened")?;
    let mut stmt = conn
        .prepare(
            "SELECT id, project_id, title, content, target_file_path, created_at
             FROM notes
             WHERE project_id = ?1
             ORDER BY created_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let notes_iter = stmt
        .query_map(params![projectId], |row| {
            Ok(Note {
                id: row.get(0)?,
                project_id: row.get(1)?,
                title: row.get(2)?,
                content: row.get(3)?,
                target_file_path: row.get(4)?,
                created_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut notes = Vec::new();
    for note_result in notes_iter {
        notes.push(note_result.map_err(|e| e.to_string())?);
    }
    Ok(notes)
}

#[tauri::command]
pub async fn create_note(
    active_pmp: State<'_, ActivePmpState>,
    state: State<'_, DatabaseState>,
    #[allow(non_snake_case)] projectId: String,
    title: String,
    content: Option<String>,
    #[allow(non_snake_case)] targetFilePath: Option<String>,
) -> Result<String, String> {
    let sender = active_v2_sender(&active_pmp)?;
    let proj_uuid = project_id_to_uuid(&projectId)?;
    let entity_id = Uuid::new_v4();

    let mut metadata_map = serde_json::Map::new();
    if let Some(path) = targetFilePath {
        metadata_map.insert("target_file_path".to_string(), json!(path));
    }

    // Ensure legacy alias exists
    {
        let v2_db = active_pmp.v2_db()?;
        let _ = v2_db.ensure_alias();
    }

    send_v2_event(
        &sender,
        proj_uuid,
        "note",
        entity_id,
        AppEvent::NoteCreated {
            title: title.clone(),
            content: content.unwrap_or_default(),
            metadata: serde_json::Value::Object(metadata_map),
        },
    )
    .await?;

    let guard = get_db_connection(&state)?;
    let conn = guard.as_ref().ok_or("No project opened")?;
    let _ = audit::log_event(
        conn,
        &projectId,
        None,
        "CREATE_NOTE",
        "notes",
        &entity_id.to_string(),
        None,
        Some(json!({ "title": title })),
    );
    Ok(entity_id.to_string())
}

#[tauri::command]
pub async fn delete_note(
    active_pmp: tauri::State<'_, ActivePmpState>,
    #[allow(non_snake_case)] noteId: String,
) -> Result<(), String> {
    let sender = active_v2_sender(&active_pmp)?;
    let project_id = active_pmp.project_id_string()?;
    let proj_uuid = project_id_to_uuid(&project_id)?;
    let entity_uuid = Uuid::parse_str(&noteId).map_err(|e| e.to_string())?;

    send_v2_event(
        &sender,
        proj_uuid,
        "note",
        entity_uuid,
        AppEvent::NoteDeleted { id: entity_uuid },
    )
    .await?;

    Ok(())
}
