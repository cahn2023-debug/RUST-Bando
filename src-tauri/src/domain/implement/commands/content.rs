use crate::implement::commands::helpers::get_db_connection;
use crate::implement::db::DatabaseState;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct ContentType {
    pub id: i32,
    pub name: String,
    pub icon: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ContentField {
    pub id: i32,
    pub content_type_id: i32,
    pub name: String,
    pub label: String,
    pub field_type: String,
    pub required: bool,
    pub options_json: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ContentItem {
    pub id: String,
    pub content_type_id: i32,
    pub project_id: String,
    pub name: String,
    pub data_json: String,
    pub created_at: String,
    pub updated_at: String,
}

#[tauri::command]
pub async fn get_content_types(db: State<'_, DatabaseState>) -> Result<Vec<ContentType>, String> {
    let guard = get_db_connection(&db)?;
    let conn = guard.as_ref().ok_or("Database not connected")?;

    let mut stmt = conn
        .prepare("SELECT id, name, icon, description FROM content_types ORDER BY name ASC")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(ContentType {
                id: row.get(0)?,
                name: row.get(1)?,
                icon: row.get(2)?,
                description: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;

    Ok(rows.filter_map(|r| r.ok()).collect())
}

#[tauri::command]
pub async fn get_content_fields(
    db: State<'_, DatabaseState>,
    type_id: i32,
) -> Result<Vec<ContentField>, String> {
    let guard = get_db_connection(&db)?;
    let conn = guard.as_ref().ok_or("Database not connected")?;

    let mut stmt = conn
        .prepare(
            "SELECT id, content_type_id, name, label, field_type, required, options_json
             FROM content_fields
             WHERE content_type_id = ?1
             ORDER BY label ASC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![type_id], |row| {
            Ok(ContentField {
                id: row.get(0)?,
                content_type_id: row.get(1)?,
                name: row.get(2)?,
                label: row.get(3)?,
                field_type: row.get(4)?,
                required: row.get(5)?,
                options_json: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;

    Ok(rows.filter_map(|r| r.ok()).collect())
}

#[tauri::command]
pub async fn get_content_items(
    db: State<'_, DatabaseState>,
    project_id: String,
    type_id: i32,
) -> Result<Vec<ContentItem>, String> {
    let guard = get_db_connection(&db)?;
    let conn = guard.as_ref().ok_or("Database not connected")?;

    let mut stmt = conn
        .prepare(
            "SELECT id, content_type_id, project_id, name, data_json, created_at, updated_at
             FROM content_items
             WHERE project_id = ?1
               AND content_type_id = ?2
             ORDER BY updated_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![project_id, type_id], |row| {
            Ok(ContentItem {
                id: row.get(0)?,
                content_type_id: row.get(1)?,
                project_id: row.get(2)?,
                name: row.get(3)?,
                data_json: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;

    Ok(rows.filter_map(|r| r.ok()).collect())
}

#[tauri::command]
pub async fn save_content_item(
    db: State<'_, DatabaseState>,
    content_type_id: i32,
    project_id: String,
    name: String,
    data_json: String,
    id: Option<String>,
) -> Result<String, String> {
    let guard = get_db_connection(&db)?;
    let conn = guard.as_ref().ok_or("Database not connected")?;

    if let Some(item_id) = id {
        conn.execute(
            "UPDATE content_items
             SET name = ?1,
                 data_json = ?2,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?3",
            params![name, data_json, item_id],
        )
        .map_err(|e| e.to_string())?;

        return Ok(item_id);
    }

    let item_uuid = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO content_items (id, content_type_id, project_id, name, data_json, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
        params![
            item_uuid,
            content_type_id,
            project_id,
            name,
            data_json
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(item_uuid)
}

#[tauri::command]
pub async fn delete_content_item(
    db: State<'_, DatabaseState>,
    item_id: String,
) -> Result<(), String> {
    let guard = get_db_connection(&db)?;
    let conn = guard.as_ref().ok_or("Database not connected")?;

    conn.execute("DELETE FROM content_items WHERE id = ?1", params![item_id])
        .map_err(|e| e.to_string())?;

    Ok(())
}
