use tokio::sync::mpsc;
use rusqlite::params;
use crate::domain::implement::modules::v2::storage::connection::PmpDatabase;
use crate::domain::implement::modules::v2::pipeline::eventbus::StorageCommand;
use crate::domain::implement::modules::v2::storage::path_meta::compute_rel_path;
use serde_json::{json, Value};

#[derive(Debug)]
pub struct StorageWorker {
    rx: mpsc::Receiver<StorageCommand>,
    db: PmpDatabase,
}

impl StorageWorker {
    pub fn spawn(rx: mpsc::Receiver<StorageCommand>, db: PmpDatabase) -> tauri::async_runtime::JoinHandle<()> {
        tauri::async_runtime::spawn(async move {
            let mut worker = Self { rx: rx, db };
            while let Some(cmd) = worker.rx.recv().await {
                // Batch up to 100 commands if they are immediately available
                let mut batch = vec![cmd];
                while batch.len() < 100 {
                match worker.rx.try_recv() {
                    Ok(next) => {
                        // Don't batch queries or database opening to avoid delaying them
                        if matches!(
                            next,
                            StorageCommand::Query { .. }
                                | StorageCommand::OpenDatabase { .. }
                                | StorageCommand::SaveProject { .. }
                                | StorageCommand::BackupProject { .. }
                                | StorageCommand::ListBackups { .. }
                                | StorageCommand::RestoreProject { .. }
                                | StorageCommand::VerifyIntegrity { .. }
                                | StorageCommand::GetProjectHealth { .. }
                        ) {
                                // Put it back? No, MPSC doesn't support that easily. 
                                // For simplicity, just process what we have and then process this special one.
                                worker.execute_batch(batch).await;
                                worker.execute(next).await;
                                batch = vec![];
                                break;
                            }
                            batch.push(next);
                        }
                        Err(_) => break, // No more commands available right now
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
            StorageCommand::OpenDatabase { path } => {
                log::info!("[StorageWorker] Switching database to: {:?}", path);
                match PmpDatabase::open_or_create(path) {
                    Ok(new_db) => self.db = new_db,
                    Err(e) => log::error!("[StorageWorker] ❌ Switch failed: {}", e),
                }
            }
            StorageCommand::Query { sql, params: p, reply } => {
                let res = self.query(&sql, p);
                let _ = reply.send(res);
            }
            StorageCommand::SaveProject { reply } => {
                // In WAL mode, commits are already flushed. 
                // We can perform an explicit checkpoint if we want to be 100% sure.
                log::info!("[StorageWorker] 💾 Saving project (Checkpointing WAL)...");
                let res = self.db.conn.execute_batch("PRAGMA wal_checkpoint(PASSIVE);").map_err(|e| e.to_string());
                let _ = reply.send(res);
            }
            StorageCommand::BackupProject { project_id, reply } => {
                let res = self.db.backup_project(&project_id);
                let _ = reply.send(res);
            }
            StorageCommand::ListBackups { project_id, reply } => {
                let res = self.db.list_backups(&project_id);
                let _ = reply.send(res);
            }
            StorageCommand::RestoreProject { project_id, backup_id, reply } => {
                let backup_path = self
                    .db
                    .base_dir
                    .join("backups")
                    .join(&project_id)
                    .join(format!("{backup_id}.pmp"));
                let restore_path = self
                    .db
                    .base_dir
                    .join(format!("{project_id}_restored_{}.pmp", chrono::Local::now().format("%Y%m%d_%H%M%S")));
                let res = (|| -> Result<Value, String> {
                    if !backup_path.exists() {
                        return Err(format!("Backup not found: {}", backup_path.display()));
                    }
                    std::fs::copy(&backup_path, &restore_path).map_err(|e| e.to_string())?;
                    let new_db = PmpDatabase::open_or_create(restore_path.clone()).map_err(|e| e.to_string())?;
                    self.db = new_db;
                    self.db.conn.execute(
                        "INSERT OR REPLACE INTO sys_config(key, value) VALUES('last_restore_test_at', ?1)",
                        [chrono::Local::now().to_rfc3339()],
                    ).map_err(|e| e.to_string())?;
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
                        self.db.conn.execute(
                            "INSERT OR REPLACE INTO sys_config(key, value) VALUES('last_integrity_check_at', ?1)",
                            [chrono::Local::now().to_rfc3339()],
                        ).map_err(|e| e.to_string())?;
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
                    let last_backup_at: Option<String> = self.db.conn
                        .query_row("SELECT value FROM sys_config WHERE key='last_backup_at'", [], |r| r.get(0))
                        .ok();
                    let last_integrity_check_at: Option<String> = self.db.conn
                        .query_row("SELECT value FROM sys_config WHERE key='last_integrity_check_at'", [], |r| r.get(0))
                        .ok();
                    let last_restore_test_at: Option<String> = self.db.conn
                        .query_row("SELECT value FROM sys_config WHERE key='last_restore_test_at'", [], |r| r.get(0))
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
                // Should not happen with execute_batch logic, but kept for safety
                if let Err(e) = self.commit_tx_batch(vec![cmd]).await {
                    log::error!("[StorageWorker] ❌ Transaction error: {}", e);
                }
            }
        }
    }

    async fn execute_batch(&mut self, commands: Vec<StorageCommand>) {
        if commands.is_empty() { return; }
        
        // If there's only one command and it's a special one, use execute
        if commands.len() == 1 {
            let cmd = &commands[0];
            if matches!(
                cmd,
                StorageCommand::Query { .. }
                    | StorageCommand::OpenDatabase { .. }
                    | StorageCommand::SaveProject { .. }
                    | StorageCommand::BackupProject { .. }
                    | StorageCommand::ListBackups { .. }
                    | StorageCommand::RestoreProject { .. }
                    | StorageCommand::VerifyIntegrity { .. }
                    | StorageCommand::GetProjectHealth { .. }
            ) {
                // This shouldn't happen based on spawn logic, but safe fallback
                self.execute(commands.into_iter().next().unwrap()).await;
                return;
            }
        }

        if let Err(e) = self.commit_tx_batch(commands).await {
            log::error!("[StorageWorker] ❌ Batch transaction error: {}", e);
        }
    }

    fn query(&self, sql: &str, p: Vec<String>) -> Result<Value, String> {
        if sql == "REBUILD_FTS" {
            self.db.rebuild_fts_index().map_err(|e| e.to_string())?;
            return Ok(json!({"status": "success", "message": "FTS index rebuilt"}));
        }
        
        let mut stmt = self.db.conn.prepare(sql).map_err(|e| e.to_string())?;
        let column_count = stmt.column_count();
        let names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
        
        let rows = stmt.query_map(rusqlite::params_from_iter(p), |row| {
            let mut map = serde_json::Map::with_capacity(column_count);
            for (i, name) in names.iter().enumerate() {
                let val = row.get_ref(i)?;
                let j_val = match val {
                    rusqlite::types::ValueRef::Null => Value::Null,
                    rusqlite::types::ValueRef::Integer(i) => json!(i),
                    rusqlite::types::ValueRef::Real(f) => json!(f),
                    rusqlite::types::ValueRef::Text(t) => {
                        let s = std::str::from_utf8(t).unwrap_or("");
                        if (s.starts_with('{') && s.ends_with('}')) || (s.starts_with('[') && s.ends_with(']')) {
                            serde_json::from_str(s).unwrap_or_else(|_| json!(s))
                        } else {
                            json!(s)
                        }
                    },
                    rusqlite::types::ValueRef::Blob(b) => json!(hex::encode(b)),
                };
                map.insert(name.clone(), j_val);
            }
            Ok(Value::Object(map))
        }).map_err(|e| e.to_string())?;

        let mut results = Vec::new();
        for row in rows {
            results.push(row.map_err(|e| e.to_string())?);
        }
        Ok(Value::Array(results))
    }

    async fn commit_tx_batch(&mut self, commands: Vec<StorageCommand>) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let tx = self.db.conn.transaction().map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>)?;
        
        {
            // Use local scope to ensure statements are dropped before tx.commit()
            // In a real production app, these would be members of StorageWorker or cached in Connection
            for cmd in commands {
                match cmd {
                    StorageCommand::CreateProject { id, title, base_hint } => {
                        tx.execute("INSERT INTO projects (id, title, base_dir_hint) VALUES (?1, ?2, ?3)", params![id, title, base_hint])?;
                    }
                    StorageCommand::AddFile { id, project_id, abs_path, meta } => {
                        let rel = compute_rel_path(&abs_path, &self.db.base_dir).map_err(|e| Box::new(std::io::Error::new(std::io::ErrorKind::Other, e)))?;
                        let filename = abs_path.file_name().and_then(|n| n.to_str()).unwrap_or("unknown");
                        let ext = abs_path.extension().and_then(|e| e.to_str());
                        let meta_str = meta.to_string();
                        tx.execute("INSERT INTO files (id, project_id, rel_path, filename, extension, metadata_json) VALUES (?1, ?2, ?3, ?4, ?5, ?6)", params![id, project_id, rel, filename, ext, meta_str])?;
                    }
                    StorageCommand::PatchMetadata { file_id, patch } => {
                        tx.execute("UPDATE files SET metadata_json = json_patch(metadata_json, json(?1)) WHERE id = ?2", params![patch.to_string(), file_id])?;
                    }
                    StorageCommand::PatchProjectMetadata { project_id, patch } => {
                        tx.execute("UPDATE projects SET metadata_json = json_patch(metadata_json, json(?1)) WHERE id = ?2", params![patch.to_string(), project_id])?;
                    }
                    StorageCommand::UpdateProjectState { project_id, state } => {
                        tx.execute("UPDATE projects SET metadata_json = json_patch(metadata_json, json(?1)) WHERE id = ?2", params![state.to_string(), project_id])?;
                    }
                    StorageCommand::DeleteFile { file_id } => {
                        tx.execute("DELETE FROM files WHERE id = ?1", params![file_id])?;
                    }
                    StorageCommand::DispatchEvents { events } => {
                        for envelope in events {
                            // 1. Persist to Event Store
                            let payload = serde_json::to_string(&envelope.event)?;
                            let meta = serde_json::to_string(&envelope.metadata.unwrap_or(json!({})))?;
                            
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
                                ]
                            )?;

                            // 2. Simple Projection (Apply to Read Models)
                            match &envelope.event {
                                crate::domain::models::v2::AppEvent::ProjectCreated { id, name, root_path, metadata, .. } => {
                                    tx.execute("INSERT OR REPLACE INTO projects (id, title, base_dir_hint, metadata_json) VALUES (?1, ?2, ?3, ?4)", 
                                        params![id.to_string(), name.to_string(), root_path.to_string(), metadata.to_string()])?;
                                }
                                crate::domain::models::v2::AppEvent::FileCreated { id, rel_path, filename, file_size, hash_sha256, metadata, .. } => {
                                    let ext = std::path::Path::new(&filename).extension().and_then(|e| e.to_str());
                                    tx.execute("INSERT OR REPLACE INTO files (id, project_id, rel_path, filename, extension, file_size, hash_sha256, metadata_json) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)", 
                                        params![id.to_string(), envelope.project_id.to_string(), rel_path.to_string(), filename.to_string(), ext, *file_size as i64, hash_sha256.to_string(), metadata.to_string()])?;
                                }
                                crate::domain::models::v2::AppEvent::FileDeleted { id } => {
                                    tx.execute("DELETE FROM files WHERE id = ?1", params![id.to_string()])?;
                                }
                                _ => {
                                    log::warn!("[StorageWorker] Unhandled projection for event: {}", envelope.event.event_type());
                                }
                            }
                        }
                    }
                    StorageCommand::SaveProject { .. } => {}
                    _ => {} // Query and OpenDatabase handled elsewhere
                }
            }
        }

        tx.commit().map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>)?;
        log::info!("[StorageWorker] ✅ Committed batch");
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::sync::oneshot;
    use tempfile::tempdir;

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

        tx.send(StorageCommand::UpdateProjectState {
            project_id: project_id.clone(),
            state: json!({
                "features": {"f1": {"id": "f1", "name": "Feature 1"}},
                "layers": {"l1": {"id": "l1", "name": "Layer 1"}},
                "regions": {"r1": {"id": "r1", "name": "Region 1"}}
            }),
        })
        .await
        .expect("update state send");

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

        assert!(parsed.get("features").is_some(), "missing features after reopen");
        assert!(parsed.get("layers").is_some(), "missing layers after reopen");
        assert!(parsed.get("regions").is_some(), "missing regions after reopen");
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
    async fn persists_active_project_identity_and_path_after_reopen() {
        let dir = tempdir().expect("tempdir");
        let pmp_path = dir.path().join("active_project_roundtrip.pmp");
        let project_id = "project_active_1".to_string();
        let project_path = pmp_path.to_string_lossy().to_string();

        let db = PmpDatabase::open_or_create(pmp_path.clone()).expect("open db");
        let (tx, rx) = mpsc::channel(32);
        let _handle = StorageWorker::spawn(rx, db);

        tx.send(StorageCommand::CreateProject {
            id: project_id.clone(),
            title: "Active Project".to_string(),
            base_hint: dir.path().to_string_lossy().to_string(),
        })
        .await
        .expect("create project send");

        let (q1_tx, q1_rx) = oneshot::channel();
        tx.send(StorageCommand::Query {
            sql: "INSERT OR REPLACE INTO sys_config(key, value) VALUES('active_project_id', ?1)".to_string(),
            params: vec![project_id.clone()],
            reply: q1_tx,
        })
        .await
        .expect("insert active_project_id send");
        q1_rx.await.expect("insert active_project_id ack").expect("insert active_project_id ok");

        let (q2_tx, q2_rx) = oneshot::channel();
        tx.send(StorageCommand::Query {
            sql: "INSERT OR REPLACE INTO sys_config(key, value) VALUES('active_project_path', ?1)".to_string(),
            params: vec![project_path.clone()],
            reply: q2_tx,
        })
        .await
        .expect("insert active_project_path send");
        q2_rx.await.expect("insert active_project_path ack").expect("insert active_project_path ok");

        let (save_tx, save_rx) = oneshot::channel();
        tx.send(StorageCommand::SaveProject { reply: save_tx })
            .await
            .expect("save send");
        save_rx.await.expect("save ack").expect("save ok");

        let reopened = PmpDatabase::open_or_create(pmp_path).expect("reopen db");
        let loaded_id: String = reopened
            .conn
            .query_row(
                "SELECT value FROM sys_config WHERE key = 'active_project_id'",
                [],
                |r| r.get(0),
            )
            .expect("select active_project_id");
        let loaded_path: String = reopened
            .conn
            .query_row(
                "SELECT value FROM sys_config WHERE key = 'active_project_path'",
                [],
                |r| r.get(0),
            )
            .expect("select active_project_path");

        assert_eq!(loaded_id, project_id);
        assert_eq!(loaded_path, project_path);
    }
}
