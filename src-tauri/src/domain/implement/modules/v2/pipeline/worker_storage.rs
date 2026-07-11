use crate::domain::implement::modules::v2::pipeline::eventbus::StorageCommand;
use crate::domain::implement::modules::v2::storage::connection::PmpDatabase;
use crate::domain::implement::modules::v2::storage::path_meta::compute_rel_path;
use crate::domain::models::v2::{AppEvent, EventEnvelope};
use rusqlite::{params, OptionalExtension, Transaction};
use serde_json::{json, Value};
use std::panic::{catch_unwind, AssertUnwindSafe};
use tokio::sync::mpsc;

#[derive(Debug)]
pub struct StorageWorker {
    rx: mpsc::Receiver<StorageCommand>,
    db: PmpDatabase,
}

impl StorageWorker {
    pub fn spawn(
        rx: mpsc::Receiver<StorageCommand>,
        db: PmpDatabase,
    ) -> tauri::async_runtime::JoinHandle<()> {
        tauri::async_runtime::spawn(async move {
            let mut worker = Self { rx, db };
            while let Some(cmd) = worker.rx.recv().await {
                let mut batch = vec![cmd];
                while batch.len() < 100 {
                    match worker.rx.try_recv() {
                        Ok(next) => {
                            if matches!(
                                next,
                                StorageCommand::Query { .. }
                                    | StorageCommand::OpenDatabase { .. }
                                    | StorageCommand::DispatchEvents { .. }
                                    | StorageCommand::UpdateProjectState { .. }
                                    | StorageCommand::SaveProject { .. }
                                    | StorageCommand::BackupProject { .. }
                                    | StorageCommand::ListBackups { .. }
                                    | StorageCommand::RestoreProject { .. }
                                    | StorageCommand::VerifyIntegrity { .. }
                                    | StorageCommand::GetProjectHealth { .. }
                            ) {
                                worker.execute_batch(batch).await;
                                worker.execute(next).await;
                                batch = vec![];
                                break;
                            }
                            batch.push(next);
                        }
                        Err(_) => break,
                    }
                }
                if !batch.is_empty() {
                    worker.execute_batch(batch).await;
                }
            }
        })
    }

    async fn execute(&mut self, cmd: StorageCommand) {
        match cmd {
            StorageCommand::OpenDatabase { path, reply } => {
                log::info!("[StorageWorker] Switching database to: {:?}", path);
                let result = match PmpDatabase::open_or_create(path) {
                    Ok(new_db) => {
                        self.db = new_db;
                        Ok(())
                    }
                    Err(e) => Err(e.to_string()),
                };
                let _ = reply.send(result);
            }
            StorageCommand::Query {
                sql,
                params: p,
                reply,
            } => {
                let res = self.query(&sql, p);
                let _ = reply.send(res);
            }
            StorageCommand::DispatchEvents { events, reply } => {
                let res = catch_unwind(AssertUnwindSafe(|| self.dispatch_events(events)))
                    .map_err(panic_to_string)
                    .and_then(|result| result);
                let _ = reply.send(res);
            }
            StorageCommand::UpdateProjectState {
                project_id,
                state,
                reply,
            } => {
                let res = catch_unwind(AssertUnwindSafe(|| {
                    self.replace_project_state(&project_id, &state)
                }))
                .map_err(panic_to_string)
                .and_then(|result| result);
                let _ = reply.send(res);
            }
            StorageCommand::SaveProject { reply } => {
                log::info!("[StorageWorker] Saving project (Checkpointing WAL)...");
                let res = catch_unwind(AssertUnwindSafe(|| {
                    self.db
                        .conn
                        .execute_batch("PRAGMA wal_checkpoint(PASSIVE);")
                        .map_err(|e| e.to_string())
                }))
                .map_err(panic_to_string)
                .and_then(|result| result);
                let _ = reply.send(res);
            }
            StorageCommand::BackupProject { project_id, reply } => {
                let _ = reply.send(self.db.backup_project(&project_id));
            }
            StorageCommand::ListBackups { project_id, reply } => {
                let _ = reply.send(self.db.list_backups(&project_id));
            }
            StorageCommand::RestoreProject {
                project_id,
                backup_id,
                reply,
            } => {
                let backup_path = self
                    .db
                    .base_dir
                    .join("backups")
                    .join(&project_id)
                    .join(format!("{backup_id}.pmp"));
                let restore_path = self.db.base_dir.join(format!(
                    "{project_id}_restored_{}.pmp",
                    chrono::Local::now().format("%Y%m%d_%H%M%S")
                ));
                let res = (|| -> Result<Value, String> {
                    if !backup_path.exists() {
                        return Err(format!("Backup not found: {}", backup_path.display()));
                    }
                    std::fs::copy(&backup_path, &restore_path).map_err(|e| e.to_string())?;
                    let new_db = PmpDatabase::open_or_create(restore_path.clone())
                        .map_err(|e| e.to_string())?;
                    self.db = new_db;
                    self.db
                        .conn
                        .execute(
                            "INSERT OR REPLACE INTO sys_config(key, value) VALUES('last_restore_test_at', ?1)",
                            [chrono::Local::now().to_rfc3339()],
                        )
                        .map_err(|e| e.to_string())?;
                    Ok(json!({
                        "status": "restored",
                        "activePath": restore_path.to_string_lossy().to_string(),
                        "sourceBackup": backup_path.to_string_lossy().to_string(),
                        "restoredAt": chrono::Local::now().to_rfc3339(),
                    }))
                })();
                let _ = reply.send(res);
            }
            StorageCommand::VerifyIntegrity { reply } => {
                let res = self
                    .db
                    .verify_integrity()
                    .map_err(|e| e.to_string())
                    .and_then(|msg| {
                        self.db
                            .conn
                            .execute(
                                "INSERT OR REPLACE INTO sys_config(key, value) VALUES('last_integrity_check_at', ?1)",
                                [chrono::Local::now().to_rfc3339()],
                            )
                            .map_err(|e| e.to_string())?;
                        Ok(json!({
                            "status": if msg == "ok" { "ok" } else { "failed" },
                            "message": msg,
                            "checkedAt": chrono::Local::now().to_rfc3339(),
                        }))
                    });
                let _ = reply.send(res);
            }
            StorageCommand::GetProjectHealth { project_id, reply } => {
                let res = (|| -> Result<Value, String> {
                    let wal_path = self.db.pmp_path.with_extension("pmp-wal");
                    let wal_size = std::fs::metadata(&wal_path).map(|m| m.len()).unwrap_or(0);
                    let integrity = self.db.verify_integrity().map_err(|e| e.to_string())?;
                    let backups = self.db.list_backups(&project_id)?;
                    let last_backup_at: Option<String> = self
                        .db
                        .conn
                        .query_row(
                            "SELECT value FROM sys_config WHERE key='last_backup_at'",
                            [],
                            |r| r.get(0),
                        )
                        .ok();
                    let last_integrity_check_at: Option<String> = self
                        .db
                        .conn
                        .query_row(
                            "SELECT value FROM sys_config WHERE key='last_integrity_check_at'",
                            [],
                            |r| r.get(0),
                        )
                        .ok();
                    let last_restore_test_at: Option<String> = self
                        .db
                        .conn
                        .query_row(
                            "SELECT value FROM sys_config WHERE key='last_restore_test_at'",
                            [],
                            |r| r.get(0),
                        )
                        .ok();
                    Ok(json!({
                        "projectId": project_id,
                        "databasePath": self.db.pmp_path.to_string_lossy().to_string(),
                        "walSizeBytes": wal_size,
                        "integrityStatus": if integrity == "ok" { "ok" } else { "failed" },
                        "lastBackupAt": last_backup_at,
                        "lastIntegrityCheckAt": last_integrity_check_at,
                        "lastRestoreTestAt": last_restore_test_at,
                        "backupCount": backups.as_array().map(|a| a.len()).unwrap_or(0),
                        "checkedAt": chrono::Local::now().to_rfc3339(),
                    }))
                })();
                let _ = reply.send(res);
            }
            _ => {
                if let Err(e) = self.commit_tx_batch(vec![cmd]) {
                    log::error!("[StorageWorker] Batch transaction error: {}", e);
                }
            }
        }
    }

