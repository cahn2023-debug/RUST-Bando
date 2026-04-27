use crate::domain::implement::modules::v2::events::AppEvent;
use serde_json::json;
use crate::implement::modules::core::active_pmp::ActivePmpState;
use crate::implement::modules::core::auth_guard::{self, Role};
use crate::implement::modules::core::config::ConfigState;

use rusqlite::params;
use uuid::Uuid;

use super::models::{Task, TaskDependency};
use crate::implement::commands::helpers::{
    active_v2_sender, project_id_to_uuid, send_v2_event,
};

#[tauri::command]
pub fn get_tasks(
    active_pmp: tauri::State<ActivePmpState>,
    #[allow(non_snake_case)] projectId: String,
) -> Result<Vec<Task>, String> {
    let v2_ext = active_pmp.db_v2.load();
    let v2_db = match v2_ext.as_ref() {
        Some(db) => db,
        None => return Ok(Vec::new()),
    };
    let conn = v2_db.conn.lock();
    
    let mut stmt = conn
        .prepare(
            "SELECT id, project_id, parent_id, name, start_date, end_date, is_completed, status, color, target_file_path
             FROM tasks
             WHERE project_id = ?1
             ORDER BY start_date ASC",
        )
        .map_err(|e| e.to_string())?;

    let tasks_iter = stmt
        .query_map(params![projectId], |row| {
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
        })
        .map_err(|e| e.to_string())?;

    let mut tasks = Vec::new();
    for task_result in tasks_iter {
        tasks.push(task_result.map_err(|e| e.to_string())?);
    }
    Ok(tasks)
}

