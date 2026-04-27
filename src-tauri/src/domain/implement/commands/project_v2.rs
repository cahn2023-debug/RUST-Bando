use crate::implement::db::DatabaseState;
use crate::implement::modules::core::active_pmp::{ensure_pmp_v2, ActivePmpState};
use crate::implement::modules::v2::storage::schema::ensure_pmp_metadata;
use crate::implement::modules::v2::V2Database;
use shared_models::pmp_v2::PmpV2File;
use std::path::PathBuf;
use uuid::Uuid;

#[tauri::command]
pub async fn create_pmp_v2(
    path: String,
    name: String,
    description: Option<String>,
    db: tauri::State<'_, DatabaseState>,
    active_pmp: tauri::State<'_, ActivePmpState>,
) -> Result<String, String> {
    let path_buf = PathBuf::from(path);
    let path_str = path_buf.to_string_lossy().to_string();
    let device_id = active_pmp.current_device_id()?;
    let v2_db = V2Database::create(&path_str, &device_id)?;
    let project_uuid = v2_db.create_project(&name, "").await?;

    if let Some(desc) = description {
        v2_db.update_metadata(
            project_uuid,
            project_uuid,
            "project",
            serde_json::json!({ "description": desc }),
        ).await?;
    }

    {
        let conn = v2_db
            .conn
            .lock();
        ensure_pmp_metadata(&conn, project_uuid, &device_id)?;
    }

    drop(v2_db);
    ensure_pmp_v2(&path_buf)?;
    let db_state = db.inner().clone();
    let project = tauri::async_runtime::spawn_blocking(move || {
        crate::implement::db::open_project_db(&db_state, path_buf.clone())
    })
    .await
    .map_err(|e| e.to_string())??;

    let project_id = Uuid::parse_str(&project.id)
        .map_err(|e| format!("Invalid UUID returned for created project: {}", e))?;
    active_pmp
        .bind_project(
            PathBuf::from(project.path.as_deref().unwrap_or("")),
            project_id,
            None,
        )?;

    Ok(project.id)
}

#[tauri::command]
pub async fn search_pmp_v2(
    query: String,
    db: tauri::State<'_, DatabaseState>,
) -> Result<Vec<PmpV2File>, String> {
    let conn_guard = db.conn.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not connected")?;

    // Ở đây ta có thể bọc Connection hiện tại vào wrapper PmpDbV2 hoặc query trực tiếp
    // Vì DatabaseState đang giữ raw rusqlite Connection, ta query trực tiếp cho nhanh
    let mut stmt = conn
        .prepare(
            r#"
        SELECT f.id, f.project_id, f.rel_path, f.filename, f.extension, f.file_size, 
               f.hash_sha256, f.mime_type, f.status, f.metadata_json, f.created_at, f.updated_at
        FROM files f
        JOIN files_fts ft ON ft.id = f.id
        WHERE files_fts MATCH ?1
        ORDER BY rank
        "#,
        )
        .map_err(|e| e.to_string())?;

    let file_iter = stmt
        .query_map([query], |row| {
            let metadata_str: String = row.get(9)?;
            Ok(PmpV2File {
                id: row.get(0)?,
                project_id: row.get(1)?,
                rel_path: row.get(2)?,
                filename: row.get(3)?,
                extension: row.get(4)?,
                file_size: row.get(5)?,
                hash_sha256: row.get(6)?,
                mime_type: row.get(7)?,
                status: row.get(8)?,
                metadata_json: serde_json::from_str(&metadata_str).unwrap_or(serde_json::json!({})),
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut results = Vec::new();
    for file in file_iter {
        results.push(file.map_err(|e| e.to_string())?);
    }
    Ok(results)
}