    async fn execute_batch(&mut self, commands: Vec<StorageCommand>) {
        if commands.is_empty() {
            return;
        }
        if commands.len() == 1 {
            let cmd = &commands[0];
            if matches!(
                cmd,
                StorageCommand::Query { .. }
                    | StorageCommand::OpenDatabase { .. }
                    | StorageCommand::DispatchEvents { .. }
                    | StorageCommand::UpdateProjectState { .. }
                    | StorageCommand::SaveProject { .. }
                    | StorageCommand::BackupProject { .. }
                    | StorageCommand::ListBackups { .. }
                    | StorageCommand::RestoreProject { .. }
                    | StorageCommand::VerifyIntegrity { .. }
                    | StorageCommand::GetProjectHealth { .. }
            ) {
                self.execute(commands.into_iter().next().expect("single command"))
                    .await;
                return;
            }
        }
        if let Err(e) = self.commit_tx_batch(commands) {
            log::error!("[StorageWorker] Batch transaction error: {}", e);
        }
    }

    fn dispatch_events(&mut self, events: Vec<EventEnvelope>) -> Result<usize, String> {
        let tx = self.db.conn.transaction().map_err(|e| e.to_string())?;
        let mut persisted_count = 0usize;
        let mut touched_projects = std::collections::BTreeSet::new();
        for envelope in events {
            let project_id = envelope.project_id.to_string();
            persist_event(&tx, &envelope)?;
            apply_event_to_read_models(&tx, &envelope)?;
            touched_projects.insert(project_id);
            persisted_count += 1;
        }
        for project_id in touched_projects {
            rebuild_project_snapshot(&tx, &project_id)?;
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(persisted_count)
    }

    fn replace_project_state(&mut self, project_id: &str, state: &Value) -> Result<(), String> {
        let tx = self.db.conn.transaction().map_err(|e| e.to_string())?;
        replace_state_tables(&tx, project_id, state)?;
        rebuild_project_snapshot(&tx, project_id)?;
        tx.commit().map_err(|e| e.to_string())
    }

    fn query(&self, sql: &str, p: Vec<String>) -> Result<Value, String> {
        if sql == "REBUILD_FTS" {
            self.db.rebuild_fts_index().map_err(|e| e.to_string())?;
            return Ok(json!({"status": "success", "message": "FTS index rebuilt"}));
        }

        let mut stmt = self.db.conn.prepare(sql).map_err(|e| e.to_string())?;
        let column_count = stmt.column_count();
        let names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();

        let rows = stmt
            .query_map(rusqlite::params_from_iter(p), |row| {
                let mut map = serde_json::Map::with_capacity(column_count);
                for (i, name) in names.iter().enumerate() {
                    let val = row.get_ref(i)?;
                    let j_val = match val {
                        rusqlite::types::ValueRef::Null => Value::Null,
                        rusqlite::types::ValueRef::Integer(i) => json!(i),
                        rusqlite::types::ValueRef::Real(f) => json!(f),
                        rusqlite::types::ValueRef::Text(t) => {
                            let s = std::str::from_utf8(t).unwrap_or("");
                            if (s.starts_with('{') && s.ends_with('}'))
                                || (s.starts_with('[') && s.ends_with(']'))
                            {
                                serde_json::from_str(s).unwrap_or_else(|_| json!(s))
                            } else {
                                json!(s)
                            }
                        }
                        rusqlite::types::ValueRef::Blob(b) => json!(hex::encode(b)),
                    };
                    map.insert(name.clone(), j_val);
                }
                Ok(Value::Object(map))
            })
            .map_err(|e| e.to_string())?;

        let mut results = Vec::new();
        for row in rows {
            results.push(row.map_err(|e| e.to_string())?);
        }
        Ok(Value::Array(results))
    }

    fn commit_tx_batch(&mut self, commands: Vec<StorageCommand>) -> Result<(), String> {
        let tx = self.db.conn.transaction().map_err(|e| e.to_string())?;
        for cmd in commands {
            match cmd {
                StorageCommand::CreateProject {
                    id,
                    title,
                    base_hint,
                } => {
                    tx.execute(
                        "INSERT INTO projects (id, name, title, base_dir_hint) VALUES (?1, ?2, ?3, ?4)",
                        params![id, title, title, base_hint],
                    )
                    .map_err(|e| e.to_string())?;
                }
                StorageCommand::AddFile {
                    id,
                    project_id,
                    abs_path,
                    meta,
                } => {
                    let rel = compute_rel_path(&abs_path, &self.db.base_dir)
                        .map_err(|e| e.to_string())?;
                    let filename = abs_path
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("unknown");
                    let ext = abs_path.extension().and_then(|e| e.to_str());
                    tx.execute(
                        "INSERT INTO files (id, project_id, rel_path, filename, extension, metadata_json) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                        params![id, project_id, rel, filename, ext, meta.to_string()],
                    )
                    .map_err(|e| e.to_string())?;
                }
                StorageCommand::PatchMetadata { file_id, patch } => {
                    tx.execute(
                        "UPDATE files SET metadata_json = json_patch(metadata_json, json(?1)) WHERE id = ?2",
                        params![patch.to_string(), file_id],
                    )
                    .map_err(|e| e.to_string())?;
                }
                StorageCommand::PatchProjectMetadata { project_id, patch } => {
                    tx.execute(
                        "UPDATE projects SET metadata_json = json_patch(metadata_json, json(?1)) WHERE id = ?2",
                        params![patch.to_string(), project_id],
                    )
                    .map_err(|e| e.to_string())?;
                }
                StorageCommand::DeleteFile { file_id } => {
                    tx.execute("DELETE FROM files WHERE id = ?1", params![file_id])
                        .map_err(|e| e.to_string())?;
                }
                StorageCommand::DispatchEvents { .. }
                | StorageCommand::UpdateProjectState { .. }
                | StorageCommand::SaveProject { .. }
                | StorageCommand::Query { .. }
                | StorageCommand::OpenDatabase { .. }
                | StorageCommand::BackupProject { .. }
                | StorageCommand::ListBackups { .. }
                | StorageCommand::RestoreProject { .. }
                | StorageCommand::VerifyIntegrity { .. }
                | StorageCommand::GetProjectHealth { .. } => {}
            }
        }
        tx.commit().map_err(|e| e.to_string())
    }
}

fn panic_to_string(payload: Box<dyn std::any::Any + Send>) -> String {
    if let Some(message) = payload.downcast_ref::<&str>() {
        (*message).to_string()
    } else if let Some(message) = payload.downcast_ref::<String>() {
        message.clone()
    } else {
        "storage worker panicked".to_string()
    }
}

fn empty_design_state() -> Value {
    json!({
        "regions": {},
        "layers": {},
        "feature_groups": {},
        "features": {},
        "settings": {}
    })
}

fn parse_json_field(value: &Value, default: Value) -> Value {
    match value {
        Value::Null => default,
        Value::String(text) => serde_json::from_str(text).unwrap_or(default),
        other => other.clone(),
    }
}

fn bool_from_value(value: Option<&Value>, default: bool) -> bool {
    value.and_then(Value::as_bool).unwrap_or(default)
}

fn merge_objects(base: &mut Value, patch: &Value) {
    if let (Some(base_obj), Some(patch_obj)) = (base.as_object_mut(), patch.as_object()) {
        for (key, value) in patch_obj {
            base_obj.insert(key.clone(), value.clone());
        }
    }
}

fn persist_event(tx: &Transaction<'_>, envelope: &EventEnvelope) -> Result<(), String> {
    let payload = serde_json::to_string(&envelope.event).map_err(|e| e.to_string())?;
    let meta = serde_json::to_string(&envelope.metadata.clone().unwrap_or_else(|| json!({})))
        .map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO events (id, project_id, entity_type, entity_id, event_type, payload_json, metadata_json, device_id, hash)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            envelope.id.to_string(),
            envelope.project_id.to_string(),
            envelope.entity_type,
            envelope.entity_id.to_string(),
            envelope.event.event_type(),
            payload,
            meta,
            envelope.device_id,
            envelope.hash
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn apply_event_to_read_models(
    tx: &Transaction<'_>,
    envelope: &EventEnvelope,
) -> Result<(), String> {
    let project_id = envelope.project_id.to_string();
    match &envelope.event {
        AppEvent::ProjectCreated {
            id,
            name,
            root_path,
            metadata,
            ..
        } => {
            tx.execute(
                "INSERT OR REPLACE INTO projects (id, name, title, base_dir_hint, metadata_json) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    id.to_string(),
                    name.to_string(),
                    name.to_string(),
                    root_path.to_string(),
                    metadata.to_string()
                ],
            )
            .map_err(|e| e.to_string())?;
        }
        AppEvent::FileCreated {
            id,
            rel_path,
            filename,
            file_size,
            hash_sha256,
            metadata,
            ..
        } => {
            let ext = std::path::Path::new(filename)
                .extension()
                .and_then(|e| e.to_str());
            tx.execute(
                "INSERT OR REPLACE INTO files (id, project_id, rel_path, filename, extension, file_size, hash_sha256, metadata_json) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    id.to_string(),
                    project_id,
                    rel_path.to_string(),
                    filename.to_string(),
                    ext,
                    *file_size as i64,
                    hash_sha256.to_string(),
                    metadata.to_string()
                ],
            )
            .map_err(|e| e.to_string())?;
        }
        AppEvent::FileDeleted { id } => {
            tx.execute("DELETE FROM files WHERE id = ?1", params![id.to_string()])
                .map_err(|e| e.to_string())?;
        }
        AppEvent::RegionCreated {
            id,
            name,
            parent_id,
            metadata,
        } => {
            tx.execute(
                "INSERT OR REPLACE INTO regions (id, project_id, parent_id, name, description, metadata_json, updated_at) VALUES (?1, ?2, ?3, ?4, COALESCE((SELECT description FROM regions WHERE id = ?1), NULL), ?5, CURRENT_TIMESTAMP)",
                params![id.to_string(), project_id, parent_id.map(|v| v.to_string()), name.to_string(), metadata.to_string()],
            )
            .map_err(|e| e.to_string())?;
        }
        AppEvent::RegionUpdated { id, changes } => {
            let mut current = fetch_region_snapshot(tx, &id.to_string())?.unwrap_or_else(|| {
                json!({ "id": id.to_string(), "parent_id": null, "name": "", "description": null })
            });
            merge_objects(&mut current, changes);
            write_region_snapshot(tx, &project_id, &current)?;
        }
        AppEvent::RegionDeleted { id } => {
            tx.execute("DELETE FROM regions WHERE id = ?1", params![id.to_string()])
                .map_err(|e| e.to_string())?;
        }
        AppEvent::LayerCreated {
            id,
            region_id,
            name,
            metadata,
        } => {
            tx.execute(
                "INSERT OR REPLACE INTO layers (id, project_id, region_id, name, is_visible, metadata_json, updated_at) VALUES (?1, ?2, ?3, ?4, COALESCE((SELECT is_visible FROM layers WHERE id = ?1), 1), ?5, CURRENT_TIMESTAMP)",
                params![id.to_string(), project_id, region_id.map(|v| v.to_string()), name.to_string(), metadata.to_string()],
            )
            .map_err(|e| e.to_string())?;
        }
        AppEvent::LayerUpdated { id, changes } => {
            let mut current = fetch_layer_snapshot(tx, &id.to_string())?.unwrap_or_else(|| {
                json!({ "id": id.to_string(), "region_id": null, "name": "", "is_visible": true })
            });
            merge_objects(&mut current, changes);
            write_layer_snapshot(tx, &project_id, &current)?;
        }
        AppEvent::LayerDeleted { id } => {
            tx.execute("DELETE FROM layers WHERE id = ?1", params![id.to_string()])
                .map_err(|e| e.to_string())?;
        }
        AppEvent::FeatureGroupCreated {
            id,
            layer_id,
            parent_id,
            name,
            group_type,
            metadata,
        } => {
            tx.execute(
                "INSERT OR REPLACE INTO feature_groups (id, project_id, layer_id, parent_id, name, group_type, is_visible, metadata_json, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, COALESCE((SELECT is_visible FROM feature_groups WHERE id = ?1), 1), ?7, CURRENT_TIMESTAMP)",
                params![
                    id.to_string(),
                    project_id,
                    layer_id.to_string(),
                    parent_id.map(|v| v.to_string()),
                    name.to_string(),
                    group_type.clone(),
                    metadata.to_string()
                ],
            )
            .map_err(|e| e.to_string())?;
        }
        AppEvent::FeatureGroupUpdated { id, changes } => {
            let mut current = fetch_feature_group_snapshot(tx, &id.to_string())?.unwrap_or_else(|| {
                json!({ "id": id.to_string(), "layer_id": "", "parent_id": null, "name": "", "type": null, "is_visible": true, "metadata": "{}" })
            });
            merge_objects(&mut current, changes);
            write_feature_group_snapshot(tx, &project_id, &current)?;
        }
        AppEvent::FeatureGroupDeleted { id } => {
            tx.execute(
                "DELETE FROM feature_groups WHERE id = ?1",
                params![id.to_string()],
            )
            .map_err(|e| e.to_string())?;
        }
        AppEvent::FeatureCreated {
            id,
            layer_id,
            group_id,
            name,
            geom_type,
            geometry,
            properties,
            is_visible,
            note,
            bbox,
            metadata,
            ..
        } => {
            tx.execute(
                "INSERT OR REPLACE INTO features (id, project_id, layer_id, group_id, name, geom_type, coordinates_json, properties_json, metadata_json, bbox_json, is_visible, note, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, CURRENT_TIMESTAMP)",
                params![
                    id.to_string(),
                    project_id,
                    layer_id.to_string(),
                    group_id.map(|v| v.to_string()),
                    name.to_string(),
                    geom_type.to_string(),
                    geometry.to_string(),
                    properties.to_string(),
                    metadata.to_string(),
                    bbox.as_ref().map(Value::to_string),
                    if *is_visible { 1 } else { 0 },
                    note.clone()
                ],
            )
            .map_err(|e| e.to_string())?;
        }
        AppEvent::FeatureUpdated { id, changes } => {
            let mut current = fetch_feature_snapshot(tx, &id.to_string())?.unwrap_or_else(|| {
                json!({
                    "id": id.to_string(),
                    "layer_id": "",
                    "group_id": null,
                    "name": "",
                    "geom_type": "",
                    "metadata": "{}",
                    "properties": {},
                    "coordinates": null,
                    "bbox": null
                })
            });
            merge_objects(&mut current, changes);
            write_feature_snapshot(tx, &project_id, &current)?;
        }
        AppEvent::FeatureDeleted { id } => {
            tx.execute(
                "DELETE FROM features WHERE id = ?1",
                params![id.to_string()],
            )
            .map_err(|e| e.to_string())?;
        }
        AppEvent::SettingsUpdated { changes } => {
            let current_settings: Option<String> = tx
                .query_row(
                    "SELECT settings_json FROM project_settings WHERE project_id = ?1",
                    params![project_id],
                    |row| row.get(0),
                )
                .optional()
                .map_err(|e| e.to_string())?;
            let mut merged = current_settings
                .and_then(|text| serde_json::from_str::<Value>(&text).ok())
                .unwrap_or_else(|| json!({}));
            merge_objects(&mut merged, changes);
            tx.execute(
                "INSERT INTO project_settings (project_id, settings_json, updated_at) VALUES (?1, ?2, CURRENT_TIMESTAMP)
                 ON CONFLICT(project_id) DO UPDATE SET settings_json = excluded.settings_json, updated_at = CURRENT_TIMESTAMP",
                params![project_id, merged.to_string()],
            )
            .map_err(|e| e.to_string())?;
        }
        _ => {
            log::warn!(
                "[StorageWorker] Unhandled projection for event: {}",
                envelope.event.event_type()
            );
        }
    }
    Ok(())
}