#[tauri::command]
pub fn get_task_dependencies(
    active_pmp: tauri::State<ActivePmpState>,
    #[allow(non_snake_case)] _projectId: String,
) -> Result<Vec<TaskDependency>, String> {
    let v2_ext = active_pmp.db_v2.load();
    let v2_db = match v2_ext.as_ref() {
        Some(db) => db,
        None => return Ok(Vec::new()),
    };
    let conn = v2_db.conn.lock();

    let mut stmt = conn
        .prepare(
            "SELECT id, from_task_id, to_task_id
             FROM task_links
             WHERE link_type = 'depends_on'",
        )
        .map_err(|e| e.to_string())?;

    let deps_iter = stmt
        .query_map([], |row| {
            Ok(TaskDependency {
                id: row.get(0)?,
                from_task_id: row.get(1)?,
                to_task_id: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut deps = Vec::new();
    for dep_result in deps_iter {
        deps.push(dep_result.map_err(|e| e.to_string())?);
    }
    Ok(deps)
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn create_task(
    config_state: tauri::State<'_, ConfigState>,
    active_pmp: tauri::State<'_, ActivePmpState>,
    #[allow(non_snake_case)] projectId: String,
    #[allow(non_snake_case)] parentId: Option<String>,
    name: String,
    #[allow(non_snake_case)] startDate: Option<String>,
    #[allow(non_snake_case)] endDate: Option<String>,
    color: Option<String>,
    status: Option<String>,
) -> Result<String, String> {
    let sender = active_v2_sender(&active_pmp)?;
    let user_email = auth_guard::get_current_user_email(&config_state);
    let st = status.unwrap_or_else(|| "todo".to_string());
    let entity_id = Uuid::new_v4();
    let proj_uuid = project_id_to_uuid(&projectId)?;
    let parent_uuid = parentId.as_deref().and_then(|id| Uuid::parse_str(id).ok());

    let event = AppEvent::TaskCreated {
        name: name.clone(),
        parent_id: parent_uuid,
        metadata: json!({
            "start_date": startDate,
            "end_date": endDate,
            "color": color,
            "status": st,
            "user": user_email,
        }),
    };

    send_v2_event(&sender, proj_uuid, "task", entity_id, event).await?;
    Ok(entity_id.to_string())
}

#[tauri::command]
pub async fn toggle_task(
    active_pmp: tauri::State<'_, ActivePmpState>,
    #[allow(non_snake_case)] taskId: String,
    is_completed: bool,
) -> Result<(), String> {
    let sender = active_v2_sender(&active_pmp)?;
    let project_id = active_pmp.project_id_string()?;
    let proj_uuid = project_id_to_uuid(&project_id)?;
    let entity_uuid = Uuid::parse_str(&taskId).map_err(|e| e.to_string())?;

    send_v2_event(&sender, proj_uuid, "task", entity_uuid, AppEvent::TaskUpdated {
        changes: json!({ "is_completed": is_completed }),
    }).await?;

    Ok(())
}

#[tauri::command]
pub async fn update_task_status(
    active_pmp: tauri::State<'_, ActivePmpState>,
    config_state: tauri::State<'_, ConfigState>,
    #[allow(non_snake_case)] taskId: String,
    status: String,
) -> Result<(), String> {
    let sender = active_v2_sender(&active_pmp)?;
    let user_email = auth_guard::get_current_user_email(&config_state);
    let project_id = active_pmp.project_id_string()?;
    let proj_uuid = project_id_to_uuid(&project_id)?;
    let entity_uuid = Uuid::parse_str(&taskId).map_err(|e| e.to_string())?;

    send_v2_event(&sender, proj_uuid, "task", entity_uuid, AppEvent::TaskUpdated {
        changes: json!({ "status": status.clone(), "user": user_email }),
    }).await?;

    Ok(())
}

#[tauri::command]
pub async fn delete_task(
    active_pmp: tauri::State<'_, ActivePmpState>,
    config_state: tauri::State<'_, ConfigState>,
    #[allow(non_snake_case)] taskId: String,
) -> Result<(), String> {
    let sender = active_v2_sender(&active_pmp)?;
    let _user_email = auth_guard::check_permission(&config_state, Role::ProjectManager)?;
    let project_id = active_pmp.project_id_string()?;
    let proj_uuid = project_id_to_uuid(&project_id)?;
    let entity_uuid = Uuid::parse_str(&taskId).map_err(|e| e.to_string())?;

    send_v2_event(&sender, proj_uuid, "task", entity_uuid, AppEvent::TaskDeleted {
        id: entity_uuid,
        project_id: proj_uuid,
    }).await?;
    Ok(())
}

#[tauri::command]
pub async fn add_task_dependency(
    active_pmp: tauri::State<'_, ActivePmpState>,
    #[allow(non_snake_case)] _projectId: String,
    #[allow(non_snake_case)] fromTaskId: String,
    #[allow(non_snake_case)] toTaskId: String,
) -> Result<String, String> {
    let sender = active_v2_sender(&active_pmp)?;
    let project_id_str = active_pmp.project_id_string()?;
    let proj_uuid = project_id_to_uuid(&project_id_str)?;

    let from_uuid = Uuid::parse_str(&fromTaskId).map_err(|e| e.to_string())?;
    let to_uuid = Uuid::parse_str(&toTaskId).map_err(|e| e.to_string())?;

    send_v2_event(&sender, proj_uuid, "task", from_uuid, AppEvent::TaskLinked {
        id: from_uuid,
        target_id: to_uuid,
    }).await?;

    Ok(format!("{}-{}", fromTaskId, toTaskId))
}

#[tauri::command]
pub fn predict_task(#[allow(non_snake_case)] _taskName: String) -> Result<i32, String> {
    Ok(0)
}

#[tauri::command]
pub async fn update_task_dates(
    active_pmp: tauri::State<'_, ActivePmpState>,
    #[allow(non_snake_case)] taskId: String,
    #[allow(non_snake_case)] startDate: Option<String>,
    #[allow(non_snake_case)] endDate: Option<String>,
) -> Result<(), String> {
    let sender = active_v2_sender(&active_pmp)?;
    let project_id = active_pmp.project_id_string()?;
    let proj_uuid = project_id_to_uuid(&project_id)?;
    let entity_uuid = Uuid::parse_str(&taskId).map_err(|e| e.to_string())?;

    send_v2_event(&sender, proj_uuid, "task", entity_uuid, AppEvent::TaskUpdated {
        changes: json!({ "start_date": startDate, "end_date": endDate }),
    }).await?;

    Ok(())
}

#[tauri::command]
pub async fn update_task_parent(
    active_pmp: tauri::State<'_, ActivePmpState>,
    #[allow(non_snake_case)] taskId: String,
    #[allow(non_snake_case)] parentId: Option<String>,
) -> Result<(), String> {
    let sender = active_v2_sender(&active_pmp)?;
    let project_id = active_pmp.project_id_string()?;
    let proj_uuid = project_id_to_uuid(&project_id)?;
    let entity_uuid = Uuid::parse_str(&taskId).map_err(|e| e.to_string())?;

    send_v2_event(&sender, proj_uuid, "task", entity_uuid, AppEvent::TaskUpdated {
        changes: json!({ "parent_id": parentId }),
    }).await?;

    Ok(())
}

#[tauri::command]
pub async fn assign_file_to_task(
    active_pmp: tauri::State<'_, ActivePmpState>,
    #[allow(non_snake_case)] taskId: String,
    #[allow(non_snake_case)] filePath: String,
) -> Result<(), String> {
    let sender = active_v2_sender(&active_pmp)?;
    let project_id = active_pmp.project_id_string()?;
    let proj_uuid = project_id_to_uuid(&project_id)?;
    let entity_uuid = Uuid::parse_str(&taskId).map_err(|e| e.to_string())?;

    send_v2_event(&sender, proj_uuid, "task", entity_uuid, AppEvent::TaskUpdated {
        changes: json!({ "target_file_path": filePath }),
    }).await?;

    Ok(())
}
