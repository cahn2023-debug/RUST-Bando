use crate::contract::project_model::FileNode;
use crate::implement::db::DatabaseState;
use std::path::PathBuf;

#[tauri::command]
pub fn get_project_tree(
    state: tauri::State<DatabaseState>,
    project_id: String,
    path: Option<String>,
    max_depth: Option<u32>,
) -> Result<Vec<FileNode>, String> {
    let depth = max_depth.unwrap_or(2); // Default to 2 levels deep for performance
    let folders: Vec<String> = {
        let guard = state.conn.lock().unwrap();
        let conn = guard.as_ref().ok_or("No project opened")?;
        let legacy_project_id = project_id
            .parse::<i64>()
            .ok()
            .or_else(|| {
                conn.query_row("SELECT id FROM v1_projects LIMIT 1", [], |row| row.get::<_, i64>(0))
                    .ok()
            })
            .or_else(|| {
                conn.query_row(
                    "SELECT project_id FROM project_folders WHERE project_id IS NOT NULL LIMIT 1",
                    [],
                    |row| row.get::<_, i64>(0),
                )
                .ok()
            });

        // We assume there's a table `project_folders` mapping a project to multiple root dirs
        if let Some(legacy_project_id) = legacy_project_id {
            let mut stmt = conn
                .prepare("SELECT CAST(folder_path AS TEXT) FROM project_folders WHERE project_id = ?1")
                .unwrap();

            stmt.query_map(rusqlite::params![legacy_project_id], |row| row.get(0))
                .unwrap()
                .filter_map(Result::ok)
                .collect()
        } else {
            Vec::new()
        }
    };

    let mut roots = Vec::new();
    for folder in folders {
        if let Ok(node) = build_tree(PathBuf::from(&folder), depth) {
            roots.push(node);
        }
    }

    // Fallback: If no folders configured, use the project path's parent directory
    if roots.is_empty() {
        if let Some(proj_path_str) = path {
            let proj_path = PathBuf::from(proj_path_str);
            if let Some(parent) = proj_path.parent() {
                if let Ok(node) = build_tree(parent.to_path_buf(), depth) {
                    roots.push(node);
                }
            }
        }
    }

    Ok(roots)
}

fn build_tree(path: PathBuf, depth: u32) -> Result<FileNode, std::io::Error> {
    let metadata = std::fs::metadata(&path)?;
    let name = path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let is_dir = metadata.is_dir();

    let mut children = None;
    let mut extension = None;

    if is_dir {
        if depth > 0 {
            let mut kids = Vec::new();
            if let Ok(entries) = std::fs::read_dir(&path) {
                for entry in entries.flatten() {
                    if let Ok(child_node) = build_tree(entry.path(), depth - 1) {
                        kids.push(child_node);
                    }
                }
            }
            // basic sort: dirs first, then alphabetical
            kids.sort_by(|a, b| match (a.is_dir, b.is_dir) {
                (true, false) => std::cmp::Ordering::Less,
                (false, true) => std::cmp::Ordering::Greater,
                _ => a.name.cmp(&b.name),
            });
            children = Some(kids);
        } else {
            // Provide empty children array to indicate it's a directory but not scanned
            children = Some(Vec::new());
        }
    } else {
        extension = path.extension().map(|e| e.to_string_lossy().to_string());
    }

    Ok(FileNode {
        name,
        path: path.to_string_lossy().to_string(),
        is_dir,
        extension: extension.unwrap_or_default(),
        children,
    })
}

#[tauri::command]
pub async fn move_fs_item(
    state: tauri::State<'_, DatabaseState>,
    source_path: String,
    target_parent_path: String,
) -> Result<(), String> {
    let source = PathBuf::from(&source_path);
    let target_parent = PathBuf::from(&target_parent_path);

    if !source.exists() {
        return Err("Tệp nguồn không tồn tại".to_string());
    }

    if !target_parent.exists() || !target_parent.is_dir() {
        return Err("Thư mục đích không hợp lệ".to_string());
    }

    let file_name = source
        .file_name()
        .ok_or_else(|| "Tên tệp không hợp lệ".to_string())?;
    let target = target_parent.join(file_name);

    if target.exists() {
        return Err("Tệp hoặc thư mục đã tồn tại ở vị trí đích".to_string());
    }

    // Perform the physical move
    std::fs::rename(&source, &target).map_err(|e| format!("Không thể di chuyển tệp: {}", e))?;

    // Update the database if the file/folder was tracked
    let guard = state.conn.lock().unwrap();
    if let Some(conn) = guard.as_ref() {
        let old_path = source.to_string_lossy().to_string();
        let new_path = target.to_string_lossy().to_string();

        // 1. Update files table
        let _ = conn.execute(
            "UPDATE files SET path = ?1, filename = ?2 WHERE path = ?3",
            rusqlite::params![
                new_path,
                target.file_name().unwrap().to_string_lossy().to_string(),
                old_path
            ],
        );

        // 2. Update project_folders if it was a root folder
        let _ = conn.execute(
            "UPDATE project_folders SET folder_path = ?1 WHERE folder_path = ?2",
            rusqlite::params![new_path, old_path],
        );

        // 3. Update tasks/notes that refer to this path
        let _ = conn.execute(
            "UPDATE tasks SET target_file_path = ?1 WHERE target_file_path = ?2",
            rusqlite::params![new_path, old_path],
        );
        let _ = conn.execute(
            "UPDATE notes SET target_file_path = ?1 WHERE target_file_path = ?2",
            rusqlite::params![new_path, old_path],
        );
    }

    Ok(())
}
