use crate::contract::project_model::SearchResult;
use crate::implement::db::DatabaseState;
use log::warn;
use std::path::PathBuf;

fn do_index_document(
    state: &DatabaseState,
    project_id: String,
    file_path: String,
    title: String,
) -> Result<(), String> {
    use crate::implement::modules::ingestion::doc_parser::extract_text;

    let p = PathBuf::from(&file_path);

    // Optimization: Extract text OUTSIDE the database lock
    let content = extract_text(&p).unwrap_or_else(|e| {
        println!("[Indexing] Skip text extraction for {:?}: {}", p, e);
        "".to_string()
    });

    let guard = match state.conn.try_lock() {
        Ok(g) => g,
        Err(_) => return Err("Database is currently locked by another operation".to_string()),
    };

    // Safety check: Ensure we are still indexing the same project
    let active_id = state.active_project_id.lock().unwrap().clone();
    if active_id != Some(project_id.to_string()) {
        return Err(format!(
            "Project ID mismatch (Active: {:?}, Indexing: {})",
            active_id, project_id
        ));
    }

    let conn = guard.as_ref().ok_or("No project opened")?;

    conn.execute(
        "INSERT INTO file_search (file_path, title, content) VALUES (?1, ?2, ?3)",
        rusqlite::params![file_path, title, content],
    )
    .map_err(|e| format!("Failed to insert into FTS index: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn index_document(
    state: tauri::State<'_, DatabaseState>,
    project_id: String,
    file_path: String,
    title: String,
) -> Result<(), String> {
    do_index_document(&state, project_id, file_path, title)
}

#[tauri::command]
pub fn search_documents(
    state: tauri::State<'_, DatabaseState>,
    query: String,
) -> Result<Vec<SearchResult>, String> {
    let guard = state.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project opened")?;

    // Sanitize query and prepare for FTS5 prefix search
    let sanitized_query = query.replace("\"", "").replace("'", "");
    let fts_query: String = sanitized_query
        .split_whitespace()
        .map(|w| format!("\"{}\"*", w))
        .collect::<Vec<_>>()
        .join(" AND ");

    let mut stmt = conn
        .prepare(
            "
        SELECT 
            file_path, 
            title, 
            snippet(file_search, 2, '<b>', '</b>', '...', 64) as snippet
        FROM file_search 
        WHERE file_search MATCH ?1
        ORDER BY rank
        LIMIT 30
    ",
        )
        .map_err(|e| e.to_string())?;

    let rows_iter = stmt
        .query_map(rusqlite::params![fts_query], |row| {
            Ok(SearchResult {
                file_path: row.get(0)?,
                title: row.get(1)?,
                snippet: row.get(2)?,
                score: 0.0, // FTS5 rank could be used here if needed
            })
        })
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for sr in rows_iter.flatten() {
        result.push(sr);
    }

    Ok(result)
}

#[tauri::command]
pub async fn search_universal(
    state: tauri::State<'_, DatabaseState>,
    query: String,
    _project_id: Option<String>,
) -> Result<Vec<crate::implement::modules::v2::search::engine::SearchResult>, String> {
    let conn_guard = state.conn.lock().map_err(|_| "Database lock poisoned")?;
    let conn = conn_guard.as_ref().ok_or("No database connection active")?;

    // We need an Arc<Mutex<Connection>> for the SearchEngine
    // But since we already have the lock, we can query directly or
    // temporarily wrap the connection if the SearchEngine API allows.
    // For now, I'll use the logic from SearchEngine directly or instantiate it.

    // Actually, SearchEngine needs Arc<Mutex<Connection>>.
    // In DatabaseState, conn is Mutex<Option<Connection>>.
    // I will query directly to avoid complex wrapping.

    let sanitized_query = query.replace("\"", "").replace("'", "");
    let fts_query = format!("{}*", sanitized_query);

    let mut stmt = conn
        .prepare(
            "SELECT rowid, name, rank
         FROM entity_search
         WHERE entity_search MATCH ?1
         ORDER BY rank
         LIMIT 20",
        )
        .map_err(|e| e.to_string())?;

    let results = stmt
        .query_map([fts_query], |row| {
            let rowid: i64 = row.get(0)?;
            let name: String = row.get(1)?;
            let rank: f64 = row.get(2)?;

            // Details from entity_index
            let (entity_id, entity_type, pid) = conn
                .query_row(
                    "SELECT entity_id, entity_type, project_id FROM entity_index WHERE rowid = ?",
                    [rowid],
                    |r| {
                        Ok((
                            r.get::<_, String>(0)?,
                            r.get::<_, String>(1)?,
                            r.get::<_, String>(2)?,
                        ))
                    },
                )
                .unwrap_or((String::new(), String::new(), String::new()));

            Ok(
                crate::implement::modules::v2::search::engine::SearchResult {
                    entity_id,
                    entity_type,
                    project_id: pid,
                    name,
                    rank,
                    tags: None,
                },
            )
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(results)
}

#[tauri::command]
pub async fn index_project_files(
    state: tauri::State<'_, DatabaseState>,
    project_id: String,
) -> Result<usize, String> {
    let state_inner = state.inner().clone();
    let current_task_id = state
        .indexing_task_id
        .fetch_add(1, std::sync::atomic::Ordering::SeqCst)
        + 1;

    // Run indexing in a background task
    tauri::async_runtime::spawn(async move {
        // Collect all subfolders from db
        let folders: Vec<String> = {
            let guard = match state_inner.conn.try_lock() {
                Ok(g) => g,
                Err(_) => {
                    warn!("[Indexing] Database is busy. Retrying in next loop.");
                    return;
                }
            };
            let conn = match guard.as_ref() {
                Some(c) => c,
                None => {
                    warn!("[Indexing] No project connection. Aborting.");
                    return;
                }
            };

            let mut stmt = match conn.prepare(
                "SELECT CAST(folder_path AS TEXT) FROM project_folders WHERE project_id = ?1",
            ) {
                Ok(s) => s,
                Err(e) => {
                    warn!("[Indexing] Failed to prepare statement: {}", e);
                    return;
                }
            };

            stmt.query_map(rusqlite::params![project_id], |row: &rusqlite::Row| {
                row.get::<_, String>(0)
            })
            .map(|rows| rows.filter_map(Result::ok).collect())
            .unwrap_or_default()
        };

        let mut indexed_count = 0;

        for folder in folders {
            let p = PathBuf::from(&folder);
            if !p.exists() || !p.is_dir() {
                continue;
            }

            let extensions = ["doc", "docx", "pdf", "txt", "xlsx", "xls", "csv"];

            for entry in walkdir::WalkDir::new(&folder)
                .into_iter()
                .filter_map(|e| e.ok())
            {
                // Cancellation check
                if state_inner
                    .indexing_task_id
                    .load(std::sync::atomic::Ordering::SeqCst)
                    != current_task_id
                {
                    println!(
                        "[Indexing] Task ID mismatch ({} != {}). Cancelling background task.",
                        state_inner
                            .indexing_task_id
                            .load(std::sync::atomic::Ordering::SeqCst),
                        current_task_id
                    );
                    return;
                }

                if entry.path().is_file() {
                    if let Some(ext) = entry.path().extension() {
                        let ext_str = ext.to_string_lossy().to_lowercase();
                        if extensions.contains(&ext_str.as_str()) {
                            let path_str = entry.path().to_string_lossy().to_string();
                            let title_str = entry
                                .path()
                                .file_stem()
                                .unwrap_or_default()
                                .to_string_lossy()
                                .to_string();

                            // Call do_index_document with project_id for safety
                            if let Err(e) = do_index_document(
                                &state_inner,
                                project_id.clone(),
                                path_str,
                                title_str,
                            ) {
                                println!("[Indexing] Aborting background task: {}", e);
                                return;
                            }
                            indexed_count += 1;

                            // Yield regularly to allow other DB operations (UI responsiveness)
                            tokio::task::yield_now().await;
                        }
                    }
                }
            }
        }
        println!("Indexed {} files in background.", indexed_count);
    });

    // Return immediately to the frontend
    Ok(0) // Return 0 as it's running in background; status will be sent via events
}
