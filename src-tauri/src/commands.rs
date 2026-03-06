use crate::db::{DatabaseState, open_project_db, create_project_db};
use std::collections::HashMap;
use petgraph::algo::is_cyclic_directed;
use petgraph::graph::DiGraph;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Debug)]
pub struct Project {
    pub id: i32,
    pub name: String,
    pub path: String,
    pub description: Option<String>,
    pub status: String,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub extension: Option<String>,
    pub children: Option<Vec<FileNode>>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct TaskDependency {
    pub id: i32,
    pub from_task_id: i32,
    pub to_task_id: i32,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct Task {
    pub id: i32,
    pub project_id: i32,
    pub parent_id: Option<i32>,
    pub name: String,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub is_completed: bool,
    pub status: String,
    pub color: Option<String>,
    pub target_file_path: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct Note {
    pub id: i32,
    pub project_id: i32,
    pub title: String,
    pub content: Option<String>,
    pub target_file_path: Option<String>,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct Contract {
    pub id: i32,
    pub project_id: i32,
    pub name: String,
    pub contract_number: Option<String>,
    pub vendor: Option<String>,
    pub value: Option<f64>,
    pub signed_date: Option<String>,
    pub notes: Option<String>,
    pub created_at: String,
}

#[tauri::command]
pub fn get_contracts(state: tauri::State<DatabaseState>, project_id: i32) -> Result<Vec<Contract>, String> {
    let guard = state.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project opened")?;
    let mut stmt = conn.prepare("SELECT id, project_id, CAST(name AS TEXT), CAST(contract_number AS TEXT), CAST(vendor AS TEXT), value, CAST(signed_date AS TEXT), CAST(notes AS TEXT), CAST(created_at AS TEXT) FROM contracts WHERE project_id = ?1 ORDER BY created_at DESC").map_err(|e| e.to_string())?;
    
    let contracts_iter = stmt.query_map(rusqlite::params![project_id], |row| {
        Ok(Contract {
            id: row.get(0)?,
            project_id: row.get(1)?,
            name: row.get(2)?,
            contract_number: row.get(3)?,
            vendor: row.get(4)?,
            value: row.get(5)?,
            signed_date: row.get(6)?,
            notes: row.get(7)?,
            created_at: row.get(8)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for c in contracts_iter {
        if let Ok(contract) = c {
            result.push(contract);
        }
    }
    
    Ok(result)
}

#[tauri::command]
pub fn create_contract(state: tauri::State<DatabaseState>, project_id: i32, name: String, contract_number: Option<String>, vendor: Option<String>, value: Option<f64>, signed_date: Option<String>, notes: Option<String>) -> Result<i32, String> {
    let guard = state.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project opened")?;
    conn.execute(
        "INSERT INTO contracts (project_id, name, contract_number, vendor, value, signed_date, notes) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![project_id, name, contract_number, vendor, value, signed_date, notes],
    ).map_err(|e| e.to_string())?;
    
    Ok(conn.last_insert_rowid() as i32)
}

#[tauri::command]
pub fn delete_contract(state: tauri::State<DatabaseState>, contract_id: i32) -> Result<(), String> {
    let guard = state.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project opened")?;
    conn.execute(
        "DELETE FROM contracts WHERE id = ?1",
        rusqlite::params![contract_id],
    ).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
pub fn load_pmp_file(state: tauri::State<DatabaseState>, path: String) -> Result<(), String> {
    open_project_db(&state, PathBuf::from(path))
}

#[tauri::command]
pub fn create_pmp_file(state: tauri::State<DatabaseState>, path: String) -> Result<(), String> {
    create_project_db(&state, PathBuf::from(path))
}

#[tauri::command]
pub fn get_projects(state: tauri::State<DatabaseState>) -> Result<Vec<Project>, String> {
    let guard = state.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project opened")?;
    let mut stmt = conn.prepare("SELECT id, CAST(name AS TEXT), CAST(path AS TEXT), CAST(description AS TEXT), CAST(status AS TEXT), CAST(created_at AS TEXT) FROM projects ORDER BY id ASC").map_err(|e| e.to_string())?;
    
    let projects_iter = stmt.query_map([], |row| {
        Ok(Project {
            id: row.get(0)?,
            name: row.get(1)?,
            path: row.get(2)?,
            description: row.get(3)?,
            status: row.get(4)?,
            created_at: row.get(5)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for p in projects_iter {
        if let Ok(project) = p {
            result.push(project);
        }
    }
    
    Ok(result)
}

#[tauri::command]
pub fn create_project(state: tauri::State<'_, DatabaseState>, name: String, path: String, description: Option<String>) -> Result<i32, String> {
    // Validate path exists before saving
    let p = PathBuf::from(&path);
    if !p.exists() {
        if let Some(parent) = p.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
    }
    
    let root_path = p.parent().unwrap_or(std::path::Path::new("")).to_string_lossy().to_string();

    let guard = state.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project opened")?;
    conn.execute(
        "INSERT INTO projects (name, root_path, path, description) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![name, root_path, path, description],
    ).map_err(|e| e.to_string())?;
    
    Ok(conn.last_insert_rowid() as i32)
}

#[tauri::command]
pub fn get_tasks(state: tauri::State<DatabaseState>, project_id: i32) -> Result<Vec<Task>, String> {
    let guard = state.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project opened")?;
    let mut stmt = conn.prepare("SELECT id, project_id, parent_id, CAST(name AS TEXT), CAST(start_date AS TEXT), CAST(end_date AS TEXT), is_completed, CAST(status AS TEXT), CAST(color AS TEXT), CAST(target_file_path AS TEXT) FROM tasks WHERE project_id = ?1 ORDER BY start_date ASC").map_err(|e| e.to_string())?;
    
    let tasks_iter = stmt.query_map(rusqlite::params![project_id], |row| {
        Ok(Task {
            id: row.get(0)?,
            project_id: row.get(1)?,
            parent_id: row.get(2)?,
            name: row.get(3)?,
            start_date: row.get(4)?,
            end_date: row.get(5)?,
            is_completed: row.get(6)?,
            status: row.get(7)?,
            color: row.get(8)?,
            target_file_path: row.get(9)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for t in tasks_iter {
        if let Ok(task) = t {
            result.push(task);
        }
    }
    
    Ok(result)
}

#[tauri::command]
pub fn create_task(state: tauri::State<DatabaseState>, project_id: i32, parent_id: Option<i32>, name: String, start_date: Option<String>, end_date: Option<String>, color: Option<String>, status: Option<String>) -> Result<i32, String> {
    let guard = state.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project opened")?;
    let st = status.unwrap_or_else(|| "todo".to_string());
    conn.execute(
        "INSERT INTO tasks (project_id, parent_id, name, start_date, end_date, status, color) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![project_id, parent_id, name, start_date, end_date, st, color],
    ).map_err(|e| e.to_string())?;
    
    Ok(conn.last_insert_rowid() as i32)
}

#[tauri::command]
pub fn toggle_task(state: tauri::State<DatabaseState>, task_id: i32, is_completed: bool) -> Result<(), String> {
    let guard = state.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project opened")?;
    conn.execute(
        "UPDATE tasks SET is_completed = ?1 WHERE id = ?2",
        rusqlite::params![is_completed, task_id],
    ).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
pub fn update_task_status(state: tauri::State<DatabaseState>, task_id: i32, status: String) -> Result<(), String> {
    let guard = state.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project opened")?;
    conn.execute(
        "UPDATE tasks SET status = ?1 WHERE id = ?2",
        rusqlite::params![status, task_id],
    ).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
pub fn update_task_dates(state: tauri::State<DatabaseState>, task_id: i32, start_date: Option<String>, end_date: Option<String>) -> Result<(), String> {
    let guard = state.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project opened")?;
    conn.execute(
        "UPDATE tasks SET start_date = ?1, end_date = ?2 WHERE id = ?3",
        rusqlite::params![start_date, end_date, task_id],
    ).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
pub fn update_task_parent(state: tauri::State<DatabaseState>, task_id: i32, parent_id: Option<i32>) -> Result<(), String> {
    let guard = state.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project opened")?;
    conn.execute(
        "UPDATE tasks SET parent_id = ?1 WHERE id = ?2",
        rusqlite::params![parent_id, task_id],
    ).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
pub fn get_project_tree(state: tauri::State<DatabaseState>, project_id: i32, path: String) -> Result<Vec<FileNode>, String> {
    let mut root_paths: Vec<PathBuf> = Vec::new();
    
    // Attempt to read from project_folders table for legacy C# compatibility
    if let Ok(guard) = state.conn.lock() {
        if let Some(conn) = guard.as_ref() {
            if let Ok(mut stmt) = conn.prepare("SELECT CAST(folder_path AS TEXT) FROM project_folders WHERE project_id = ?1") {
                let folders_iter = stmt.query_map(rusqlite::params![project_id], |row| row.get::<_, String>(0));
                if let Ok(iter) = folders_iter {
                    for f in iter.flatten() {
                        let p = PathBuf::from(f);
                        if p.exists() && p.is_dir() {
                            root_paths.push(p);
                        }
                    }
                }
            }
        }
    }

    if root_paths.is_empty() {
        let mut pmp_path = PathBuf::from(&path);
        if pmp_path.is_file() {
            if let Some(parent) = pmp_path.parent() {
                pmp_path = parent.to_path_buf();
            }
        }
        if pmp_path.exists() && pmp_path.is_dir() {
            root_paths.push(pmp_path);
        }
    }

    fn build_tree(dir: &std::path::Path, current_depth: usize, max_depth: usize) -> Vec<FileNode> {
        let mut nodes = Vec::new();
        if current_depth > max_depth {
            return nodes;
        }

        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                let name = entry.file_name().to_string_lossy().to_string();
                
                // Ignore hidden files / folders and common heavy folders
                if name.starts_with('.') || name == "node_modules" || name == "target" || name == "System Volume Information" {
                    continue;
                }

                let is_dir = path.is_dir();
                let extension = path.extension().map(|e| e.to_string_lossy().to_string());
                
                let mut children = None;
                if is_dir {
                    let sub_nodes = build_tree(&path, current_depth + 1, max_depth);
                    children = Some(sub_nodes);
                }

                nodes.push(FileNode {
                    name,
                    path: path.to_string_lossy().to_string(),
                    is_dir,
                    extension,
                    children,
                });
            }
        }
        
        // Sort folders first, then files
        nodes.sort_by(|a, b| {
            b.is_dir.cmp(&a.is_dir).then(a.name.cmp(&b.name))
        });
        
        nodes
    }

    let mut result_nodes = Vec::new();
    for root in root_paths {
        let name = root.file_name().unwrap_or_default().to_string_lossy().to_string();
        result_nodes.push(FileNode {
            name,
            path: root.to_string_lossy().to_string(),
            is_dir: true,
            extension: None,
            children: Some(build_tree(&root, 0, 5)),
        });
    }

    Ok(result_nodes)
}

#[tauri::command]
pub fn add_project_folder(state: tauri::State<DatabaseState>, project_id: i32, folder_path: String) -> Result<i32, String> {
    let guard = state.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project opened")?;
    conn.execute(
        "INSERT INTO project_folders (project_id, folder_path) VALUES (?1, ?2)",
        rusqlite::params![project_id, folder_path],
    ).map_err(|e| e.to_string())?;
    
    Ok(conn.last_insert_rowid() as i32)
}

#[tauri::command]
pub fn remove_project_folder(state: tauri::State<DatabaseState>, project_id: i32, folder_path: String) -> Result<(), String> {
    let guard = state.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project opened")?;
    conn.execute(
        "DELETE FROM project_folders WHERE project_id = ?1 AND folder_path = ?2",
        rusqlite::params![project_id, folder_path],
    ).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
pub fn get_task_dependencies(state: tauri::State<DatabaseState>, project_id: i32) -> Result<Vec<TaskDependency>, String> {
    let guard = state.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project opened")?;
    let mut stmt = conn.prepare("
        SELECT td.id, td.from_task_id, td.to_task_id 
        FROM task_dependencies td
        JOIN tasks t ON t.id = td.from_task_id
        WHERE t.project_id = ?1
    ").map_err(|e| e.to_string())?;
    
    let deps_iter = stmt.query_map(rusqlite::params![project_id], |row| {
        Ok(TaskDependency {
            id: row.get(0)?,
            from_task_id: row.get(1)?,
            to_task_id: row.get(2)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for d in deps_iter {
        if let Ok(dep) = d {
            result.push(dep);
        }
    }
    
    Ok(result)
}

#[tauri::command]
pub fn add_task_dependency(state: tauri::State<DatabaseState>, project_id: i32, from_task_id: i32, to_task_id: i32) -> Result<i32, String> {
    let guard = state.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project opened")?;
    
    // Safety check: Fetch all existing dependencies for this project
    let mut stmt = conn.prepare("
        SELECT td.from_task_id, td.to_task_id 
        FROM task_dependencies td
        JOIN tasks t ON t.id = td.from_task_id
        WHERE t.project_id = ?1
    ").map_err(|e| e.to_string())?;
    
    let deps_iter = stmt.query_map(rusqlite::params![project_id], |row| {
        let from_id: i32 = row.get(0)?;
        let to_id: i32 = row.get(1)?;
        Ok((from_id, to_id))
    }).map_err(|e| e.to_string())?;
    
    let mut deps: Vec<(i32, i32)> = deps_iter.filter_map(|r| r.ok()).collect();
    
    // Add the proposed dependency
    deps.push((from_task_id, to_task_id));
    
    // Build DiGraph and check for cycles using petgraph
    let mut graph = DiGraph::<i32, ()>::new();
    let mut node_indices = HashMap::new();
    
    for (f, t) in deps {
        let n_f = *node_indices.entry(f).or_insert_with(|| graph.add_node(f));
        let n_t = *node_indices.entry(t).or_insert_with(|| graph.add_node(t));
        graph.add_edge(n_f, n_t, ());
    }
    
    if is_cyclic_directed(&graph) {
        return Err("Cannot add dependency: It would create a cycle!".to_string());
    }
    
    // If no cycle, insert to DB
    conn.execute(
        "INSERT INTO task_dependencies (from_task_id, to_task_id) VALUES (?1, ?2)",
        rusqlite::params![from_task_id, to_task_id],
    ).map_err(|e| e.to_string())?;
    
    Ok(conn.last_insert_rowid() as i32)
}

#[derive(Serialize, Deserialize, Debug)]
pub struct SearchResult {
    pub file_path: String,
    pub title: String,
    pub snippet: String,
}

#[tauri::command]
pub async fn index_document(state: tauri::State<'_, DatabaseState>, file_path: String, title: String) -> Result<(), String> {
    use crate::doc_parser::extract_text;
    
    let p = PathBuf::from(&file_path);
    let content = extract_text(&p).unwrap_or_else(|_| "".to_string());
    
    let guard = state.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project opened")?;
    conn.execute(
        "INSERT INTO file_search (file_path, title, content) VALUES (?1, ?2, ?3)",
        rusqlite::params![file_path, title, content],
    ).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
pub fn search_documents(state: tauri::State<'_, DatabaseState>, query: String) -> Result<Vec<SearchResult>, String> {
    let guard = state.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project opened")?;
    
    // Sanitize query and prepare for FTS5 prefix search
    let sanitized_query = query.replace("\"", "").replace("'", "");
    let fts_query: String = sanitized_query.split_whitespace()
        .map(|w| format!("\"{}\"*", w))
        .collect::<Vec<_>>()
        .join(" AND ");
        
    let mut stmt = conn.prepare("
        SELECT file_path, title, snippet(file_search, 2, '<b>', '</b>', '...', 32)
        FROM file_search 
        WHERE file_search MATCH ?1
        ORDER BY rank
        LIMIT 20
    ").map_err(|e| e.to_string())?;
    
    let rows_iter = stmt.query_map(rusqlite::params![fts_query], |row| {
        Ok(SearchResult {
            file_path: row.get(0)?,
            title: row.get(1)?,
            snippet: row.get(2)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for r in rows_iter {
        if let Ok(sr) = r {
            result.push(sr);
        }
    }
    
    Ok(result)
}

#[tauri::command]
pub fn read_file_content(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read file: {}", e))
}

#[tauri::command]
pub fn predict_task(task_name: String) -> Result<i32, String> {
    use crate::ml::predict_task_duration;
    Ok(predict_task_duration(&task_name))
}

#[tauri::command]
pub async fn index_project_files(state: tauri::State<'_, DatabaseState>, path: String) -> Result<(), String> {
    use crate::doc_parser::extract_text;
    use walkdir::WalkDir;
    
    let root_path = PathBuf::from(&path);
    if !root_path.exists() || !root_path.is_dir() {
        return Err("Project path is invalid".to_string());
    }
    
    // Clear existing index
    {
        let guard = state.conn.lock().unwrap();
        if let Some(conn) = guard.as_ref() {
            let _ = conn.execute("DELETE FROM file_search", []);
        }
    }
    
    let mut files_to_extract = Vec::new();
    
    // Pass 1: Instantly index all files by their title and path, with empty content
    for entry in WalkDir::new(&path).into_iter().filter_map(|e| e.ok()) {
        let p = entry.path();
        if p.is_file() {
            let ext = p.extension().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
            if ["doc", "docx", "xls", "xlsx", "csv", "pdf", "txt", "md"].contains(&ext.as_str()) {
                let title = entry.file_name().to_string_lossy().to_string();
                let file_path = p.to_string_lossy().to_string();
                
                if file_path.contains("node_modules") || file_path.contains("target") || file_path.contains(".git") {
                    continue;
                }
                
                if !title.is_empty() {
                    let rowid = {
                        let guard = state.conn.lock().unwrap();
                        if let Some(conn) = guard.as_ref() {
                            let _ = conn.execute(
                                "INSERT INTO file_search (file_path, title, content) VALUES (?1, ?2, '')",
                                rusqlite::params![file_path, title],
                            );
                            conn.last_insert_rowid()
                        } else {
                            continue;
                        }
                    };
                    files_to_extract.push((rowid, p.to_path_buf()));
                }
            }
        }
    }
    
    // Pass 2: Extract text contents in background and update the database entries
    for (rowid, p) in files_to_extract {
        let content = extract_text(&p).unwrap_or_default();
        if !content.is_empty() {
            let guard = state.conn.lock().unwrap();
            if let Some(conn) = guard.as_ref() {
                let _ = conn.execute(
                    "UPDATE file_search SET content = ?1 WHERE rowid = ?2",
                    rusqlite::params![content, rowid],
                );
            }
        }
    }
    
    Ok(())
}

#[tauri::command]
pub fn preview_document_text(path: String) -> Result<String, String> {
    use crate::doc_parser::extract_text;
    extract_text(&PathBuf::from(path)).map_err(|e| format!("Preview parsing failed: {}", e))
}

#[tauri::command]
pub fn get_notes(state: tauri::State<'_, DatabaseState>, project_id: i32) -> Result<Vec<Note>, String> {
    let guard = state.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project opened")?;
    let mut stmt = conn.prepare("SELECT id, project_id, CAST(title AS TEXT), CAST(content AS TEXT), CAST(target_file_path AS TEXT), CAST(created_at AS TEXT) FROM notes WHERE project_id = ?1 ORDER BY created_at DESC").map_err(|e| e.to_string())?;
    
    let notes_iter = stmt.query_map(rusqlite::params![project_id], |row| {
        Ok(Note {
            id: row.get(0)?,
            project_id: row.get(1)?,
            title: row.get(2)?,
            content: row.get(3)?,
            target_file_path: row.get(4)?,
            created_at: row.get(5)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for n in notes_iter {
        if let Ok(note) = n {
            result.push(note);
        }
    }
    Ok(result)
}

#[tauri::command]
pub fn create_note(state: tauri::State<'_, DatabaseState>, project_id: i32, title: String, content: Option<String>, target_file_path: Option<String>) -> Result<i32, String> {
    let guard = state.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project opened")?;
    conn.execute(
        "INSERT INTO notes (project_id, title, content, target_file_path) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![project_id, title, content, target_file_path],
    ).map_err(|e| e.to_string())?;
    
    Ok(conn.last_insert_rowid() as i32)
}

#[tauri::command]
pub fn delete_note(state: tauri::State<'_, DatabaseState>, note_id: i32) -> Result<(), String> {
    let guard = state.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project opened")?;
    conn.execute(
        "DELETE FROM notes WHERE id = ?1",
        rusqlite::params![note_id],
    ).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
pub fn assign_file_to_task(state: tauri::State<'_, DatabaseState>, task_id: i32, file_path: String) -> Result<(), String> {
    let guard = state.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project opened")?;
    conn.execute(
        "UPDATE tasks SET target_file_path = ?1 WHERE id = ?2",
        rusqlite::params![file_path, task_id],
    ).map_err(|e| e.to_string())?;
    
    Ok(())
}