fn replace_state_tables(
    tx: &Transaction<'_>,
    project_id: &str,
    state: &Value,
) -> Result<(), String> {
    let state = normalize_state_value(state);
    tx.execute(
        "DELETE FROM features WHERE project_id = ?1",
        params![project_id],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "DELETE FROM feature_groups WHERE project_id = ?1",
        params![project_id],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "DELETE FROM layers WHERE project_id = ?1",
        params![project_id],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "DELETE FROM regions WHERE project_id = ?1",
        params![project_id],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "DELETE FROM project_settings WHERE project_id = ?1",
        params![project_id],
    )
    .map_err(|e| e.to_string())?;

    for record in object_values(state.get("regions")) {
        write_region_snapshot(tx, project_id, &record)?;
    }
    for record in object_values(state.get("layers")) {
        write_layer_snapshot(tx, project_id, &record)?;
    }
    for record in object_values(state.get("feature_groups")) {
        write_feature_group_snapshot(tx, project_id, &record)?;
    }
    for record in object_values(state.get("features")) {
        write_feature_snapshot(tx, project_id, &record)?;
    }

    let settings = state.get("settings").cloned().unwrap_or_else(|| json!({}));
    tx.execute(
        "INSERT INTO project_settings (project_id, settings_json, updated_at) VALUES (?1, ?2, CURRENT_TIMESTAMP)
         ON CONFLICT(project_id) DO UPDATE SET settings_json = excluded.settings_json, updated_at = CURRENT_TIMESTAMP",
        params![project_id, settings.to_string()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn object_values(value: Option<&Value>) -> Vec<Value> {
    value
        .and_then(Value::as_object)
        .map(|map| map.values().cloned().collect())
        .unwrap_or_default()
}

fn normalize_state_value(state: &Value) -> Value {
    let mut normalized = empty_design_state();
    if let Some(state_obj) = state.as_object() {
        if let Some(target) = normalized.as_object_mut() {
            for key in [
                "regions",
                "layers",
                "feature_groups",
                "features",
                "settings",
            ] {
                if let Some(value) = state_obj.get(key) {
                    target.insert(key.to_string(), value.clone());
                }
            }
        }
    }
    normalized
}

fn rebuild_project_snapshot(tx: &Transaction<'_>, project_id: &str) -> Result<(), String> {
    let snapshot = build_snapshot_from_tables(tx, project_id)?;
    tx.execute(
        "INSERT INTO project_snapshots (project_id, state_json, hydrated_at, updated_at)
         VALUES (?1, ?2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         ON CONFLICT(project_id) DO UPDATE SET
            state_json = excluded.state_json,
            hydrated_at = excluded.hydrated_at,
            updated_at = excluded.updated_at",
        params![project_id, snapshot.to_string()],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE projects SET metadata_json = ?1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?2",
        params![snapshot.to_string(), project_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn build_snapshot_from_tables(tx: &Transaction<'_>, project_id: &str) -> Result<Value, String> {
    let mut state = empty_design_state();
    let state_obj = state.as_object_mut().expect("state object");

    let mut regions = serde_json::Map::new();
    let mut stmt = tx
        .prepare(
            "SELECT id, parent_id, name, description FROM regions WHERE project_id = ?1 ORDER BY created_at, id",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![project_id], |row| {
            Ok(json!({
                "id": row.get::<_, String>(0)?,
                "parent_id": row.get::<_, Option<String>>(1)?,
                "name": row.get::<_, String>(2)?,
                "description": row.get::<_, Option<String>>(3)?,
            }))
        })
        .map_err(|e| e.to_string())?;
    for row in rows {
        let record = row.map_err(|e| e.to_string())?;
        if let Some(id) = record.get("id").and_then(Value::as_str) {
            regions.insert(id.to_string(), record);
        }
    }
    state_obj.insert("regions".to_string(), Value::Object(regions));

    let mut layers = serde_json::Map::new();
    let mut stmt = tx
        .prepare(
            "SELECT id, region_id, name, is_visible FROM layers WHERE project_id = ?1 ORDER BY created_at, id",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![project_id], |row| {
            Ok(json!({
                "id": row.get::<_, String>(0)?,
                "region_id": row.get::<_, Option<String>>(1)?,
                "name": row.get::<_, String>(2)?,
                "is_visible": row.get::<_, i64>(3)? != 0,
            }))
        })
        .map_err(|e| e.to_string())?;
    for row in rows {
        let record = row.map_err(|e| e.to_string())?;
        if let Some(id) = record.get("id").and_then(Value::as_str) {
            layers.insert(id.to_string(), record);
        }
    }
    state_obj.insert("layers".to_string(), Value::Object(layers));

    let mut groups = serde_json::Map::new();
    let mut stmt = tx
        .prepare(
            "SELECT id, layer_id, parent_id, name, group_type, is_visible, metadata_json
             FROM feature_groups WHERE project_id = ?1 ORDER BY created_at, id",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![project_id], |row| {
            let metadata_json: String = row.get(6)?;
            Ok(json!({
                "id": row.get::<_, String>(0)?,
                "layer_id": row.get::<_, String>(1)?,
                "parent_id": row.get::<_, Option<String>>(2)?,
                "name": row.get::<_, String>(3)?,
                "type": row.get::<_, Option<String>>(4)?,
                "is_visible": row.get::<_, i64>(5)? != 0,
                "metadata": metadata_json,
            }))
        })
        .map_err(|e| e.to_string())?;
    for row in rows {
        let record = row.map_err(|e| e.to_string())?;
        if let Some(id) = record.get("id").and_then(Value::as_str) {
            groups.insert(id.to_string(), record);
        }
    }
    state_obj.insert("feature_groups".to_string(), Value::Object(groups));

    let mut features = serde_json::Map::new();
    let mut stmt = tx
        .prepare(
            "SELECT id, layer_id, group_id, name, geom_type, coordinates_json, properties_json, metadata_json, bbox_json
             FROM features WHERE project_id = ?1 ORDER BY created_at, id",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![project_id], |row| {
            let coordinates_json: Option<String> = row.get(5)?;
            let properties_json: String = row.get(6)?;
            let metadata_json: String = row.get(7)?;
            let bbox_json: Option<String> = row.get(8)?;
            Ok(json!({
                "id": row.get::<_, String>(0)?,
                "layer_id": row.get::<_, String>(1)?,
                "group_id": row.get::<_, Option<String>>(2)?,
                "name": row.get::<_, String>(3)?,
                "geom_type": row.get::<_, String>(4)?,
                "coordinates": coordinates_json
                    .and_then(|text| serde_json::from_str::<Value>(&text).ok())
                    .unwrap_or(Value::Null),
                "properties": serde_json::from_str::<Value>(&properties_json).unwrap_or_else(|_| json!({})),
                "metadata": metadata_json,
                "bbox": bbox_json
                    .and_then(|text| serde_json::from_str::<Value>(&text).ok())
                    .unwrap_or(Value::Null),
            }))
        })
        .map_err(|e| e.to_string())?;
    for row in rows {
        let record = row.map_err(|e| e.to_string())?;
        if let Some(id) = record.get("id").and_then(Value::as_str) {
            features.insert(id.to_string(), record);
        }
    }
    state_obj.insert("features".to_string(), Value::Object(features));

    let settings: Option<String> = tx
        .query_row(
            "SELECT settings_json FROM project_settings WHERE project_id = ?1",
            params![project_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    state_obj.insert(
        "settings".to_string(),
        settings
            .and_then(|text| serde_json::from_str::<Value>(&text).ok())
            .unwrap_or_else(|| json!({})),
    );

    Ok(state)
}

fn fetch_region_snapshot(tx: &Transaction<'_>, id: &str) -> Result<Option<Value>, String> {
    tx.query_row(
        "SELECT id, parent_id, name, description FROM regions WHERE id = ?1",
        params![id],
        |row| {
            Ok(json!({
                "id": row.get::<_, String>(0)?,
                "parent_id": row.get::<_, Option<String>>(1)?,
                "name": row.get::<_, String>(2)?,
                "description": row.get::<_, Option<String>>(3)?,
            }))
        },
    )
    .optional()
    .map_err(|e| e.to_string())
}

fn fetch_layer_snapshot(tx: &Transaction<'_>, id: &str) -> Result<Option<Value>, String> {
    tx.query_row(
        "SELECT id, region_id, name, is_visible FROM layers WHERE id = ?1",
        params![id],
        |row| {
            Ok(json!({
                "id": row.get::<_, String>(0)?,
                "region_id": row.get::<_, Option<String>>(1)?,
                "name": row.get::<_, String>(2)?,
                "is_visible": row.get::<_, i64>(3)? != 0,
            }))
        },
    )
    .optional()
    .map_err(|e| e.to_string())
}

fn fetch_feature_group_snapshot(tx: &Transaction<'_>, id: &str) -> Result<Option<Value>, String> {
    tx.query_row(
        "SELECT id, layer_id, parent_id, name, group_type, is_visible, metadata_json FROM feature_groups WHERE id = ?1",
        params![id],
        |row| {
            let metadata_json: String = row.get(6)?;
            Ok(json!({
                "id": row.get::<_, String>(0)?,
                "layer_id": row.get::<_, String>(1)?,
                "parent_id": row.get::<_, Option<String>>(2)?,
                "name": row.get::<_, String>(3)?,
                "type": row.get::<_, Option<String>>(4)?,
                "is_visible": row.get::<_, i64>(5)? != 0,
                "metadata": metadata_json,
            }))
        },
    )
    .optional()
    .map_err(|e| e.to_string())
}

fn fetch_feature_snapshot(tx: &Transaction<'_>, id: &str) -> Result<Option<Value>, String> {
    tx.query_row(
        "SELECT id, layer_id, group_id, name, geom_type, coordinates_json, properties_json, metadata_json, bbox_json FROM features WHERE id = ?1",
        params![id],
        |row| {
            let coordinates_json: Option<String> = row.get(5)?;
            let properties_json: String = row.get(6)?;
            let metadata_json: String = row.get(7)?;
            let bbox_json: Option<String> = row.get(8)?;
            Ok(json!({
                "id": row.get::<_, String>(0)?,
                "layer_id": row.get::<_, String>(1)?,
                "group_id": row.get::<_, Option<String>>(2)?,
                "name": row.get::<_, String>(3)?,
                "geom_type": row.get::<_, String>(4)?,
                "coordinates": coordinates_json
                    .and_then(|text| serde_json::from_str::<Value>(&text).ok())
                    .unwrap_or(Value::Null),
                "properties": serde_json::from_str::<Value>(&properties_json).unwrap_or_else(|_| json!({})),
                "metadata": metadata_json,
                "bbox": bbox_json
                    .and_then(|text| serde_json::from_str::<Value>(&text).ok())
                    .unwrap_or(Value::Null),
            }))
        },
    )
    .optional()
    .map_err(|e| e.to_string())
}

fn write_region_snapshot(
    tx: &Transaction<'_>,
    project_id: &str,
    record: &Value,
) -> Result<(), String> {
    let id = record
        .get("id")
        .and_then(Value::as_str)
        .ok_or_else(|| "Region snapshot is missing id".to_string())?;
    let name = record
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or("Untitled Region");
    tx.execute(
        "INSERT INTO regions (id, project_id, parent_id, name, description, metadata_json, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, CURRENT_TIMESTAMP)
         ON CONFLICT(id) DO UPDATE SET parent_id = excluded.parent_id, name = excluded.name, description = excluded.description, metadata_json = excluded.metadata_json, updated_at = CURRENT_TIMESTAMP",
        params![
            id,
            project_id,
            record.get("parent_id").and_then(Value::as_str),
            name,
            record.get("description").and_then(Value::as_str),
            json!({}).to_string(),
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn write_layer_snapshot(
    tx: &Transaction<'_>,
    project_id: &str,
    record: &Value,
) -> Result<(), String> {
    let id = record
        .get("id")
        .and_then(Value::as_str)
        .ok_or_else(|| "Layer snapshot is missing id".to_string())?;
    let name = record
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or("Untitled Layer");
    tx.execute(
        "INSERT INTO layers (id, project_id, region_id, name, is_visible, metadata_json, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, CURRENT_TIMESTAMP)
         ON CONFLICT(id) DO UPDATE SET region_id = excluded.region_id, name = excluded.name, is_visible = excluded.is_visible, metadata_json = excluded.metadata_json, updated_at = CURRENT_TIMESTAMP",
        params![
            id,
            project_id,
            record.get("region_id").and_then(Value::as_str),
            name,
            if bool_from_value(record.get("is_visible"), true) { 1 } else { 0 },
            json!({}).to_string(),
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn write_feature_group_snapshot(
    tx: &Transaction<'_>,
    project_id: &str,
    record: &Value,
) -> Result<(), String> {
    let id = record
        .get("id")
        .and_then(Value::as_str)
        .ok_or_else(|| "Feature group snapshot is missing id".to_string())?;
    let layer_id = record
        .get("layer_id")
        .and_then(Value::as_str)
        .ok_or_else(|| "Feature group snapshot is missing layer_id".to_string())?;
    let name = record
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or("Untitled Group");
    let metadata = parse_json_field(record.get("metadata").unwrap_or(&Value::Null), json!({}));
    tx.execute(
        "INSERT INTO feature_groups (id, project_id, layer_id, parent_id, name, group_type, is_visible, metadata_json, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, CURRENT_TIMESTAMP)
         ON CONFLICT(id) DO UPDATE SET layer_id = excluded.layer_id, parent_id = excluded.parent_id, name = excluded.name, group_type = excluded.group_type, is_visible = excluded.is_visible, metadata_json = excluded.metadata_json, updated_at = CURRENT_TIMESTAMP",
        params![
            id,
            project_id,
            layer_id,
            record.get("parent_id").and_then(Value::as_str),
            name,
            record.get("type").and_then(Value::as_str),
            if bool_from_value(record.get("is_visible"), true) { 1 } else { 0 },
            metadata.to_string(),
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn write_feature_snapshot(
    tx: &Transaction<'_>,
    project_id: &str,
    record: &Value,
) -> Result<(), String> {
    let id = record
        .get("id")
        .and_then(Value::as_str)
        .ok_or_else(|| "Feature snapshot is missing id".to_string())?;
    let layer_id = record
        .get("layer_id")
        .and_then(Value::as_str)
        .ok_or_else(|| "Feature snapshot is missing layer_id".to_string())?;
    let name = record
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or("Untitled Feature");
    let geom_type = record
        .get("geom_type")
        .and_then(Value::as_str)
        .unwrap_or("Point");
    let metadata = parse_json_field(record.get("metadata").unwrap_or(&Value::Null), json!({}));
    let properties = parse_json_field(record.get("properties").unwrap_or(&Value::Null), json!({}));
    tx.execute(
        "INSERT INTO features (id, project_id, layer_id, group_id, name, geom_type, coordinates_json, properties_json, metadata_json, bbox_json, is_visible, note, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, CURRENT_TIMESTAMP)
         ON CONFLICT(id) DO UPDATE SET layer_id = excluded.layer_id, group_id = excluded.group_id, name = excluded.name, geom_type = excluded.geom_type, coordinates_json = excluded.coordinates_json, properties_json = excluded.properties_json, metadata_json = excluded.metadata_json, bbox_json = excluded.bbox_json, is_visible = excluded.is_visible, note = excluded.note, updated_at = CURRENT_TIMESTAMP",
        params![
            id,
            project_id,
            layer_id,
            record.get("group_id").and_then(Value::as_str),
            name,
            geom_type,
            record.get("coordinates").map(Value::to_string),
            properties.to_string(),
            metadata.to_string(),
            record
                .get("bbox")
                .filter(|value| !value.is_null())
                .map(Value::to_string),
            if bool_from_value(record.get("is_visible"), true) { 1 } else { 0 },
            record.get("note").and_then(Value::as_str),
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;
    use tokio::sync::oneshot;
    use uuid::Uuid;

    #[tokio::test]
    async fn persists_project_state_and_reads_back_after_reopen() {
        let dir = tempdir().expect("tempdir");
        let pmp_path = dir.path().join("persist_roundtrip.pmp");
        let project_id = "project_roundtrip_1".to_string();

        let db = PmpDatabase::open_or_create(pmp_path.clone()).expect("open db");
        let (tx, rx) = mpsc::channel(32);
        let _handle = StorageWorker::spawn(rx, db);

        tx.send(StorageCommand::CreateProject {
            id: project_id.clone(),
            title: "Persist Test".to_string(),
            base_hint: dir.path().to_string_lossy().to_string(),
        })
        .await
        .expect("create project send");

        let (state_tx, state_rx) = oneshot::channel();
        tx.send(StorageCommand::UpdateProjectState {
            project_id: project_id.clone(),
            state: json!({
                "features": {"f1": {"id": "f1", "layer_id": "l1", "group_id": null, "name": "Feature 1", "geom_type": "Point", "metadata": "{}", "properties": {}, "coordinates": [106.0, 10.0]}},
                "layers": {"l1": {"id": "l1", "region_id": "r1", "name": "Layer 1", "is_visible": true}},
                "regions": {"r1": {"id": "r1", "name": "Region 1", "parent_id": null, "description": null}},
                "feature_groups": {},
                "settings": {"grid": true}
            }),
            reply: state_tx,
        })
        .await
        .expect("update state send");
        state_rx.await.expect("update ack").expect("update ok");

        let (save_tx, save_rx) = oneshot::channel();
        tx.send(StorageCommand::SaveProject { reply: save_tx })
            .await
            .expect("save send");
        save_rx.await.expect("save ack").expect("save ok");

        let reopened = PmpDatabase::open_or_create(pmp_path).expect("reopen db");
        let loaded: String = reopened
            .conn
            .query_row(
                "SELECT metadata_json FROM projects WHERE id = ?1",
                params![project_id],
                |r| r.get(0),
            )
            .expect("select metadata_json");
        let parsed: Value = serde_json::from_str(&loaded).expect("json parse");

        assert!(
            parsed.get("features").is_some(),
            "missing features after reopen"
        );
        assert!(
            parsed.get("layers").is_some(),
            "missing layers after reopen"
        );
        assert!(
            parsed.get("regions").is_some(),
            "missing regions after reopen"
        );
        assert_eq!(
            parsed
                .get("features")
                .and_then(|f| f.get("f1"))
                .and_then(|f1| f1.get("name"))
                .and_then(|n| n.as_str()),
            Some("Feature 1")
        );
    }

    #[tokio::test]
    async fn dispatch_events_persists_normalized_tables_and_snapshot() {
        let dir = tempdir().expect("tempdir");
        let pmp_path = dir.path().join("event_roundtrip.pmp");
        let project_id = Uuid::new_v4();
        let region_id = Uuid::new_v4();
        let layer_id = Uuid::new_v4();
        let feature_id = Uuid::new_v4();

        let db = PmpDatabase::open_or_create(pmp_path).expect("open db");
        db.conn
            .execute(
                "INSERT INTO projects (id, name, title, base_dir_hint) VALUES (?1, ?2, ?3, ?4)",
                params![
                    project_id.to_string(),
                    "Event Project",
                    "Event Project",
                    dir.path().to_string_lossy().to_string()
                ],
            )
            .expect("seed project");

        let (tx, rx) = mpsc::channel(32);
        let _handle = StorageWorker::spawn(rx, db);

        let events = vec![
            EventEnvelope::new(
                project_id,
                "region",
                region_id,
                AppEvent::RegionCreated {
                    id: region_id,
                    name: "Region".to_string(),
                    parent_id: None,
                    metadata: json!({}),
                },
                "test",
                None,
            ),
            EventEnvelope::new(
                project_id,
                "layer",
                layer_id,
                AppEvent::LayerCreated {
                    id: layer_id,
                    region_id: Some(region_id),
                    name: "Layer".to_string(),
                    metadata: json!({}),
                },
                "test",
                None,
            ),
            EventEnvelope::new(
                project_id,
                "feature",
                feature_id,
                AppEvent::FeatureCreated {
                    id: feature_id,
                    layer_id,
                    group_id: None,
                    task_id: None,
                    name: "Point A".to_string(),
                    geom_type: "Point".to_string(),
                    geometry: json!([106.7, 10.8]),
                    properties: json!({"code": "A"}),
                    style_id: None,
                    is_visible: true,
                    note: None,
                    bbox: None,
                    metadata: json!({"description": "Imported"}),
                },
                "test",
                None,
            ),
        ];

        let (reply_tx, reply_rx) = oneshot::channel();
        tx.send(StorageCommand::DispatchEvents {
            events,
            reply: reply_tx,
        })
        .await
        .expect("dispatch send");
        let persisted = reply_rx.await.expect("dispatch ack").expect("dispatch ok");
        assert_eq!(persisted, 3);

        let reopened =
            PmpDatabase::open_or_create(dir.path().join("event_roundtrip.pmp")).expect("reopen db");
        let feature_count: i64 = reopened
            .conn
            .query_row(
                "SELECT COUNT(*) FROM features WHERE project_id = ?1",
                params![project_id.to_string()],
                |row| row.get(0),
            )
            .expect("feature count");
        assert_eq!(feature_count, 1);
    }
}
