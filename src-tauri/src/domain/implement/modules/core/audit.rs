use rusqlite::{params, Connection};
use serde_json::Value;

/// Record an audit log entry into the database.
/// Also prints to console if running in debug mode.
#[allow(clippy::too_many_arguments)]
pub fn log_event(
    conn: &Connection,
    project_id: &str,
    user_id: Option<String>,
    action_type: &str,
    table_name: &str,
    record_id: &str,
    old_values: Option<Value>,
    new_values: Option<Value>,
) -> Result<(), String> {
    let old_json = old_values.map(|v| v.to_string());
    let new_json = new_values.map(|v| v.to_string());

    // 1. Console Log (Only in DEV)
    #[cfg(debug_assertions)]
    {
        println!("--- AUDIT LOG ---");
        println!("Action: {}", action_type);
        println!("Table: {}", table_name);
        println!("Record ID: {}", record_id);
        if let Some(ref o) = old_json {
            println!("Old: {}", o);
        }
        if let Some(ref n) = new_json {
            println!("New: {}", n);
        }
        println!("-----------------");
    }

    // 2. Database Log
    conn.execute(
        "INSERT INTO audit_logs (
            project_id, user_id, action_type, table_name, record_id, 
            old_values_json, new_values_json, timestamp
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, CURRENT_TIMESTAMP)",
        params![
            project_id,
            user_id,
            action_type,
            table_name,
            record_id,
            old_json,
            new_json
        ],
    )
    .map_err(|e| format!("Failed to write audit log: {}", e))?;

    Ok(())
}

/// New version with user_email support
#[allow(clippy::too_many_arguments)]
pub fn log_event_with_user(
    conn: &Connection,
    project_id: &str,
    user_id: Option<String>,
    user_email: Option<String>,
    action_type: &str,
    table_name: &str,
    record_id: &str,
    old_values: Option<Value>,
    new_values: Option<Value>,
) -> Result<(), String> {
    let old_json = old_values.map(|v| v.to_string());
    let new_json = new_values.map(|v| v.to_string());

    conn.execute(
        "INSERT INTO audit_logs (
            project_id, user_id, user_email, action_type, table_name, record_id, 
            old_values_json, new_values_json, timestamp
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, CURRENT_TIMESTAMP)",
        params![
            project_id,
            user_id,
            user_email,
            action_type,
            table_name,
            record_id,
            old_json,
            new_json
        ],
    )
    .map_err(|e| format!("Failed to write audit log with user: {}", e))?;

    Ok(())
}
