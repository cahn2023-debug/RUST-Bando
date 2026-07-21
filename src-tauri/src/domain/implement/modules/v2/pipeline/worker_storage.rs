use crate::domain::implement::modules::v2::pipeline::eventbus::StorageCommand;
use crate::domain::implement::modules::v2::storage::connection::PmpDatabase;
use crate::domain::implement::modules::v2::storage::path_meta::compute_rel_path;
use crate::domain::implement::modules::v2::storage::schema::{
    ensure_v8_compatibility, CURRENT_SCHEMA_VERSION,
};
use crate::domain::models::v2::{AppEvent, EventEnvelope};
use base64::{engine::general_purpose, Engine as _};
use rusqlite::{
    backup::Backup, params, Connection, DatabaseName, OpenFlags, OptionalExtension, Transaction,
};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::path::{Path, PathBuf};
use std::time::Duration;
use tokio::sync::mpsc;

const MAX_EVENT_PAYLOAD_BYTES: usize = 256 * 1024;

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
                                    | StorageCommand::ImportMediaAsset { .. }
                                    | StorageCommand::AnalyzePmpImport { .. }
                                    | StorageCommand::ImportPmpIntoProject { .. }
                                    | StorageCommand::DeleteMediaAsset { .. }
                                    | StorageCommand::ResolveMediaAsset { .. }
                                    | StorageCommand::OptimizeProjectStorage { .. }
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
                        self.auto_migrate_legacy_media_on_open()
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
                        .execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
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
            StorageCommand::ImportMediaAsset {
                project_id,
                feature_id,
                data_url,
                file_path,
                reply,
            } => {
                let res = catch_unwind(AssertUnwindSafe(|| {
                    self.import_media_asset(&project_id, &feature_id, data_url, file_path)
                }))
                .map_err(panic_to_string)
                .and_then(|result| result);
                let _ = reply.send(res);
            }
            StorageCommand::AnalyzePmpImport { source_path, reply } => {
                let res = catch_unwind(AssertUnwindSafe(|| self.analyze_pmp_import(&source_path)))
                    .map_err(panic_to_string)
                    .and_then(|result| result);
                let _ = reply.send(res);
            }
            StorageCommand::ImportPmpIntoProject {
                source_path,
                target_project_id,
                reply,
            } => {
                let res = catch_unwind(AssertUnwindSafe(|| {
                    self.import_pmp_into_project(&source_path, &target_project_id)
                }))
                .map_err(panic_to_string)
                .and_then(|result| result);
                let _ = reply.send(res);
            }
            StorageCommand::DeleteMediaAsset {
                project_id,
                asset_id,
                reply,
            } => {
                let res = catch_unwind(AssertUnwindSafe(|| {
                    self.delete_media_asset(&project_id, &asset_id)
                }))
                .map_err(panic_to_string)
                .and_then(|result| result);
                let _ = reply.send(res);
            }
            StorageCommand::ResolveMediaAsset {
                project_id,
                asset_id,
                reply,
            } => {
                let res = catch_unwind(AssertUnwindSafe(|| {
                    self.resolve_media_asset(&project_id, &asset_id)
                }))
                .map_err(panic_to_string)
                .and_then(|result| result);
                let _ = reply.send(res);
            }
            StorageCommand::OptimizeProjectStorage { project_id, reply } => {
                let res = catch_unwind(AssertUnwindSafe(|| {
                    self.optimize_project_storage(&project_id)
                }))
                .map_err(panic_to_string)
                .and_then(|result| result);
                let _ = reply.send(res);
            }
            StorageCommand::GetProjectHealth { project_id, reply } => {
                let res = (|| -> Result<Value, String> {
                    let integrity = self.db.verify_integrity().map_err(|e| e.to_string())?;
                    let summary =
                        project_storage_summary(&self.db.conn, &self.db.pmp_path, &project_id)?;
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
                    let last_optimized_at: Option<String> = self
                        .db
                        .conn
                        .query_row(
                            "SELECT json_extract(value, '$.optimizedAt') FROM sys_config WHERE key = ?1",
                            [format!("storage_optimized:{project_id}")],
                            |r| r.get(0),
                        )
                        .ok();
                    Ok(json!({
                        "projectId": project_id,
                        "databasePath": self.db.pmp_path.to_string_lossy().to_string(),
                        "databaseSizeBytes": summary.get("databaseSizeBytes").cloned().unwrap_or_else(|| json!(0)),
                        "walSizeBytes": summary.get("walSizeBytes").cloned().unwrap_or_else(|| json!(0)),
                        "freelistBytes": summary.get("freelistBytes").cloned().unwrap_or_else(|| json!(0)),
                        "featureCount": summary.get("featureCount").cloned().unwrap_or_else(|| json!(0)),
                        "featureGroupCount": summary.get("featureGroupCount").cloned().unwrap_or_else(|| json!(0)),
                        "eventCount": summary.get("eventCount").cloned().unwrap_or_else(|| json!(0)),
                        "snapshotBytes": summary.get("snapshotBytes").cloned().unwrap_or_else(|| json!(0)),
                        "eventPayloadBytes": summary.get("eventPayloadBytes").cloned().unwrap_or_else(|| json!(0)),
                        "largeEventCount": summary.get("largeEventCount").cloned().unwrap_or_else(|| json!(0)),
                        "legacyMediaRefCount": summary.get("legacyMediaRefCount").cloned().unwrap_or_else(|| json!(0)),
                        "mediaAssetCount": summary.get("mediaAssetCount").cloned().unwrap_or_else(|| json!(0)),
                        "mediaAssetsSizeBytes": summary.get("mediaAssetsSizeBytes").cloned().unwrap_or_else(|| json!(0)),
                        "tableSizes": summary.get("tableSizes").cloned().unwrap_or_else(|| json!([])),
                        "integrityStatus": if integrity == "ok" { "ok" } else { "failed" },
                        "lastBackupAt": last_backup_at,
                        "lastIntegrityCheckAt": last_integrity_check_at,
                        "lastRestoreTestAt": last_restore_test_at,
                        "lastOptimizedAt": last_optimized_at,
                        "backupCount": backups.as_array().map(|a| a.len()).unwrap_or(0),
                        "checkedAt": chrono::Local::now().to_rfc3339(),
                    }))
                })();
                let _ = reply.send(res);
            }
            StorageCommand::GetPendingSyncOutbox { project_id, reply } => {
                let res = self.get_pending_sync_outbox(&project_id);
                let _ = reply.send(res);
            }
            StorageCommand::MarkOutboxSynced {
                event_ids,
                server_seq_start,
                ledger_hash,
                server_time,
                reply,
            } => {
                let res =
                    self.mark_outbox_synced(event_ids, server_seq_start, ledger_hash, server_time);
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
                    | StorageCommand::GetPendingSyncOutbox { .. }
                    | StorageCommand::MarkOutboxSynced { .. }
                    | StorageCommand::ImportMediaAsset { .. }
                    | StorageCommand::AnalyzePmpImport { .. }
                    | StorageCommand::ImportPmpIntoProject { .. }
                    | StorageCommand::DeleteMediaAsset { .. }
                    | StorageCommand::ResolveMediaAsset { .. }
                    | StorageCommand::OptimizeProjectStorage { .. }
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
        ensure_v8_compatibility(&self.db.conn).map_err(|e| e.to_string())?;
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

    fn import_media_asset(
        &mut self,
        project_id: &str,
        feature_id: &str,
        data_url: Option<String>,
        file_path: Option<String>,
    ) -> Result<Value, String> {
        let input = read_media_input(data_url, file_path)?;
        let tx = self.db.conn.transaction().map_err(|e| e.to_string())?;
        let asset = persist_media_asset(
            &tx,
            &self.db.base_dir,
            &self.db.pmp_path,
            project_id,
            Some(feature_id),
            &input.bytes,
            &input.mime_type,
        )?;
        rebuild_project_snapshot(&tx, project_id)?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(asset)
    }

    fn analyze_pmp_import(&self, source_path: &Path) -> Result<Value, String> {
        let source = inspect_source_pmp(source_path, Some(&self.db.pmp_path))?;
        Ok(json!({
            "sourceProjectName": source.project_name,
            "regions": source.region_count,
            "layers": source.layer_count,
            "groups": source.group_count,
            "features": source.feature_count,
            "mediaAssets": source.media_asset_count,
            "warnings": source.warnings,
        }))
    }

    fn import_pmp_into_project(
        &mut self,
        source_path: &Path,
        target_project_id: &str,
    ) -> Result<Value, String> {
        let source = inspect_source_pmp(source_path, Some(&self.db.pmp_path))?;
        ensure_target_project_exists(&self.db.conn, target_project_id)?;

        let tx = self.db.conn.transaction().map_err(|e| e.to_string())?;
        let remap =
            import_source_design_tables(&tx, &source.conn, &source.project_id, target_project_id)
                .map_err(|e| format!("Import design tables failed: {e}"))?;
        let media_counts = import_source_media_assets(
            &tx,
            &source,
            target_project_id,
            &self.db.base_dir,
            &self.db.pmp_path,
            &remap.feature_ids,
        )
        .map_err(|e| format!("Import media assets failed: {e}"))?;
        sync_feature_media_metadata(&tx, target_project_id)
            .map_err(|e| format!("Sync imported media metadata failed: {e}"))?;
        rebuild_project_snapshot(&tx, target_project_id)
            .map_err(|e| format!("Rebuild imported project snapshot failed: {e}"))?;
        tx.commit()
            .map_err(|e| format!("Commit imported .pmp transaction failed: {e}"))?;
        self.db
            .checkpoint_wal()
            .map_err(|e| format!("Checkpoint after .pmp import failed: {e}"))?;

        Ok(json!({
            "importedRegions": remap.region_count,
            "importedLayers": remap.layer_count,
            "importedGroups": remap.group_count,
            "importedFeatures": remap.feature_count,
            "importedMediaAssets": media_counts.imported_media_assets,
            "skippedMediaAssets": media_counts.skipped_media_assets,
            "importedAt": chrono::Local::now().to_rfc3339(),
        }))
    }

    fn delete_media_asset(&mut self, project_id: &str, asset_id: &str) -> Result<(), String> {
        let asset_record: Option<(String, Option<String>)> = self
            .db
            .conn
            .query_row(
                "SELECT ma.rel_path, fm.feature_id
                 FROM media_assets ma
                 LEFT JOIN feature_media fm ON fm.asset_id = ma.id
                 WHERE ma.project_id = ?1 AND ma.id = ?2
                 LIMIT 1",
                params![project_id, asset_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        let tx = self.db.conn.transaction().map_err(|e| e.to_string())?;
        if let Some((_, Some(feature_id))) = &asset_record {
            unlink_media_asset_from_feature_metadata(&tx, feature_id, asset_id)?;
        }
        tx.execute(
            "DELETE FROM feature_media WHERE asset_id = ?1",
            params![asset_id],
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            "DELETE FROM media_assets WHERE project_id = ?1 AND id = ?2",
            params![project_id, asset_id],
        )
        .map_err(|e| e.to_string())?;
        rebuild_project_snapshot(&tx, project_id)?;
        tx.commit().map_err(|e| e.to_string())?;
        if let Some((rel_path, _)) = asset_record {
            let full_path = self.db.base_dir.join(rel_path);
            let _ = fs::remove_file(full_path);
        }
        Ok(())
    }

    fn resolve_media_asset(&self, project_id: &str, asset_id: &str) -> Result<Value, String> {
        let mut asset = self
            .db
            .conn
            .query_row(
                "SELECT id, sha256, rel_path, mime_type, byte_size, width, height
                 FROM media_assets WHERE project_id = ?1 AND id = ?2",
                params![project_id, asset_id],
                |row| {
                    let rel_path: String = row.get(2)?;
                    let full_path = self.db.base_dir.join(&rel_path);
                    Ok(json!({
                        "id": row.get::<_, String>(0)?,
                        "assetId": row.get::<_, String>(0)?,
                        "projectId": project_id,
                        "sha256": row.get::<_, String>(1)?,
                        "relPath": rel_path,
                        "path": full_path.to_string_lossy().to_string(),
                        "mimeType": row.get::<_, String>(3)?,
                        "byteSize": row.get::<_, i64>(4)?,
                        "width": row.get::<_, Option<i64>>(5)?,
                        "height": row.get::<_, Option<i64>>(6)?,
                    }))
                },
            )
            .optional()
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("Media asset not found: {asset_id}"))?;
        let mut repaired_rel_path: Option<String> = None;
        if let Some(asset_obj) = asset.as_object_mut() {
            if let (Some(rel_path), Some(sha256), Some(mime_type)) = (
                asset_obj
                    .get("relPath")
                    .and_then(Value::as_str)
                    .map(ToString::to_string),
                asset_obj
                    .get("sha256")
                    .and_then(Value::as_str)
                    .map(ToString::to_string),
                asset_obj
                    .get("mimeType")
                    .and_then(Value::as_str)
                    .map(ToString::to_string),
            ) {
                let mut path = self.db.base_dir.join(&rel_path);
                if !path.exists() {
                    path = find_media_asset_file(&self.db.base_dir, &self.db.pmp_path, &sha256)
                        .ok_or_else(|| format!("Media asset file not found: {asset_id}"))?;
                    let next_rel_path = compute_rel_path(&path, &self.db.base_dir)?;
                    asset_obj.insert("relPath".to_string(), json!(next_rel_path.clone()));
                    repaired_rel_path = Some(next_rel_path);
                }
                let bytes =
                    fs::read(&path).map_err(|e| format!("Failed to read media asset: {e}"))?;
                asset_obj.insert(
                    "path".to_string(),
                    json!(path.to_string_lossy().to_string()),
                );
                asset_obj.insert(
                    "dataUrl".to_string(),
                    json!(format!(
                        "data:{};base64,{}",
                        mime_type,
                        general_purpose::STANDARD.encode(bytes)
                    )),
                );
            }
        }
        if let Some(rel_path) = repaired_rel_path {
            self.db
                .conn
                .execute(
                    "UPDATE media_assets SET rel_path = ?1 WHERE project_id = ?2 AND id = ?3",
                    params![rel_path, project_id, asset_id],
                )
                .map_err(|e| e.to_string())?;
        }
        Ok(asset)
    }

    fn optimize_project_storage(&mut self, project_id: &str) -> Result<Value, String> {
        let integrity_before = self.db.verify_integrity().map_err(|e| e.to_string())?;
        if integrity_before != "ok" {
            return Err(format!(
                "Cannot optimize project storage because integrity_check failed: {integrity_before}"
            ));
        }
        let before = project_storage_summary(&self.db.conn, &self.db.pmp_path, project_id)?;
        self.db
            .conn
            .execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
            .map_err(|e| e.to_string())?;
        let backup = backup_project_storage_optimization(&self.db.pmp_path, project_id)?;
        let tx = self.db.conn.transaction().map_err(|e| e.to_string())?;
        let migrated =
            migrate_feature_media(&tx, &self.db.base_dir, &self.db.pmp_path, project_id)?;
        let repaired_links =
            repair_media_links(&tx, &self.db.base_dir, &self.db.pmp_path, project_id)?;
        let compacted_events = compact_large_events(&tx, project_id)?;
        rebuild_project_snapshot(&tx, project_id)?;
        tx.execute(
            "UPDATE projects
             SET metadata_json = json_object('schema_version', '4.0.0', 'storage', json_object('snapshot', 'project_snapshots')),
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             WHERE id = ?1",
            params![project_id],
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT OR REPLACE INTO sys_config(key, value) VALUES(?1, ?2)",
            params![
                format!("storage_optimized:{project_id}"),
                json!({
                    "optimizedAt": chrono::Local::now().to_rfc3339(),
                    "backupPath": backup.to_string_lossy().to_string(),
                    "migratedMediaRefs": migrated,
                    "repairedMediaLinks": repaired_links,
                    "compactedEvents": compacted_events,
                    "before": before,
                })
                .to_string()
            ],
        )
        .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;

        self.db
            .conn
            .execute_batch(
                "PRAGMA wal_checkpoint(TRUNCATE); VACUUM; PRAGMA wal_checkpoint(TRUNCATE);",
            )
            .map_err(|e| e.to_string())?;
        let integrity_after = self.db.verify_integrity().map_err(|e| e.to_string())?;
        if integrity_after != "ok" {
            return Err(format!(
                "Storage optimization completed but integrity_check failed: {integrity_after}. Backup: {}",
                backup.display()
            ));
        }
        let after = project_storage_summary(&self.db.conn, &self.db.pmp_path, project_id)?;
        Ok(json!({
            "projectId": project_id,
            "backupPath": backup.to_string_lossy().to_string(),
            "migratedMediaRefs": migrated,
            "repairedMediaLinks": repaired_links,
            "compactedEvents": compacted_events,
            "integrityBefore": integrity_before,
            "integrityAfter": integrity_after,
            "before": before,
            "after": after,
            "optimizedAt": chrono::Local::now().to_rfc3339(),
        }))
    }

    fn auto_migrate_legacy_media_on_open(&mut self) -> Result<(), String> {
        let project_ids = list_project_ids(&self.db.conn)?;
        if project_ids.is_empty() {
            return Ok(());
        }

        let mut migrated_any = false;
        let mut backup_created = false;
        for project_id in project_ids {
            let needs_legacy_migration =
                project_needs_legacy_media_migration(&self.db.conn, &project_id)?;
            let needs_link_repair = project_needs_media_link_repair(&self.db.conn, &project_id)?;
            if !needs_legacy_migration && !needs_link_repair {
                continue;
            }
            if needs_legacy_migration && !backup_created {
                self.db
                    .conn
                    .execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
                    .map_err(|e| e.to_string())?;
                backup_legacy_media_migration(&self.db.pmp_path)?;
                backup_created = true;
            }

            let before = project_storage_summary(&self.db.conn, &self.db.pmp_path, &project_id)?;
            let tx = self.db.conn.transaction().map_err(|e| e.to_string())?;
            let hydrated_from_snapshot =
                hydrate_tables_from_legacy_snapshot_if_needed(&tx, &project_id)?;
            let migrated_refs =
                migrate_feature_media(&tx, &self.db.base_dir, &self.db.pmp_path, &project_id)?;
            let repaired_links =
                repair_media_links(&tx, &self.db.base_dir, &self.db.pmp_path, &project_id)?;
            let compacted_events = compact_large_events(&tx, &project_id)?;
            if hydrated_from_snapshot
                || migrated_refs > 0
                || compacted_events > 0
                || repaired_links > 0
            {
                rebuild_project_snapshot(&tx, &project_id)?;
                tx.execute(
                    "UPDATE projects
                     SET metadata_json = json_object('schema_version', '4.0.0', 'storage', json_object('snapshot', 'project_snapshots')),
                         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                     WHERE id = ?1",
                    params![&project_id],
                )
                .map_err(|e| e.to_string())?;
                tx.execute(
                    "INSERT OR REPLACE INTO sys_config(key, value) VALUES(?1, ?2)",
                    params![
                        format!("legacy_media_migrated:{project_id}"),
                        json!({
                            "migratedAt": chrono::Local::now().to_rfc3339(),
                            "migratedMediaRefs": migrated_refs,
                            "repairedMediaLinks": repaired_links,
                            "compactedEvents": compacted_events,
                            "hydratedFromSnapshot": hydrated_from_snapshot,
                            "before": before,
                        })
                        .to_string()
                    ],
                )
                .map_err(|e| e.to_string())?;
                migrated_any = true;
            }
            tx.commit().map_err(|e| e.to_string())?;
        }

        if migrated_any {
            self.db
                .conn
                .execute_batch(
                    "PRAGMA wal_checkpoint(TRUNCATE); VACUUM; PRAGMA wal_checkpoint(TRUNCATE);",
                )
                .map_err(|e| e.to_string())?;
        }
        Ok(())
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
                | StorageCommand::GetProjectHealth { .. }
                | StorageCommand::GetPendingSyncOutbox { .. }
                | StorageCommand::MarkOutboxSynced { .. }
                | StorageCommand::ImportMediaAsset { .. }
                | StorageCommand::AnalyzePmpImport { .. }
                | StorageCommand::ImportPmpIntoProject { .. }
                | StorageCommand::DeleteMediaAsset { .. }
                | StorageCommand::ResolveMediaAsset { .. }
                | StorageCommand::OptimizeProjectStorage { .. } => {}
            }
        }
        tx.commit().map_err(|e| e.to_string())
    }
}

struct SourcePmpContext {
    conn: Connection,
    project_id: String,
    project_name: String,
    base_dir: PathBuf,
    pmp_path: PathBuf,
    region_count: i64,
    layer_count: i64,
    group_count: i64,
    feature_count: i64,
    media_asset_count: i64,
    warnings: Vec<String>,
}

#[derive(Default)]
struct ImportedIdMaps {
    region_ids: HashMap<String, String>,
    layer_ids: HashMap<String, String>,
    group_ids: HashMap<String, String>,
    feature_ids: HashMap<String, String>,
    region_count: i64,
    layer_count: i64,
    group_count: i64,
    feature_count: i64,
}

#[derive(Default)]
struct ImportedMediaCounts {
    imported_media_assets: i64,
    skipped_media_assets: i64,
}

#[derive(Debug, Clone)]
struct SourceMediaAssetLink {
    feature_id: String,
    sort_order: i64,
    is_primary: bool,
}

#[derive(Debug, Clone)]
struct SourceMediaAssetRecord {
    asset_id: String,
    sha256: String,
    rel_path: String,
    mime_type: String,
    byte_size: i64,
    width: Option<i64>,
    height: Option<i64>,
    links: Vec<SourceMediaAssetLink>,
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

fn inspect_source_pmp(
    source_path: &Path,
    active_pmp_path: Option<&Path>,
) -> Result<SourcePmpContext, String> {
    if !source_path.exists() {
        return Err(format!(
            "Source .pmp file does not exist: {}",
            source_path.display()
        ));
    }

    let canonical_source = fs::canonicalize(source_path)
        .map_err(|e| format!("Failed to resolve source .pmp path: {e}"))?;
    if let Some(active_path) = active_pmp_path {
        let canonical_active =
            fs::canonicalize(active_path).unwrap_or_else(|_| active_path.to_path_buf());
        if canonical_source == canonical_active {
            return Err("Cannot import the currently opened .pmp file into itself.".to_string());
        }
    }

    let conn = Connection::open_with_flags(
        &canonical_source,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|e| format!("Failed to open source .pmp file: {e}"))?;
    conn.pragma_update(None, "query_only", "ON")
        .map_err(|e| format!("Failed to open source .pmp in read-only mode: {e}"))?;
    conn.pragma_update(None, "busy_timeout", "5000")
        .map_err(|e| format!("Failed to configure source .pmp connection: {e}"))?;

    let version: i32 = conn
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(|e| format!("Failed to read source .pmp schema version: {e}"))?;
    if version != CURRENT_SCHEMA_VERSION {
        return Err(format!(
            "Source .pmp schema version {version} is not supported for import. Expected version {CURRENT_SCHEMA_VERSION}."
        ));
    }

    let integrity: String = conn
        .query_row("PRAGMA integrity_check", [], |row| row.get(0))
        .map_err(|e| format!("Failed to verify source .pmp integrity: {e}"))?;
    if integrity != "ok" {
        return Err(format!(
            "Source .pmp failed integrity_check and cannot be imported: {integrity}"
        ));
    }

    let project_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM projects", [], |row| row.get(0))
        .map_err(|e| format!("Failed to inspect source projects: {e}"))?;
    if project_count <= 0 {
        return Err("Source .pmp does not contain any projects to import.".to_string());
    }

    let (project_id, project_name): (String, String) = conn
        .query_row(
            "SELECT id, COALESCE(NULLIF(name, ''), NULLIF(title, ''), 'Untitled Project') FROM projects ORDER BY created_at ASC, id ASC LIMIT 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| format!("Failed to load source project metadata: {e}"))?;

    let media_asset_count = conn
        .query_row(
            "SELECT COUNT(DISTINCT ma.id)
             FROM media_assets ma
             JOIN feature_media fm ON fm.asset_id = ma.id
             JOIN features f ON f.id = fm.feature_id
             WHERE ma.project_id = ?1 AND f.project_id = ?1",
            params![&project_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let mut warnings = Vec::new();
    if project_count > 1 {
        warnings.push(format!(
            "Source .pmp contains {project_count} projects; only the earliest project will be imported."
        ));
    }
    if media_asset_count == 0 {
        warnings.push("Source project does not contain linked media assets.".to_string());
    }

    let region_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM regions WHERE project_id = ?1",
            params![&project_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let layer_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM layers WHERE project_id = ?1",
            params![&project_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let group_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM feature_groups WHERE project_id = ?1",
            params![&project_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let feature_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM features WHERE project_id = ?1",
            params![&project_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    Ok(SourcePmpContext {
        conn,
        project_id,
        project_name,
        base_dir: canonical_source
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .to_path_buf(),
        pmp_path: canonical_source,
        region_count,
        layer_count,
        group_count,
        feature_count,
        media_asset_count,
        warnings,
    })
}

fn ensure_target_project_exists(conn: &Connection, project_id: &str) -> Result<(), String> {
    let exists: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM projects WHERE id = ?1",
            params![project_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to verify target project: {e}"))?;
    if exists == 0 {
        return Err(format!(
            "Target project was not found in the active workspace: {project_id}"
        ));
    }
    Ok(())
}

fn import_source_design_tables(
    tx: &Transaction<'_>,
    source_conn: &Connection,
    source_project_id: &str,
    target_project_id: &str,
) -> Result<ImportedIdMaps, String> {
    let mut remap = ImportedIdMaps::default();

    {
        let mut stmt = source_conn
            .prepare(
                "SELECT id, parent_id, name, description, metadata_json
                 FROM regions WHERE project_id = ?1 ORDER BY created_at, id",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![source_project_id], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, Option<String>>(4)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            let (old_id, parent_id, name, description, metadata_json) =
                row.map_err(|e| e.to_string())?;
            let new_id = uuid::Uuid::new_v4().to_string();
            let new_parent = parent_id
                .as_ref()
                .and_then(|id| remap.region_ids.get(id))
                .cloned();
            tx.execute(
                "INSERT INTO regions (id, project_id, parent_id, name, description, metadata_json)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    &new_id,
                    target_project_id,
                    new_parent,
                    name,
                    description,
                    normalize_json_object_text(metadata_json),
                ],
            )
            .map_err(|e| format!("Failed to import region {old_id}: {e}"))?;
            remap.region_ids.insert(old_id, new_id);
            remap.region_count += 1;
        }
    }

    {
        let mut stmt = source_conn
            .prepare(
                "SELECT id, region_id, name, is_visible, metadata_json
                 FROM layers WHERE project_id = ?1 ORDER BY created_at, id",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![source_project_id], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, Option<String>>(4)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            let (old_id, region_id, name, is_visible, metadata_json) =
                row.map_err(|e| e.to_string())?;
            let new_id = uuid::Uuid::new_v4().to_string();
            let new_region_id = region_id
                .as_ref()
                .and_then(|id| remap.region_ids.get(id))
                .cloned();
            tx.execute(
                "INSERT INTO layers (id, project_id, region_id, name, is_visible, metadata_json)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    &new_id,
                    target_project_id,
                    new_region_id,
                    name,
                    is_visible,
                    normalize_json_object_text(metadata_json),
                ],
            )
            .map_err(|e| format!("Failed to import layer {old_id}: {e}"))?;
            remap.layer_ids.insert(old_id, new_id);
            remap.layer_count += 1;
        }
    }

    {
        let mut stmt = source_conn
            .prepare(
                "SELECT id, layer_id, parent_id, name, group_type, is_visible, metadata_json
                 FROM feature_groups WHERE project_id = ?1 ORDER BY created_at, id",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![source_project_id], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, i64>(5)?,
                    row.get::<_, Option<String>>(6)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            let (old_id, layer_id, parent_id, name, group_type, is_visible, metadata_json) =
                row.map_err(|e| e.to_string())?;
            let new_id = uuid::Uuid::new_v4().to_string();
            let new_layer_id = remap
                .layer_ids
                .get(&layer_id)
                .cloned()
                .ok_or_else(|| format!("Missing remapped layer for source group {old_id}"))?;
            let new_parent_id = parent_id
                .as_ref()
                .and_then(|id| remap.group_ids.get(id))
                .cloned();
            tx.execute(
                "INSERT INTO feature_groups (id, project_id, layer_id, parent_id, name, group_type, is_visible, metadata_json)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    &new_id,
                    target_project_id,
                    new_layer_id,
                    new_parent_id,
                    name,
                    group_type,
                    is_visible,
                    normalize_json_object_text(metadata_json),
                ],
            )
            .map_err(|e| format!("Failed to import feature group {old_id}: {e}"))?;
            remap.group_ids.insert(old_id, new_id);
            remap.group_count += 1;
        }
    }

    {
        let mut stmt = source_conn
            .prepare(
                "SELECT id, layer_id, group_id, name, geom_type, coordinates_json, properties_json,
                        metadata_json, bbox_json, is_visible, note
                 FROM features WHERE project_id = ?1 ORDER BY created_at, id",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![source_project_id], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, Option<String>>(5)?,
                    row.get::<_, String>(6)?,
                    row.get::<_, Option<String>>(7)?,
                    row.get::<_, Option<String>>(8)?,
                    row.get::<_, i64>(9)?,
                    row.get::<_, Option<String>>(10)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            let (
                old_id,
                layer_id,
                group_id,
                name,
                geom_type,
                coordinates_json,
                properties_json,
                metadata_json,
                bbox_json,
                is_visible,
                note,
            ) = row.map_err(|e| e.to_string())?;
            let new_id = uuid::Uuid::new_v4().to_string();
            let new_layer_id = remap
                .layer_ids
                .get(&layer_id)
                .cloned()
                .ok_or_else(|| format!("Missing remapped layer for source feature {old_id}"))?;
            let new_group_id = group_id
                .as_ref()
                .and_then(|id| remap.group_ids.get(id))
                .cloned();
            remap.feature_ids.insert(old_id.clone(), new_id.clone());
            let _ = (
                coordinates_json,
                properties_json,
                metadata_json,
                bbox_json,
                is_visible,
                note,
                name,
                geom_type,
                new_layer_id,
                new_group_id,
                old_id,
                new_id,
            );
        }
    }

    {
        let mut stmt = source_conn
            .prepare(
                "SELECT id, layer_id, group_id, name, geom_type, coordinates_json, properties_json,
                        metadata_json, bbox_json, is_visible, note
                 FROM features WHERE project_id = ?1 ORDER BY created_at, id",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![source_project_id], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, Option<String>>(5)?,
                    row.get::<_, String>(6)?,
                    row.get::<_, Option<String>>(7)?,
                    row.get::<_, Option<String>>(8)?,
                    row.get::<_, i64>(9)?,
                    row.get::<_, Option<String>>(10)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            let (
                old_id,
                layer_id,
                group_id,
                name,
                geom_type,
                coordinates_json,
                properties_json,
                metadata_json,
                bbox_json,
                is_visible,
                note,
            ) = row.map_err(|e| e.to_string())?;
            let new_id = remap
                .feature_ids
                .get(&old_id)
                .cloned()
                .ok_or_else(|| format!("Missing remapped id for source feature {old_id}"))?;
            let new_layer_id = remap
                .layer_ids
                .get(&layer_id)
                .cloned()
                .ok_or_else(|| format!("Missing remapped layer for source feature {old_id}"))?;
            let new_group_id = group_id
                .as_ref()
                .and_then(|id| remap.group_ids.get(id))
                .cloned();
            let rewritten_metadata =
                rewrite_imported_feature_metadata(metadata_json.as_deref(), &remap.feature_ids);
            tx.execute(
                "INSERT INTO features (id, project_id, layer_id, group_id, name, geom_type, coordinates_json,
                                       properties_json, metadata_json, bbox_json, is_visible, note)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                params![
                    new_id,
                    target_project_id,
                    new_layer_id,
                    new_group_id,
                    name,
                    geom_type,
                    coordinates_json,
                    normalize_json_object_text(Some(properties_json)),
                    rewritten_metadata,
                    bbox_json,
                    is_visible,
                    note,
                ],
            )
            .map_err(|e| format!("Failed to import feature {old_id}: {e}"))?;
            remap.feature_count += 1;
        }
    }

    Ok(remap)
}

fn import_source_media_assets(
    tx: &Transaction<'_>,
    source: &SourcePmpContext,
    target_project_id: &str,
    target_base_dir: &Path,
    target_pmp_path: &Path,
    feature_id_map: &HashMap<String, String>,
) -> Result<ImportedMediaCounts, String> {
    let media_assets = collect_source_media_assets(&source.conn, &source.project_id)?;
    let mut counts = ImportedMediaCounts::default();
    for asset in media_assets {
        let mut source_file_path = if PathBuf::from(&asset.rel_path).is_absolute() {
            PathBuf::from(&asset.rel_path)
        } else {
            source.base_dir.join(&asset.rel_path)
        };
        if !source_file_path.exists() {
            if let Some(found) =
                find_media_asset_file(&source.base_dir, &source.pmp_path, &asset.sha256)
            {
                source_file_path = found;
            } else {
                counts.skipped_media_assets += 1;
                continue;
            }
        }

        let bytes = fs::read(&source_file_path).map_err(|e| {
            format!(
                "Failed to read source media asset {}: {e}",
                source_file_path.display()
            )
        })?;
        let new_asset_id = uuid::Uuid::new_v4().to_string();
        let rel_path = next_imported_media_rel_path(
            tx,
            target_project_id,
            target_pmp_path,
            &source.project_name,
            &asset.sha256,
            &asset.mime_type,
        )?;
        let target_path = target_base_dir.join(&rel_path);
        if let Some(parent) = target_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create imported media directory: {e}"))?;
        }
        fs::write(&target_path, &bytes)
            .map_err(|e| format!("Failed to copy imported media asset: {e}"))?;
        tx.execute(
            "INSERT INTO media_assets (id, project_id, sha256, rel_path, mime_type, byte_size, width, height)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                &new_asset_id,
                target_project_id,
                &asset.sha256,
                &rel_path,
                &asset.mime_type,
                asset.byte_size,
                asset.width,
                asset.height,
            ],
        )
        .map_err(|e| format!("Failed to import media asset {}: {e}", asset.asset_id))?;

        for link in asset.links {
            let Some(mapped_feature_id) = feature_id_map.get(&link.feature_id) else {
                continue;
            };
            tx.execute(
                "INSERT INTO feature_media (feature_id, asset_id, sort_order, is_primary)
                 VALUES (?1, ?2, ?3, ?4)",
                params![
                    mapped_feature_id,
                    &new_asset_id,
                    link.sort_order,
                    if link.is_primary { 1 } else { 0 },
                ],
            )
            .map_err(|e| {
                format!(
                    "Failed to link imported media asset {} to source feature {}: {e}",
                    asset.asset_id, link.feature_id
                )
            })?;
        }

        counts.imported_media_assets += 1;
    }
    Ok(counts)
}

fn collect_source_media_assets(
    source_conn: &Connection,
    source_project_id: &str,
) -> Result<Vec<SourceMediaAssetRecord>, String> {
    let mut stmt = source_conn
        .prepare(
            "SELECT ma.id, ma.sha256, ma.rel_path, ma.mime_type, ma.byte_size, ma.width, ma.height,
                    fm.feature_id, fm.sort_order, fm.is_primary
             FROM media_assets ma
             JOIN feature_media fm ON fm.asset_id = ma.id
             JOIN features f ON f.id = fm.feature_id
             WHERE ma.project_id = ?1 AND f.project_id = ?1
             ORDER BY ma.id, fm.sort_order, fm.asset_id",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![source_project_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, i64>(4)?,
                row.get::<_, Option<i64>>(5)?,
                row.get::<_, Option<i64>>(6)?,
                row.get::<_, String>(7)?,
                row.get::<_, i64>(8)?,
                row.get::<_, i64>(9)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut by_asset: HashMap<String, SourceMediaAssetRecord> = HashMap::new();
    for row in rows {
        let (
            asset_id,
            sha256,
            rel_path,
            mime_type,
            byte_size,
            width,
            height,
            feature_id,
            sort_order,
            is_primary,
        ) = row.map_err(|e| e.to_string())?;
        let entry = by_asset
            .entry(asset_id.clone())
            .or_insert_with(|| SourceMediaAssetRecord {
                asset_id: asset_id.clone(),
                sha256,
                rel_path,
                mime_type,
                byte_size,
                width,
                height,
                links: Vec::new(),
            });
        entry.links.push(SourceMediaAssetLink {
            feature_id,
            sort_order,
            is_primary: is_primary != 0,
        });
    }

    Ok(by_asset.into_values().collect())
}

fn normalize_json_object_text(value: Option<String>) -> String {
    let Some(text) = value else {
        return "{}".to_string();
    };
    let trimmed = text.trim();
    if trimmed.is_empty() || trimmed == "null" || trimmed == "undefined" {
        return "{}".to_string();
    }
    if let Ok(parsed) = serde_json::from_str::<Value>(trimmed) {
        if parsed.is_object() {
            return parsed.to_string();
        }
        return json!({}).to_string();
    }
    "{}".to_string()
}

fn rewrite_imported_feature_metadata(
    metadata_json: Option<&str>,
    feature_id_map: &HashMap<String, String>,
) -> String {
    let parsed = metadata_json
        .and_then(|text| serde_json::from_str::<Value>(text).ok())
        .unwrap_or_else(|| json!({}));
    let mut metadata = if parsed.is_object() {
        parsed
    } else {
        json!({})
    };
    rewrite_feature_reference_values(&mut metadata, feature_id_map);
    if let Some(media) = metadata.get_mut("media").and_then(Value::as_object_mut) {
        media.remove("imageAssetIds");
        media.remove("primaryImageAssetId");
        media.remove("imageUrls");
        media.remove("imageUrl");
    }
    metadata.to_string()
}

fn rewrite_feature_reference_values(value: &mut Value, feature_id_map: &HashMap<String, String>) {
    match value {
        Value::Object(map) => {
            for (key, child) in map.iter_mut() {
                match key.as_str() {
                    "parent_feature_id" | "start_node_id" | "end_node_id" | "from_feature_id"
                    | "to_feature_id" => {
                        if let Some(old_id) = child.as_str() {
                            if let Some(new_id) = feature_id_map.get(old_id) {
                                *child = json!(new_id);
                            }
                        }
                    }
                    "snap_links" => {
                        if let Some(links) = child.as_object_mut() {
                            for (_, link_value) in links.iter_mut() {
                                if let Some(old_id) = link_value.as_str() {
                                    if let Some(new_id) = feature_id_map.get(old_id) {
                                        *link_value = json!(new_id);
                                    }
                                }
                            }
                        }
                    }
                    "from_endpoint" | "to_endpoint" => {
                        if let Some(endpoint) = child.as_object_mut() {
                            let is_feature = endpoint
                                .get("type")
                                .and_then(Value::as_str)
                                .map(|value| value == "feature")
                                .unwrap_or(false);
                            if is_feature {
                                if let Some(old_id) = endpoint.get("id").and_then(Value::as_str) {
                                    if let Some(new_id) = feature_id_map.get(old_id) {
                                        endpoint.insert("id".to_string(), json!(new_id));
                                    }
                                }
                            }
                        }
                    }
                    _ => rewrite_feature_reference_values(child, feature_id_map),
                }
            }
        }
        Value::Array(items) => {
            for item in items.iter_mut() {
                rewrite_feature_reference_values(item, feature_id_map);
            }
        }
        _ => {}
    }
}

fn next_imported_media_rel_path(
    tx: &Transaction<'_>,
    project_id: &str,
    target_pmp_path: &Path,
    source_project_name: &str,
    sha256: &str,
    mime_type: &str,
) -> Result<String, String> {
    let assets_root = target_pmp_path
        .file_stem()
        .and_then(|stem| stem.to_str())
        .map(ToString::to_string)
        .unwrap_or_else(|| "project".to_string());
    let extension = extension_for_mime(mime_type);
    let import_segment = safe_path_segment(source_project_name, project_id);
    let base_rel = PathBuf::from(format!("{assets_root}.assets"))
        .join("imported-pmp")
        .join(import_segment)
        .join(format!("{sha256}.{extension}"));
    let mut attempt = 0_i64;
    loop {
        let candidate = if attempt == 0 {
            base_rel.clone()
        } else {
            let stem = format!("{sha256}-{attempt}.{extension}");
            PathBuf::from(format!("{assets_root}.assets"))
                .join("imported-pmp")
                .join(safe_path_segment(source_project_name, project_id))
                .join(stem)
        };
        let candidate_text = candidate.to_string_lossy().to_string();
        let exists: i64 = tx
            .query_row(
                "SELECT COUNT(*) FROM media_assets WHERE project_id = ?1 AND rel_path = ?2",
                params![project_id, &candidate_text],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        if exists == 0 {
            return Ok(candidate_text);
        }
        attempt += 1;
    }
}

struct MediaInput {
    bytes: Vec<u8>,
    mime_type: String,
}

fn read_media_input(
    data_url: Option<String>,
    file_path: Option<String>,
) -> Result<MediaInput, String> {
    match (data_url, file_path) {
        (Some(data_url), _) => decode_data_url(&data_url),
        (None, Some(file_path)) => {
            let path = PathBuf::from(&file_path);
            let bytes = fs::read(&path).map_err(|e| format!("Failed to read media file: {e}"))?;
            let mime_type = mime_guess::from_path(&path)
                .first_or_octet_stream()
                .essence_str()
                .to_string();
            Ok(MediaInput { bytes, mime_type })
        }
        (None, None) => Err("Either data_url or file_path is required".to_string()),
    }
}

fn decode_data_url(data_url: &str) -> Result<MediaInput, String> {
    let Some((header, encoded)) = data_url.split_once(',') else {
        return Err("Invalid data URL".to_string());
    };
    if !header.starts_with("data:") || !header.contains(";base64") {
        return Err("Only base64 data URLs are supported".to_string());
    }
    let mime_type = header
        .trim_start_matches("data:")
        .split(';')
        .next()
        .filter(|value| !value.is_empty())
        .unwrap_or("application/octet-stream")
        .to_string();
    let bytes = general_purpose::STANDARD
        .decode(encoded)
        .map_err(|e| format!("Invalid base64 media payload: {e}"))?;
    Ok(MediaInput { bytes, mime_type })
}

fn persist_media_asset(
    tx: &Transaction<'_>,
    base_dir: &Path,
    pmp_path: &Path,
    project_id: &str,
    feature_id: Option<&str>,
    bytes: &[u8],
    mime_type: &str,
) -> Result<Value, String> {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    let sha256 = hex::encode(hasher.finalize());
    let asset_scope = format!(
        "{}:{}:{}",
        project_id,
        feature_id.unwrap_or("global"),
        sha256
    );
    let asset_id =
        uuid::Uuid::new_v5(&uuid::Uuid::NAMESPACE_OID, asset_scope.as_bytes()).to_string();
    let extension = extension_for_mime(mime_type);
    let asset_dir_name = pmp_path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("project");
    let mut rel_path = PathBuf::from(format!("{asset_dir_name}.assets")).join("media");
    if let Some(feature_id) = feature_id {
        for segment in media_hierarchy_segments(tx, project_id, feature_id)? {
            rel_path = rel_path.join(segment);
        }
    }
    rel_path = rel_path.join(format!("{sha256}.{extension}"));
    let full_path = base_dir.join(&rel_path);
    if let Some(parent) = full_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create media directory: {e}"))?;
    }
    if !full_path.exists() {
        fs::write(&full_path, bytes).map_err(|e| format!("Failed to save media asset: {e}"))?;
    }
    let (width, height) = image::load_from_memory(bytes)
        .map(|image| (Some(image.width() as i64), Some(image.height() as i64)))
        .unwrap_or((None, None));
    let rel_path_text = rel_path.to_string_lossy().to_string();
    tx.execute(
        "INSERT INTO media_assets (id, project_id, sha256, rel_path, mime_type, byte_size, width, height)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT(id) DO UPDATE SET
            rel_path = excluded.rel_path,
            mime_type = excluded.mime_type,
            byte_size = excluded.byte_size,
            width = excluded.width,
            height = excluded.height",
        params![
            &asset_id,
            project_id,
            &sha256,
            &rel_path_text,
            mime_type,
            bytes.len() as i64,
            width,
            height,
        ],
    )
    .map_err(|e| e.to_string())?;
    if let Some(feature_id) = feature_id {
        let sort_order: i64 = tx
            .query_row(
                "SELECT COUNT(*) FROM feature_media WHERE feature_id = ?1",
                params![feature_id],
                |row| row.get(0),
            )
            .unwrap_or(0);
        let is_primary = if sort_order == 0 { 1 } else { 0 };
        tx.execute(
            "INSERT OR IGNORE INTO feature_media (feature_id, asset_id, sort_order, is_primary)
             VALUES (?1, ?2, ?3, ?4)",
            params![feature_id, asset_id, sort_order, is_primary],
        )
        .map_err(|e| e.to_string())?;
        link_media_asset_in_feature_metadata(tx, feature_id, &asset_id)?;
    }
    let display_path = fs::canonicalize(&full_path).unwrap_or_else(|_| full_path.clone());
    Ok(json!({
        "id": asset_id,
        "assetId": asset_id,
        "projectId": project_id,
        "featureId": feature_id,
        "sha256": sha256,
        "relPath": rel_path_text,
        "path": display_path.to_string_lossy().to_string(),
        "mimeType": mime_type,
        "byteSize": bytes.len() as i64,
        "width": width,
        "height": height,
        "dataUrl": format!(
            "data:{};base64,{}",
            mime_type,
            general_purpose::STANDARD.encode(bytes)
        ),
    }))
}

fn extension_for_mime(mime_type: &str) -> &'static str {
    match mime_type {
        "image/jpeg" | "image/jpg" => "jpg",
        "image/png" => "png",
        "image/webp" => "webp",
        "image/gif" => "gif",
        "image/bmp" => "bmp",
        _ => "bin",
    }
}

fn find_media_asset_file(base_dir: &Path, pmp_path: &Path, sha256: &str) -> Option<PathBuf> {
    let preferred_assets = pmp_path
        .file_stem()
        .and_then(|value| value.to_str())
        .map(|stem| base_dir.join(format!("{stem}.assets")));
    if let Some(found) = preferred_assets
        .as_ref()
        .and_then(|assets_dir| find_file_by_stem(assets_dir, sha256))
    {
        return Some(found);
    }

    let entries = fs::read_dir(base_dir).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        if !name.ends_with(".assets") {
            continue;
        }
        if preferred_assets
            .as_ref()
            .map(|preferred| preferred == &path)
            .unwrap_or(false)
        {
            continue;
        }
        if let Some(found) = find_file_by_stem(&path, sha256) {
            return Some(found);
        }
    }
    None
}

fn find_file_by_stem(root: &Path, stem: &str) -> Option<PathBuf> {
    let entries = fs::read_dir(root).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if let Some(found) = find_file_by_stem(&path, stem) {
                return Some(found);
            }
        } else if path
            .file_stem()
            .and_then(|value| value.to_str())
            .map(|value| value.eq_ignore_ascii_case(stem))
            .unwrap_or(false)
        {
            return Some(path);
        }
    }
    None
}

fn link_media_asset_in_feature_metadata(
    tx: &Transaction<'_>,
    feature_id: &str,
    asset_id: &str,
) -> Result<(), String> {
    let metadata_text: Option<String> = tx
        .query_row(
            "SELECT metadata_json FROM features WHERE id = ?1",
            params![feature_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let Some(metadata_text) = metadata_text else {
        return Ok(());
    };
    let mut metadata = serde_json::from_str::<Value>(&metadata_text).unwrap_or_else(|_| json!({}));
    let Some(metadata_obj) = metadata.as_object_mut() else {
        return Ok(());
    };
    let mut media = metadata_obj
        .remove("media")
        .filter(|value| value.is_object())
        .unwrap_or_else(|| json!({}));
    let media_obj = media.as_object_mut().expect("media object");
    let mut asset_ids = media_obj
        .get("imageAssetIds")
        .and_then(Value::as_array)
        .map(|values| {
            values
                .iter()
                .filter_map(Value::as_str)
                .map(ToString::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    if !asset_ids.iter().any(|value| value == asset_id) {
        asset_ids.push(asset_id.to_string());
    }
    media_obj.insert(
        "imageAssetIds".to_string(),
        Value::Array(asset_ids.iter().map(|value| json!(value)).collect()),
    );
    media_obj
        .entry("primaryImageAssetId".to_string())
        .or_insert_with(|| json!(asset_id));
    media_obj.remove("imageUrl");
    media_obj.remove("imageUrls");
    metadata_obj.remove("imageUrl");
    metadata_obj.remove("imageUrls");
    metadata_obj.insert("media".to_string(), media);
    tx.execute(
        "UPDATE features SET metadata_json = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
        params![metadata.to_string(), feature_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn unlink_media_asset_from_feature_metadata(
    tx: &Transaction<'_>,
    feature_id: &str,
    asset_id: &str,
) -> Result<(), String> {
    let metadata_text: Option<String> = tx
        .query_row(
            "SELECT metadata_json FROM features WHERE id = ?1",
            params![feature_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let Some(metadata_text) = metadata_text else {
        return Ok(());
    };
    let mut metadata = serde_json::from_str::<Value>(&metadata_text).unwrap_or_else(|_| json!({}));
    let Some(metadata_obj) = metadata.as_object_mut() else {
        return Ok(());
    };
    let Some(media_obj) = metadata_obj.get_mut("media").and_then(Value::as_object_mut) else {
        return Ok(());
    };
    let remaining = media_obj
        .get("imageAssetIds")
        .and_then(Value::as_array)
        .map(|values| {
            values
                .iter()
                .filter_map(Value::as_str)
                .filter(|value| *value != asset_id)
                .map(ToString::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    media_obj.insert(
        "imageAssetIds".to_string(),
        Value::Array(remaining.iter().map(|value| json!(value)).collect()),
    );
    if media_obj
        .get("primaryImageAssetId")
        .and_then(Value::as_str)
        .map(|value| value == asset_id)
        .unwrap_or(false)
    {
        if let Some(next_primary) = remaining.first() {
            media_obj.insert("primaryImageAssetId".to_string(), json!(next_primary));
        } else {
            media_obj.remove("primaryImageAssetId");
        }
    }
    tx.execute(
        "UPDATE features SET metadata_json = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
        params![metadata.to_string(), feature_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn media_hierarchy_segments(
    tx: &Transaction<'_>,
    project_id: &str,
    feature_id: &str,
) -> Result<Vec<String>, String> {
    let Some(feature) = load_feature_media_node(tx, feature_id)? else {
        return Ok(vec![safe_path_segment("unassigned", feature_id)]);
    };

    let mut segments = Vec::new();
    if let Some((region_name, region_id, layer_name, layer_id)) =
        load_layer_region_names(tx, project_id, &feature.layer_id)?
    {
        segments.push(safe_path_segment(&region_name, &region_id));
        segments.push(safe_path_segment(&layer_name, &layer_id));
    } else {
        segments.push("unassigned-layer".to_string());
    }

    if let Some(group_id) = feature.group_id.as_deref() {
        for group in load_group_chain(tx, project_id, group_id)? {
            segments.push(safe_path_segment(&group.name, &group.id));
        }
    }

    for parent in load_parent_feature_chain(tx, project_id, &feature)? {
        segments.push(safe_path_segment(&parent.name, &parent.id));
    }
    segments.push(safe_path_segment(&feature.name, &feature.id));
    Ok(segments)
}

#[derive(Debug, Clone)]
struct MediaFeatureNode {
    id: String,
    layer_id: String,
    group_id: Option<String>,
    name: String,
    parent_feature_id: Option<String>,
}

#[derive(Debug, Clone)]
struct MediaGroupNode {
    id: String,
    parent_id: Option<String>,
    name: String,
}

fn load_feature_media_node(
    tx: &Transaction<'_>,
    feature_id: &str,
) -> Result<Option<MediaFeatureNode>, String> {
    tx.query_row(
        "SELECT id, layer_id, group_id, name, metadata_json FROM features WHERE id = ?1",
        params![feature_id],
        |row| {
            let metadata_json: String = row.get(4)?;
            let metadata =
                serde_json::from_str::<Value>(&metadata_json).unwrap_or_else(|_| json!({}));
            Ok(MediaFeatureNode {
                id: row.get(0)?,
                layer_id: row.get(1)?,
                group_id: row.get(2)?,
                name: row.get(3)?,
                parent_feature_id: metadata
                    .get("parent_feature_id")
                    .and_then(Value::as_str)
                    .map(ToString::to_string),
            })
        },
    )
    .optional()
    .map_err(|e| e.to_string())
}

fn load_layer_region_names(
    tx: &Transaction<'_>,
    project_id: &str,
    layer_id: &str,
) -> Result<Option<(String, String, String, String)>, String> {
    tx.query_row(
        "SELECT COALESCE(r.name, 'Region'), COALESCE(r.id, 'region'), l.name, l.id
         FROM layers l
         LEFT JOIN regions r ON r.id = l.region_id
         WHERE l.project_id = ?1 AND l.id = ?2",
        params![project_id, layer_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
    )
    .optional()
    .map_err(|e| e.to_string())
}

fn load_group_chain(
    tx: &Transaction<'_>,
    project_id: &str,
    group_id: &str,
) -> Result<Vec<MediaGroupNode>, String> {
    let mut chain = Vec::new();
    let mut current_id = Some(group_id.to_string());
    let mut seen = std::collections::BTreeSet::new();
    while let Some(id) = current_id {
        if !seen.insert(id.clone()) {
            break;
        }
        let group = tx
            .query_row(
                "SELECT id, parent_id, name FROM feature_groups WHERE project_id = ?1 AND id = ?2",
                params![project_id, id],
                |row| {
                    Ok(MediaGroupNode {
                        id: row.get(0)?,
                        parent_id: row.get(1)?,
                        name: row.get(2)?,
                    })
                },
            )
            .optional()
            .map_err(|e| e.to_string())?;
        let Some(group) = group else {
            break;
        };
        current_id = group.parent_id.clone();
        chain.push(group);
    }
    chain.reverse();
    Ok(chain)
}

fn load_parent_feature_chain(
    tx: &Transaction<'_>,
    project_id: &str,
    feature: &MediaFeatureNode,
) -> Result<Vec<MediaFeatureNode>, String> {
    let mut chain = Vec::new();
    let mut current_id = feature.parent_feature_id.clone();
    let mut seen = std::collections::BTreeSet::new();
    while let Some(id) = current_id {
        if id == feature.id || !seen.insert(id.clone()) {
            break;
        }
        let Some(parent) = load_feature_media_node(tx, &id)? else {
            break;
        };
        if parent.layer_id != feature.layer_id {
            break;
        }
        current_id = parent.parent_feature_id.clone();
        if parent
            .group_id
            .as_deref()
            .map(|group_id| group_id == feature.group_id.as_deref().unwrap_or_default())
            .unwrap_or(feature.group_id.is_none())
            || parent.group_id.is_some()
        {
            chain.push(parent);
        }
    }
    chain.reverse();
    let filtered = chain
        .into_iter()
        .filter(|node| {
            tx.query_row(
                "SELECT COUNT(*) FROM features WHERE project_id = ?1 AND id = ?2",
                params![project_id, node.id],
                |row| row.get::<_, i64>(0),
            )
            .unwrap_or(0)
                > 0
        })
        .collect();
    Ok(filtered)
}

fn safe_path_segment(name: &str, id: &str) -> String {
    let mut cleaned = String::with_capacity(name.len());
    for ch in name.chars() {
        let invalid =
            matches!(ch, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') || ch.is_control();
        if invalid {
            cleaned.push('_');
        } else {
            cleaned.push(ch);
        }
    }
    let cleaned = cleaned.trim().trim_matches('.').trim();
    let fallback = if cleaned.is_empty() { "item" } else { cleaned };
    let short_id: String = id.chars().take(8).collect();
    format!("{fallback} [{short_id}]")
}

fn wal_path_for(pmp_path: &Path) -> PathBuf {
    PathBuf::from(format!("{}-wal", pmp_path.to_string_lossy()))
}

fn backup_project_storage_optimization(
    pmp_path: &Path,
    project_id: &str,
) -> Result<PathBuf, String> {
    let backup_dir = pmp_path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .join("backups")
        .join(project_id)
        .join("storage_optimize");
    fs::create_dir_all(&backup_dir)
        .map_err(|e| format!("Failed to create optimization backup directory: {e}"))?;
    let stem = pmp_path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("project");
    let backup_path = backup_dir.join(format!(
        "{}_before_optimize_{}.pmp",
        safe_path_segment(stem, project_id),
        chrono::Local::now().format("%Y%m%d_%H%M%S")
    ));
    backup_database_snapshot(pmp_path, &backup_path)
        .map_err(|e| format!("Failed to backup .pmp before optimization: {e}"))?;
    Ok(backup_path)
}

fn project_storage_summary(
    conn: &rusqlite::Connection,
    pmp_path: &Path,
    project_id: &str,
) -> Result<Value, String> {
    let db_size = fs::metadata(pmp_path).map(|m| m.len()).unwrap_or(0);
    let wal_size = fs::metadata(wal_path_for(pmp_path))
        .map(|m| m.len())
        .unwrap_or(0);
    let page_size: i64 = conn
        .pragma_query_value(None, "page_size", |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let freelist_count: i64 = conn
        .pragma_query_value(None, "freelist_count", |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let (media_count, media_bytes): (i64, i64) = conn
        .query_row(
            "SELECT COUNT(*), COALESCE(SUM(byte_size), 0) FROM media_assets WHERE project_id = ?1",
            params![project_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| e.to_string())?;
    let feature_count = count_project_rows(conn, "features", project_id)?;
    let group_count = count_project_rows(conn, "feature_groups", project_id)?;
    let event_count = count_project_rows(conn, "events", project_id)?;
    let snapshot_bytes: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(length(state_json)), 0) FROM project_snapshots WHERE project_id = ?1",
            params![project_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let event_payload_bytes: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(length(payload_json)), 0) FROM events WHERE project_id = ?1",
            params![project_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let large_event_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM events WHERE project_id = ?1 AND length(payload_json) > ?2",
            params![project_id, MAX_EVENT_PAYLOAD_BYTES as i64],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let legacy_media_ref_count: i64 = legacy_media_ref_count(conn, project_id)?;
    let table_sizes = table_size_summary_for_conn(conn).unwrap_or_else(|_| json!([]));
    Ok(json!({
        "databaseSizeBytes": db_size,
        "walSizeBytes": wal_size,
        "freelistBytes": freelist_count * page_size,
        "featureCount": feature_count,
        "featureGroupCount": group_count,
        "eventCount": event_count,
        "snapshotBytes": snapshot_bytes,
        "eventPayloadBytes": event_payload_bytes,
        "largeEventCount": large_event_count,
        "legacyMediaRefCount": legacy_media_ref_count,
        "mediaAssetCount": media_count,
        "mediaAssetsSizeBytes": media_bytes,
        "tableSizes": table_sizes,
    }))
}

fn count_project_rows(
    conn: &rusqlite::Connection,
    table_name: &str,
    project_id: &str,
) -> Result<i64, String> {
    let sql = format!("SELECT COUNT(*) FROM {table_name} WHERE project_id = ?1");
    conn.query_row(&sql, params![project_id], |row| row.get(0))
        .map_err(|e| e.to_string())
}

fn legacy_media_ref_count(conn: &rusqlite::Connection, project_id: &str) -> Result<i64, String> {
    let feature_hits: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM features WHERE project_id = ?1 AND metadata_json LIKE '%data:image%'",
            params![project_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let snapshot_hits: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM project_snapshots WHERE project_id = ?1 AND state_json LIKE '%data:image%'",
            params![project_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let project_hits: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM projects WHERE id = ?1 AND metadata_json LIKE '%data:image%'",
            params![project_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(feature_hits + snapshot_hits + project_hits)
}

fn table_size_summary_for_conn(conn: &rusqlite::Connection) -> Result<Value, String> {
    let mut stmt = conn
        .prepare(
            "SELECT name, SUM(pgsize) AS bytes
             FROM dbstat
             GROUP BY name
             ORDER BY bytes DESC
             LIMIT 12",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(json!({
                "name": row.get::<_, String>(0)?,
                "bytes": row.get::<_, i64>(1)?,
            }))
        })
        .map_err(|e| e.to_string())?;
    let mut values = Vec::new();
    for row in rows {
        values.push(row.map_err(|e| e.to_string())?);
    }
    Ok(Value::Array(values))
}

fn list_project_ids(conn: &rusqlite::Connection) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare("SELECT id FROM projects ORDER BY created_at, id")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    let mut ids = Vec::new();
    for row in rows {
        ids.push(row.map_err(|e| e.to_string())?);
    }
    Ok(ids)
}

fn project_needs_legacy_media_migration(
    conn: &rusqlite::Connection,
    project_id: &str,
) -> Result<bool, String> {
    let feature_hits: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM features WHERE project_id = ?1 AND metadata_json LIKE '%data:image%' LIMIT 1",
            params![project_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if feature_hits > 0 {
        return Ok(true);
    }

    let snapshot_hits: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM project_snapshots WHERE project_id = ?1 AND state_json LIKE '%data:image%' LIMIT 1",
            params![project_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if snapshot_hits > 0 {
        return Ok(true);
    }

    let project_hits: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM projects WHERE id = ?1 AND metadata_json LIKE '%data:image%' LIMIT 1",
            params![project_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if project_hits > 0 {
        return Ok(true);
    }

    let large_event_hits: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM events WHERE project_id = ?1 AND length(payload_json) > ?2 LIMIT 1",
            params![project_id, MAX_EVENT_PAYLOAD_BYTES as i64],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(large_event_hits > 0)
}

fn project_needs_media_link_repair(
    conn: &rusqlite::Connection,
    project_id: &str,
) -> Result<bool, String> {
    let asset_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM media_assets WHERE project_id = ?1",
            params![project_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let feature_link_count: i64 = conn
        .query_row(
            "SELECT COUNT(*)
             FROM feature_media fm
             JOIN features f ON f.id = fm.feature_id
             WHERE f.project_id = ?1",
            params![project_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(asset_count > 0 || feature_link_count > 0)
}

fn repair_media_links(
    tx: &Transaction<'_>,
    base_dir: &Path,
    pmp_path: &Path,
    project_id: &str,
) -> Result<usize, String> {
    let mut repaired = normalize_media_asset_paths(tx, base_dir, pmp_path, project_id)?;
    repaired += sync_feature_media_metadata(tx, project_id)?;
    Ok(repaired)
}

fn normalize_media_asset_paths(
    tx: &Transaction<'_>,
    base_dir: &Path,
    pmp_path: &Path,
    project_id: &str,
) -> Result<usize, String> {
    let mut stmt = tx
        .prepare("SELECT id, sha256, rel_path FROM media_assets WHERE project_id = ?1")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![project_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    let mut records = Vec::new();
    for row in rows {
        records.push(row.map_err(|e| e.to_string())?);
    }
    drop(stmt);

    let mut repaired = 0usize;
    for (asset_id, sha256, rel_path) in records {
        let stored_path = PathBuf::from(&rel_path);
        let current_path = if stored_path.is_absolute() {
            stored_path.clone()
        } else {
            base_dir.join(&stored_path)
        };

        let next_path = if current_path.exists() {
            current_path
        } else if let Some(found) = find_media_asset_file(base_dir, pmp_path, &sha256) {
            found
        } else {
            continue;
        };

        let next_rel_path = compute_rel_path(&next_path, base_dir)?;
        if next_rel_path != rel_path {
            tx.execute(
                "UPDATE media_assets SET rel_path = ?1 WHERE project_id = ?2 AND id = ?3",
                params![next_rel_path, project_id, asset_id],
            )
            .map_err(|e| e.to_string())?;
            repaired += 1;
        }
    }
    Ok(repaired)
}

fn sync_feature_media_metadata(tx: &Transaction<'_>, project_id: &str) -> Result<usize, String> {
    let mut stmt = tx
        .prepare(
            "SELECT fm.feature_id, fm.asset_id
             FROM feature_media fm
             JOIN features f ON f.id = fm.feature_id
             JOIN media_assets ma ON ma.id = fm.asset_id
             WHERE f.project_id = ?1 AND ma.project_id = ?1
             ORDER BY fm.feature_id, fm.sort_order, fm.asset_id",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![project_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?;
    let mut grouped: std::collections::BTreeMap<String, Vec<String>> =
        std::collections::BTreeMap::new();
    for row in rows {
        let (feature_id, asset_id) = row.map_err(|e| e.to_string())?;
        grouped.entry(feature_id).or_default().push(asset_id);
    }
    drop(stmt);

    let mut repaired = 0usize;
    for (feature_id, asset_ids) in grouped {
        let metadata_text: Option<String> = tx
            .query_row(
                "SELECT metadata_json FROM features WHERE project_id = ?1 AND id = ?2",
                params![project_id, feature_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        let Some(metadata_text) = metadata_text else {
            continue;
        };
        let mut metadata =
            serde_json::from_str::<Value>(&metadata_text).unwrap_or_else(|_| json!({}));
        let Some(metadata_obj) = metadata.as_object_mut() else {
            continue;
        };
        let mut media = metadata_obj
            .remove("media")
            .filter(|value| value.is_object())
            .unwrap_or_else(|| json!({}));
        let media_obj = media.as_object_mut().expect("media object");
        let existing = media_obj
            .get("imageAssetIds")
            .and_then(Value::as_array)
            .map(|values| {
                values
                    .iter()
                    .filter_map(Value::as_str)
                    .map(ToString::to_string)
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        let existing_primary = media_obj
            .get("primaryImageAssetId")
            .and_then(Value::as_str)
            .map(ToString::to_string);
        let next_primary = asset_ids.first().cloned();

        if existing == asset_ids && existing_primary == next_primary {
            metadata_obj.insert("media".to_string(), media);
            continue;
        }

        media_obj.insert(
            "imageAssetIds".to_string(),
            Value::Array(asset_ids.iter().map(|asset_id| json!(asset_id)).collect()),
        );
        if let Some(primary) = next_primary {
            media_obj.insert("primaryImageAssetId".to_string(), json!(primary));
        } else {
            media_obj.remove("primaryImageAssetId");
        }
        media_obj.remove("imageUrl");
        media_obj.remove("imageUrls");
        metadata_obj.remove("imageUrl");
        metadata_obj.remove("imageUrls");
        metadata_obj.insert("media".to_string(), media);

        tx.execute(
            "UPDATE features SET metadata_json = ?1, updated_at = CURRENT_TIMESTAMP WHERE project_id = ?2 AND id = ?3",
            params![metadata.to_string(), project_id, feature_id],
        )
        .map_err(|e| e.to_string())?;
        repaired += 1;
    }
    Ok(repaired)
}

fn backup_legacy_media_migration(pmp_path: &Path) -> Result<(), String> {
    let backup_path = next_legacy_backup_path(pmp_path);
    backup_database_snapshot(pmp_path, &backup_path)
        .map_err(|e| format!("Failed to backup .pmp before media migration: {e}"))?;
    Ok(())
}

fn backup_database_snapshot(source_path: &Path, backup_path: &Path) -> Result<(), String> {
    let source = Connection::open_with_flags(
        source_path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|e| e.to_string())?;
    let mut destination = Connection::open_with_flags(
        backup_path,
        OpenFlags::SQLITE_OPEN_READ_WRITE
            | OpenFlags::SQLITE_OPEN_CREATE
            | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|e| e.to_string())?;
    {
        let backup = Backup::new_with_names(
            &source,
            DatabaseName::Main,
            &mut destination,
            DatabaseName::Main,
        )
        .map_err(|e| e.to_string())?;
        backup
            .run_to_completion(64, Duration::from_millis(10), None)
            .map_err(|e| e.to_string())?;
    }
    destination
        .execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn next_legacy_backup_path(pmp_path: &Path) -> PathBuf {
    let preferred = PathBuf::from(format!("{}.bak", pmp_path.to_string_lossy()));
    if !preferred.exists() {
        return preferred;
    }
    PathBuf::from(format!(
        "{}.bak.{}",
        pmp_path.to_string_lossy(),
        chrono::Local::now().format("%Y%m%d_%H%M%S")
    ))
}

fn hydrate_tables_from_legacy_snapshot_if_needed(
    tx: &Transaction<'_>,
    project_id: &str,
) -> Result<bool, String> {
    let feature_count: i64 = tx
        .query_row(
            "SELECT COUNT(*) FROM features WHERE project_id = ?1",
            params![project_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if feature_count > 0 {
        return Ok(false);
    }

    let state = load_legacy_design_state(tx, project_id)?;
    if !state_has_design_data(&state) {
        return Ok(false);
    }
    replace_state_tables(tx, project_id, &state)?;
    Ok(true)
}

fn load_legacy_design_state(tx: &Transaction<'_>, project_id: &str) -> Result<Value, String> {
    let snapshot_state: Option<String> = tx
        .query_row(
            "SELECT state_json FROM project_snapshots WHERE project_id = ?1",
            params![project_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if let Some(text) = snapshot_state {
        let value = serde_json::from_str::<Value>(&text).unwrap_or_else(|_| json!({}));
        if state_has_design_data(&value) {
            return Ok(value);
        }
    }

    let metadata_state: Option<String> = tx
        .query_row(
            "SELECT metadata_json FROM projects WHERE id = ?1",
            params![project_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(metadata_state
        .and_then(|text| serde_json::from_str::<Value>(&text).ok())
        .unwrap_or_else(|| json!({})))
}

fn state_has_design_data(state: &Value) -> bool {
    ["regions", "layers", "feature_groups", "features"]
        .iter()
        .any(|key| {
            state
                .get(*key)
                .and_then(Value::as_object)
                .map(|items| !items.is_empty())
                .unwrap_or(false)
        })
}

fn migrate_feature_media(
    tx: &Transaction<'_>,
    base_dir: &Path,
    pmp_path: &Path,
    project_id: &str,
) -> Result<usize, String> {
    let mut stmt = tx
        .prepare("SELECT id, metadata_json FROM features WHERE project_id = ?1")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![project_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?;
    let mut records = Vec::new();
    for row in rows {
        records.push(row.map_err(|e| e.to_string())?);
    }
    drop(stmt);

    let mut migrated_refs = 0usize;
    for (feature_id, metadata_text) in records {
        let mut metadata =
            serde_json::from_str::<Value>(&metadata_text).unwrap_or_else(|_| json!({}));
        let migrated = scrub_media_metadata(
            tx,
            base_dir,
            pmp_path,
            project_id,
            &feature_id,
            &mut metadata,
        )?;
        if migrated > 0 {
            migrated_refs += migrated;
            tx.execute(
                "UPDATE features SET metadata_json = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
                params![metadata.to_string(), feature_id],
            )
            .map_err(|e| e.to_string())?;
        }
    }
    Ok(migrated_refs)
}

fn scrub_media_metadata(
    tx: &Transaction<'_>,
    base_dir: &Path,
    pmp_path: &Path,
    project_id: &str,
    feature_id: &str,
    metadata: &mut Value,
) -> Result<usize, String> {
    let Some(obj) = metadata.as_object_mut() else {
        return Ok(0);
    };
    let mut sources = Vec::new();
    collect_media_sources(obj.remove("imageUrl"), &mut sources);
    collect_media_sources(obj.remove("imageUrls"), &mut sources);

    let mut media = obj
        .remove("media")
        .filter(|value| value.is_object())
        .unwrap_or_else(|| json!({}));
    if let Some(media_obj) = media.as_object_mut() {
        collect_media_sources(media_obj.remove("imageUrl"), &mut sources);
        collect_media_sources(media_obj.remove("imageUrls"), &mut sources);
    }

    let mut asset_ids = Vec::new();
    let mut external_urls = Vec::new();
    for source in sources {
        if source.starts_with("data:") {
            let input = decode_data_url(&source)?;
            let asset = persist_media_asset(
                tx,
                base_dir,
                pmp_path,
                project_id,
                Some(feature_id),
                &input.bytes,
                &input.mime_type,
            )?;
            if let Some(asset_id) = asset.get("assetId").and_then(Value::as_str) {
                asset_ids.push(asset_id.to_string());
            }
        } else if !source.trim().is_empty() {
            external_urls.push(source);
        }
    }

    if let Some(media_obj) = media.as_object_mut() {
        let mut existing = media_obj
            .get("imageAssetIds")
            .and_then(Value::as_array)
            .map(|values| {
                values
                    .iter()
                    .filter_map(Value::as_str)
                    .map(ToString::to_string)
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        for asset_id in asset_ids {
            if !existing.contains(&asset_id) {
                existing.push(asset_id);
            }
        }
        if !existing.is_empty() {
            if media_obj.get("primaryImageAssetId").is_none() {
                media_obj.insert(
                    "primaryImageAssetId".to_string(),
                    Value::String(existing[0].clone()),
                );
            }
            media_obj.insert(
                "imageAssetIds".to_string(),
                Value::Array(existing.iter().map(|id| json!(id)).collect()),
            );
        }
        if !external_urls.is_empty() {
            media_obj.insert(
                "externalUrls".to_string(),
                Value::Array(external_urls.iter().map(|url| json!(url)).collect()),
            );
        }
    }
    obj.insert("media".to_string(), media);
    Ok(obj
        .get("media")
        .and_then(|value| value.get("imageAssetIds"))
        .and_then(Value::as_array)
        .map(|values| values.len())
        .unwrap_or(0))
}

fn collect_media_sources(value: Option<Value>, sources: &mut Vec<String>) {
    match value {
        Some(Value::String(text)) => sources.push(text),
        Some(Value::Array(values)) => {
            for value in values {
                if let Some(text) = value.as_str() {
                    sources.push(text.to_string());
                }
            }
        }
        _ => {}
    }
}

fn compact_large_events(tx: &Transaction<'_>, project_id: &str) -> Result<usize, String> {
    let mut stmt = tx
        .prepare(
            "SELECT global_seq, entity_id, event_type, length(payload_json)
             FROM events
             WHERE project_id = ?1 AND length(payload_json) > ?2",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![project_id, MAX_EVENT_PAYLOAD_BYTES as i64], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i64>(3)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    let mut records = Vec::new();
    for row in rows {
        records.push(row.map_err(|e| e.to_string())?);
    }
    drop(stmt);

    for (global_seq, entity_id, event_type, original_bytes) in &records {
        let compacted = json!({
            "type": "CompactedEvent",
            "originalEventType": event_type,
            "entityId": entity_id,
            "originalPayloadBytes": original_bytes,
            "compactedAt": chrono::Local::now().to_rfc3339(),
            "reason": "payload exceeded storage budget"
        });
        tx.execute(
            "UPDATE events SET payload_json = ?1, metadata_json = json_patch(metadata_json, json(?2)) WHERE global_seq = ?3",
            params![
                compacted.to_string(),
                json!({"compacted": true}).to_string(),
                global_seq
            ],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(records.len())
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
    if payload.len() > MAX_EVENT_PAYLOAD_BYTES {
        return Err(format!(
            "Event payload is too large ({} bytes). Store media through import_media_asset before dispatching the event.",
            payload.len()
        ));
    }
    let meta = serde_json::to_string(&envelope.metadata.clone().unwrap_or_else(|| json!({})))
        .map_err(|e| e.to_string())?;
    let hash = envelope
        .hash
        .clone()
        .unwrap_or_else(|| envelope.calculate_hash());
    tx.execute(
        "INSERT INTO events (id, project_id, entity_type, entity_id, event_type, payload_json, metadata_json, device_id, entity_version, sync_status, hash)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'local', ?10)",
        params![
            envelope.id.to_string(),
            envelope.project_id.to_string(),
            envelope.entity_type,
            envelope.entity_id.to_string(),
            envelope.event.event_type(),
            payload,
            meta,
            envelope.device_id,
            envelope.version,
            hash,
        ],
    )
    .map_err(|e| e.to_string())?;
    persist_sync_outbox(tx, envelope)?;
    Ok(())
}

fn persist_sync_outbox(tx: &Transaction<'_>, envelope: &EventEnvelope) -> Result<(), String> {
    let request_json = serde_json::to_string(envelope).map_err(|e| e.to_string())?;
    let payload_json = serde_json::to_string(&envelope.event).map_err(|e| e.to_string())?;
    let batch_id = envelope
        .correlation_id
        .map(|id| id.to_string())
        .unwrap_or_else(|| envelope.id.to_string());
    tx.execute(
        "INSERT OR REPLACE INTO sync_outbox (
            event_id, batch_id, project_id, entity_type, entity_id, base_entity_version,
            request_json, payload_json, status, retry_count, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'pending', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
        params![
            envelope.id.to_string(),
            batch_id,
            envelope.project_id.to_string(),
            envelope.entity_type,
            envelope.entity_id.to_string(),
            envelope.version,
            request_json,
            payload_json,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

impl StorageWorker {
    fn get_pending_sync_outbox(&self, project_id: &str) -> Result<Vec<Value>, String> {
        let mut stmt = self
            .db
            .conn
            .prepare(
                "SELECT event_id, batch_id, entity_type, entity_id, base_entity_version, payload_json, status, retry_count, last_error, created_at, updated_at
                 FROM sync_outbox
                 WHERE project_id = ?1 AND status IN ('pending', 'failed', 'conflicted')
                 ORDER BY created_at ASC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![project_id], |row| {
                Ok(json!({
                    "eventId": row.get::<_, String>(0)?,
                    "batchId": row.get::<_, String>(1)?,
                    "entityType": row.get::<_, String>(2)?,
                    "entityId": row.get::<_, String>(3)?,
                    "baseEntityVersion": row.get::<_, i64>(4)?,
                    "payload": serde_json::from_str::<Value>(&row.get::<_, String>(5)?).unwrap_or(Value::Null),
                    "status": row.get::<_, String>(6)?,
                    "retryCount": row.get::<_, i64>(7)?,
                    "lastError": row.get::<_, Option<String>>(8)?,
                    "createdAt": row.get::<_, String>(9)?,
                    "updatedAt": row.get::<_, String>(10)?,
                }))
            })
            .map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row.map_err(|e| e.to_string())?);
        }
        Ok(out)
    }

    fn mark_outbox_synced(
        &mut self,
        event_ids: Vec<String>,
        server_seq_start: Option<i64>,
        ledger_hash: Option<String>,
        server_time: Option<String>,
    ) -> Result<usize, String> {
        if event_ids.is_empty() {
            return Ok(0);
        }
        let tx = self.db.conn.transaction().map_err(|e| e.to_string())?;
        let mut updated = 0usize;
        for (offset, event_id) in event_ids.into_iter().enumerate() {
            let server_seq = server_seq_start.map(|seq| seq + offset as i64);
            let ledger_hash_value = ledger_hash.clone();
            let server_time_value = server_time.clone();
            tx.execute(
                "UPDATE sync_outbox
                 SET status = 'acked',
                     acked_at = COALESCE(acked_at, CURRENT_TIMESTAMP),
                     updated_at = CURRENT_TIMESTAMP,
                     server_seq = COALESCE(?2, server_seq),
                     server_hash = COALESCE(?3, server_hash),
                     server_time = COALESCE(?4, server_time)
                 WHERE event_id = ?1",
                params![event_id, server_seq, ledger_hash_value, server_time_value],
            )
            .map_err(|e| e.to_string())?;
            tx.execute(
                "UPDATE events
                 SET sync_status = 'acked',
                     acked_at = COALESCE(acked_at, CURRENT_TIMESTAMP),
                     server_seq = COALESCE(?2, server_seq),
                     ledger_hash = COALESCE(?3, ledger_hash),
                     server_time = COALESCE(?4, server_time)
                 WHERE id = ?1",
                params![
                    event_id,
                    server_seq,
                    ledger_hash.clone(),
                    server_time.clone()
                ],
            )
            .map_err(|e| e.to_string())?;
            updated += 1;
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(updated)
    }
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
            project_fiber_cable_if_eligible(tx, &project_id, &id.to_string(), geom_type, &metadata)?;
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
            let geom_type = current.get("geom_type").and_then(Value::as_str).unwrap_or("Point");
            let metadata = parse_json_field(current.get("metadata").unwrap_or(&Value::Null), json!({}));
            project_fiber_cable_if_eligible(tx, &project_id, &id.to_string(), geom_type, &metadata)?;
        }
        AppEvent::FeatureDeleted { id } => {
            tx.execute(
                "DELETE FROM features WHERE id = ?1",
                params![id.to_string()],
            )
            .map_err(|e| e.to_string())?;
        }
        AppEvent::EquipmentUpserted {
            id,
            project_id: _proj_id, // `project_id` is already in scope from loop
            feature_id,
            equipment_type,
            status,
        } => {
            tx.execute(
                "INSERT OR REPLACE INTO equipment (id, project_id, feature_id, equipment_type, status, updated_at) VALUES (?1, ?2, ?3, ?4, COALESCE(?5, (SELECT status FROM equipment WHERE id = ?1), 'active'), CURRENT_TIMESTAMP)",
                params![
                    id.to_string(),
                    project_id,
                    feature_id.to_string(),
                    equipment_type.to_string(),
                    status
                ],
            )
            .map_err(|e| e.to_string())?;
        }
        AppEvent::FiberCableUpserted {
            id,
            project_id,
            feature_id,
            cable_type,
            fiber_count,
            owner,
            status,
            source,
        } => {
            tx.execute(
                "INSERT INTO fiber_cables (id, project_id, feature_id, cable_type, fiber_count, owner, status, source, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, COALESCE(?7, 'planned'), COALESCE(?8, 'manual'), CURRENT_TIMESTAMP)
                 ON CONFLICT(id) DO UPDATE SET
                    project_id = excluded.project_id,
                    feature_id = excluded.feature_id,
                    cable_type = excluded.cable_type,
                    fiber_count = excluded.fiber_count,
                    owner = excluded.owner,
                    status = excluded.status,
                    source = excluded.source,
                    updated_at = CURRENT_TIMESTAMP",
                params![
                    id.to_string(),
                    project_id.to_string(),
                    feature_id.to_string(),
                    cable_type.as_deref(),
                    fiber_count,
                    owner.as_deref(),
                    status.as_deref(),
                    source.as_deref(),
                ],
            )
            .map_err(|e| e.to_string())?;
        }
        AppEvent::FiberCablePointsMaterialized {
            project_id,
            cable_id,
            points,
            ..
        } => {
            tx.execute(
                "DELETE FROM fiber_cable_points WHERE cable_id = ?1",
                params![cable_id.to_string()],
            )
            .map_err(|e| e.to_string())?;

            for point in points {
                let id = point
                    .get("id")
                    .and_then(Value::as_str)
                    .ok_or_else(|| "Fiber cable point missing id".to_string())?;
                let feature_id = point
                    .get("feature_id")
                    .and_then(Value::as_str)
                    .ok_or_else(|| "Fiber cable point missing feature_id".to_string())?;
                let point_kind = point
                    .get("point_kind")
                    .and_then(Value::as_str)
                    .unwrap_or("splice_enclosure");
                let sequence_no = point
                    .get("sequence_no")
                    .and_then(Value::as_i64)
                    .unwrap_or(0);
                let vertex_index = point.get("vertex_index").and_then(Value::as_i64);

                tx.execute(
                    "INSERT INTO fiber_cable_points (
                        id, project_id, cable_id, feature_id, point_kind, sequence_no, vertex_index, updated_at
                     )
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, CURRENT_TIMESTAMP)
                     ON CONFLICT(id) DO UPDATE SET
                        project_id = excluded.project_id,
                        cable_id = excluded.cable_id,
                        feature_id = excluded.feature_id,
                        point_kind = excluded.point_kind,
                        sequence_no = excluded.sequence_no,
                        vertex_index = excluded.vertex_index,
                        updated_at = CURRENT_TIMESTAMP",
                    params![
                        id,
                        project_id.to_string(),
                        cable_id.to_string(),
                        feature_id,
                        point_kind,
                        sequence_no,
                        vertex_index,
                    ],
                )
                .map_err(|e| e.to_string())?;
            }
        }
        AppEvent::FiberStrandsInitialized { cable_id, fiber_count, strands } => {
            tx.execute(
                "UPDATE fiber_cables SET fiber_count = ?2, updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
                params![cable_id.to_string(), fiber_count],
            )
            .map_err(|e| e.to_string())?;
            tx.execute(
                "DELETE FROM fiber_strands WHERE cable_id = ?1",
                params![cable_id.to_string()],
            )
            .map_err(|e| e.to_string())?;

            if strands.is_empty() && *fiber_count > 0 {
                for strand_no in 1..=*fiber_count {
                    tx.execute(
                        "INSERT INTO fiber_strands (id, cable_id, strand_no, color, status, updated_at)
                         VALUES (?1, ?2, ?3, NULL, 'available', CURRENT_TIMESTAMP)
                         ON CONFLICT(id) DO UPDATE SET
                            cable_id = excluded.cable_id,
                            strand_no = excluded.strand_no,
                            color = excluded.color,
                            status = excluded.status,
                            updated_at = CURRENT_TIMESTAMP",
                        params![
                            uuid::Uuid::new_v4().to_string(),
                            cable_id.to_string(),
                            strand_no,
                        ],
                    )
                    .map_err(|e| e.to_string())?;
                }
            } else {
                for strand in strands {
                    let id = strand
                        .get("id")
                        .and_then(Value::as_str)
                        .map(|s| s.to_string())
                        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
                    let strand_no = strand
                        .get("strand_no")
                        .and_then(Value::as_i64)
                        .unwrap_or(0);
                    let color = strand
                        .get("color")
                        .and_then(Value::as_str)
                        .map(|value| value.to_string());
                    let status = strand
                        .get("status")
                        .and_then(Value::as_str)
                        .unwrap_or("available")
                        .to_string();
                    tx.execute(
                        "INSERT INTO fiber_strands (id, cable_id, strand_no, color, status, updated_at)
                         VALUES (?1, ?2, ?3, ?4, ?5, CURRENT_TIMESTAMP)
                         ON CONFLICT(id) DO UPDATE SET
                            cable_id = excluded.cable_id,
                            strand_no = excluded.strand_no,
                            color = excluded.color,
                            status = excluded.status,
                            updated_at = CURRENT_TIMESTAMP",
                        params![
                            id,
                            cable_id.to_string(),
                            strand_no,
                            color,
                            status,
                        ],
                    )
                    .map_err(|e| e.to_string())?;
                }
            }
        }
        AppEvent::FiberPortUpserted {
            id,
            feature_id,
            port_label,
            port_kind,
            direction,
            status,
        } => {
            tx.execute(
                "INSERT INTO fiber_ports (id, feature_id, port_label, port_kind, direction, status, updated_at)
                 VALUES (?1, ?2, ?3, ?4, COALESCE(?5, 'bidirectional'), COALESCE(?6, 'available'), CURRENT_TIMESTAMP)
                 ON CONFLICT(id) DO UPDATE SET
                    feature_id = excluded.feature_id,
                    port_label = excluded.port_label,
                    port_kind = excluded.port_kind,
                    direction = excluded.direction,
                    status = excluded.status,
                    updated_at = CURRENT_TIMESTAMP",
                params![
                    id.to_string(),
                    feature_id.to_string(),
                    port_label,
                    port_kind,
                    direction.as_deref(),
                    status.as_deref(),
                ],
            )
            .map_err(|e| e.to_string())?;
        }
        AppEvent::FiberPortTerminationUpserted {
            id,
            port_id,
            strand_id,
            strand_direction,
            side,
            status,
        } => {
            tx.execute(
                "INSERT INTO fiber_port_terminations (id, port_id, strand_id, strand_direction, side, status, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, COALESCE(?6, 'active'), CURRENT_TIMESTAMP)
                 ON CONFLICT(id) DO UPDATE SET
                    port_id = excluded.port_id,
                    strand_id = excluded.strand_id,
                    strand_direction = excluded.strand_direction,
                    side = excluded.side,
                    status = excluded.status,
                    updated_at = CURRENT_TIMESTAMP",
                params![
                    id.to_string(),
                    port_id.to_string(),
                    strand_id.to_string(),
                    strand_direction,
                    side,
                    status.as_deref(),
                ],
            )
            .map_err(|e| e.to_string())?;
        }
        AppEvent::FiberPortTerminationDeleted { id } => {
            tx.execute(
                "DELETE FROM fiber_port_terminations WHERE id = ?1",
                params![id.to_string()],
            )
            .map_err(|e| e.to_string())?;
        }
        AppEvent::FiberPortPatchUpserted {
            id,
            from_port_id,
            to_port_id,
            status,
            loss_db,
        } => {
            tx.execute(
                "INSERT INTO fiber_port_patches (id, from_port_id, to_port_id, status, loss_db, updated_at)
                 VALUES (?1, ?2, ?3, COALESCE(?4, 'active'), ?5, CURRENT_TIMESTAMP)
                 ON CONFLICT(id) DO UPDATE SET
                    from_port_id = excluded.from_port_id,
                    to_port_id = excluded.to_port_id,
                    status = excluded.status,
                    loss_db = excluded.loss_db,
                    updated_at = CURRENT_TIMESTAMP",
                params![
                    id.to_string(),
                    from_port_id.to_string(),
                    to_port_id.to_string(),
                    status.as_deref(),
                    loss_db,
                ],
            )
            .map_err(|e| e.to_string())?;
        }
        AppEvent::FiberPortPatchDeleted { id } => {
            tx.execute(
                "DELETE FROM fiber_port_patches WHERE id = ?1",
                params![id.to_string()],
            )
            .map_err(|e| e.to_string())?;
        }
        AppEvent::FiberSpliceUpserted {
            id,
            enclosure_feature_id,
            from_strand_id,
            to_strand_id,
            from_direction,
            to_direction,
            loss_db,
        } => {
            tx.execute(
                "INSERT INTO fiber_splices (id, enclosure_feature_id, from_strand_id, to_strand_id, from_direction, to_direction, loss_db, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, CURRENT_TIMESTAMP)
                 ON CONFLICT(id) DO UPDATE SET
                    enclosure_feature_id = excluded.enclosure_feature_id,
                    from_strand_id = excluded.from_strand_id,
                    to_strand_id = excluded.to_strand_id,
                    from_direction = excluded.from_direction,
                    to_direction = excluded.to_direction,
                    loss_db = excluded.loss_db,
                    updated_at = CURRENT_TIMESTAMP",
                params![
                    id.to_string(),
                    enclosure_feature_id.to_string(),
                    from_strand_id.to_string(),
                    to_strand_id.to_string(),
                    from_direction,
                    to_direction,
                    loss_db,
                ],
            )
            .map_err(|e| e.to_string())?;
        }
        AppEvent::FiberSpliceDeleted { id } => {
            tx.execute(
                "DELETE FROM fiber_splices WHERE id = ?1",
                params![id.to_string()],
            )
            .map_err(|e| e.to_string())?;
        }
        AppEvent::FiberCircuitUpserted {
            id,
            project_id,
            name,
            service_type,
            status,
            a_feature_id,
            z_feature_id,
        } => {
            tx.execute(
                "INSERT INTO fiber_circuits (id, project_id, name, service_type, status, a_feature_id, z_feature_id, updated_at)
                 VALUES (?1, ?2, ?3, COALESCE(?4, 'data'), COALESCE(?5, 'planned'), ?6, ?7, CURRENT_TIMESTAMP)
                 ON CONFLICT(id) DO UPDATE SET
                    project_id = excluded.project_id,
                    name = excluded.name,
                    service_type = excluded.service_type,
                    status = excluded.status,
                    a_feature_id = excluded.a_feature_id,
                    z_feature_id = excluded.z_feature_id,
                    updated_at = CURRENT_TIMESTAMP",
                params![
                    id.to_string(),
                    project_id.to_string(),
                    name,
                    service_type.as_deref(),
                    status.as_deref(),
                    a_feature_id.to_string(),
                    z_feature_id.to_string(),
                ],
            )
            .map_err(|e| e.to_string())?;
        }
        AppEvent::FiberCircuitDeleted { id } => {
            tx.execute(
                "DELETE FROM fiber_circuit_hops WHERE circuit_id = ?1",
                params![id.to_string()],
            )
            .map_err(|e| e.to_string())?;
            tx.execute(
                "DELETE FROM fiber_circuits WHERE id = ?1",
                params![id.to_string()],
            )
            .map_err(|e| e.to_string())?;
        }
        AppEvent::FiberCircuitHopsReplaced { circuit_id, hops } => {
            tx.execute(
                "DELETE FROM fiber_circuit_hops WHERE circuit_id = ?1",
                params![circuit_id.to_string()],
            )
            .map_err(|e| e.to_string())?;
            for hop in hops {
                let sequence_no = hop
                    .get("sequence_no")
                    .and_then(Value::as_i64)
                    .unwrap_or(0);
                let strand_id = hop
                    .get("strand_id")
                    .and_then(Value::as_str)
                    .map(|value| value.to_string());
                let port_id = hop
                    .get("port_id")
                    .and_then(Value::as_str)
                    .map(|value| value.to_string());
                tx.execute(
                    "INSERT INTO fiber_circuit_hops (circuit_id, sequence_no, strand_id, port_id, updated_at)
                     VALUES (?1, ?2, ?3, ?4, CURRENT_TIMESTAMP)
                     ON CONFLICT(circuit_id, sequence_no) DO UPDATE SET
                        strand_id = excluded.strand_id,
                        port_id = excluded.port_id,
                        updated_at = CURRENT_TIMESTAMP",
                    params![
                        circuit_id.to_string(),
                        sequence_no,
                        strand_id,
                        port_id,
                    ],
                )
                .map_err(|e| e.to_string())?;
            }
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
        let id = record.get("id").and_then(Value::as_str).unwrap_or_default();
        let geom_type = record.get("geom_type").and_then(Value::as_str).unwrap_or("Point");
        let metadata = parse_json_field(record.get("metadata").unwrap_or(&Value::Null), json!({}));
        project_fiber_cable_if_eligible(tx, project_id, id, geom_type, &metadata)?;
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
        "UPDATE projects
         SET metadata_json = json_patch(COALESCE(metadata_json, '{}'), json(?1)),
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?2",
        params![
            json!({
                "schema_version": "4.0.0",
                "storage": {"snapshot": "project_snapshots"}
            })
            .to_string(),
            project_id
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn normalize_metadata_to_string_opt(v: Option<String>) -> String {
    match v {
        None => "{}".to_string(),
        Some(s) => {
            let trimmed = s.trim();
            if trimmed.is_empty() || trimmed == "null" || trimmed == "undefined" {
                "{}".to_string()
            } else {
                trimmed.to_string()
            }
        }
    }
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
            let metadata_json: Option<String> = row.get(6)?;
            let metadata = normalize_metadata_to_string_opt(metadata_json);
            Ok(json!({
                "id": row.get::<_, String>(0)?,
                "layer_id": row.get::<_, String>(1)?,
                "parent_id": row.get::<_, Option<String>>(2)?,
                "name": row.get::<_, String>(3)?,
                "type": row.get::<_, Option<String>>(4)?,
                "is_visible": row.get::<_, i64>(5)? != 0,
                "metadata": metadata,
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
            let metadata_json: Option<String> = row.get(7)?;
            let bbox_json: Option<String> = row.get(8)?;
            let metadata = normalize_metadata_to_string_opt(metadata_json);
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
                "metadata": metadata,
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

fn project_fiber_cable_if_eligible(
    tx: &Transaction<'_>,
    project_id: &str,
    feature_id: &str,
    geom_type: &str,
    metadata: &Value,
) -> Result<(), String> {
    let geom_type_lower = geom_type.to_lowercase();
    let infrastructure = metadata
        .get("infrastructure")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    let legacy_type = infrastructure
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_lowercase();
    let cable_type = infrastructure
        .get("cable_type")
        .and_then(Value::as_str)
        .or_else(|| infrastructure.get("type").and_then(Value::as_str))
        .map(|value| value.to_string());
    let fiber_count = infrastructure.get("core_count").and_then(Value::as_i64);
    let owner = infrastructure
        .get("owner")
        .and_then(Value::as_str)
        .map(|value| value.to_string());
    let status = infrastructure
        .get("status")
        .and_then(Value::as_str)
        .map(|value| match value.to_lowercase().as_str() {
            "planned" | "active" | "retired" | "damaged" => value.to_lowercase(),
            _ => "planned".to_string(),
        })
        .unwrap_or_else(|| "planned".to_string());

    let network = metadata.get("network").and_then(Value::as_object);
    let has_network_route = network.map(|net| {
        let from_feature = net.get("from_feature_id").and_then(Value::as_str).is_some();
        let to_feature = net.get("to_feature_id").and_then(Value::as_str).is_some();
        let from_endpoint = net.get("from_endpoint").and_then(Value::as_object).is_some();
        let to_endpoint = net.get("to_endpoint").and_then(Value::as_object).is_some();
        (from_feature && to_feature) || (from_endpoint && to_endpoint)
    }).unwrap_or(false);
    let has_snap_route = metadata.get("start_node_id").and_then(Value::as_str).is_some()
        && metadata.get("end_node_id").and_then(Value::as_str).is_some();
    let should_project_fiber_cable =
        geom_type_lower == "networklink"
            || legacy_type == "signalline"
            || legacy_type == "networklink"
            || (geom_type_lower.contains("line") && (has_network_route || has_snap_route));

    if !should_project_fiber_cable {
        return Ok(());
    }

    tx.execute(
        "INSERT INTO fiber_cables (id, project_id, feature_id, cable_type, fiber_count, owner, status, source, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'legacy', CURRENT_TIMESTAMP)
         ON CONFLICT(id) DO UPDATE SET
            project_id = excluded.project_id,
            feature_id = excluded.feature_id,
            cable_type = excluded.cable_type,
            fiber_count = excluded.fiber_count,
            owner = excluded.owner,
            status = excluded.status,
            source = excluded.source,
            updated_at = CURRENT_TIMESTAMP",
        params![
            feature_id,
            project_id,
            feature_id,
            cable_type,
            fiber_count,
            owner,
            status,
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

    fn seed_basic_project(conn: &Connection, project_id: &str, name: &str) {
        conn.execute(
            "INSERT INTO projects (id, name, title) VALUES (?1, ?2, ?3)",
            params![project_id, name, name],
        )
        .expect("seed project");
    }

    fn seed_source_design_with_media(db: &mut PmpDatabase, project_id: &str) -> String {
        seed_basic_project(&db.conn, project_id, "Source Project");
        db.conn
            .execute(
                "INSERT INTO regions (id, project_id, parent_id, name, metadata_json) VALUES (?1, ?2, ?3, ?4, ?5)",
                params!["region-1", project_id, Option::<String>::None, "Region A", "{}"],
            )
            .expect("source region");
        db.conn
            .execute(
                "INSERT INTO layers (id, project_id, region_id, name, is_visible, metadata_json) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params!["layer-1", project_id, "region-1", "Layer A", 1, "{}"],
            )
            .expect("source layer");
        db.conn
            .execute(
                "INSERT INTO feature_groups (id, project_id, layer_id, parent_id, name, group_type, is_visible, metadata_json)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params!["group-1", project_id, "layer-1", Option::<String>::None, "Group A", "default", 1, "{}"],
            )
            .expect("source group");
        db.conn
            .execute(
                "INSERT INTO features (id, project_id, layer_id, group_id, name, geom_type, coordinates_json, properties_json, metadata_json)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![
                    "feature-parent",
                    project_id,
                    "layer-1",
                    "group-1",
                    "Node A",
                    "Point",
                    json!([105.0, 21.0]).to_string(),
                    "{}",
                    "{}"
                ],
            )
            .expect("source parent feature");
        db.conn
            .execute(
                "INSERT INTO features (id, project_id, layer_id, group_id, name, geom_type, coordinates_json, properties_json, metadata_json)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![
                    "feature-child",
                    project_id,
                    "layer-1",
                    "group-1",
                    "Node B",
                    "Point",
                    json!([105.1, 21.1]).to_string(),
                    json!({"label": "B"}).to_string(),
                    json!({
                        "parent_feature_id": "feature-parent",
                        "start_node_id": "feature-parent",
                        "snap_links": { "v0": "feature-parent" },
                        "network": {
                            "from_feature_id": "feature-parent",
                            "to_feature_id": "feature-parent",
                            "from_endpoint": { "type": "feature", "id": "feature-parent" }
                        }
                    }).to_string()
                ],
            )
            .expect("source child feature");

        let tx = db.conn.transaction().expect("media tx");
        let asset = persist_media_asset(
            &tx,
            &db.base_dir,
            &db.pmp_path,
            project_id,
            Some("feature-child"),
            b"import-image",
            "image/png",
        )
        .expect("source media");
        tx.commit().expect("media commit");
        asset
            .get("path")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string()
    }

    #[test]
    fn test_fiber_events_and_cascade() {
        let temp_dir = tempdir().unwrap();
        let db_path = temp_dir.path().join("test.db");
        let mut db = PmpDatabase::open_or_create(db_path).unwrap();
        let project_uuid = Uuid::new_v4();
        let cable_feat_id = Uuid::new_v4();
        let layer_id = Uuid::new_v4();
        let project_id = &project_uuid.to_string();
        seed_basic_project(&db.conn, project_id, "Test Project");

        let tx = db.conn.transaction().unwrap();

        // 1. Tạo feature
        let mut feature_metadata = serde_json::Map::new();
        feature_metadata.insert("infrastructure".to_string(), json!({
            "type": "signalline",
            "cable_type": "ADSS 200",
            "core_count": 12,
            "owner": "Viettel",
            "status": "planned"
        }));
        let feature_created = AppEvent::FeatureCreated {
            id: cable_feat_id,
            layer_id,
            group_id: None,
            task_id: None,
            name: "Cable Feature".to_string(),
            geom_type: "LineString".to_string(),
            metadata: Value::Object(feature_metadata.clone()),
            geometry: json!([]),
            properties: json!({}),
            style_id: None,
            is_visible: true,
            note: None,
            bbox: None,
        };
        let env_feature = EventEnvelope::new(project_uuid, "feature", cable_feat_id, feature_created, "test-device", None);
        apply_event_to_read_models(&tx, &env_feature).unwrap();

        // Kiểm tra cable_id được tạo ra
        let cable_id: String = tx.query_row(
            "SELECT id FROM fiber_cables WHERE feature_id = ?1",
            params![cable_feat_id.to_string()],
            |row| row.get(0),
        ).unwrap();
        let cable_uuid = Uuid::parse_str(&cable_id).unwrap();

        // 2. Khởi tạo Strands (không cấp sẵn ID)
        let strands_init = AppEvent::FiberStrandsInitialized {
            cable_id: cable_uuid,
            fiber_count: 12,
            strands: vec![],
        };
        let env_strands = EventEnvelope::new(project_uuid, "fiber", cable_uuid, strands_init, "test-device", None);
        apply_event_to_read_models(&tx, &env_strands).unwrap();

        // Kiểm tra có 12 strands
        let strand_count: i64 = tx.query_row(
            "SELECT COUNT(*) FROM fiber_strands WHERE cable_id = ?1",
            params![cable_id],
            |row| row.get(0),
        ).unwrap();
        assert_eq!(strand_count, 12);

        // Lấy 2 strand IDs
        let strand_ids: Vec<String> = tx.prepare("SELECT id FROM fiber_strands WHERE cable_id = ?1 LIMIT 2")
            .unwrap()
            .query_map(params![cable_id], |row| row.get(0))
            .unwrap()
            .map(|r| r.unwrap())
            .collect();
        let s1 = &strand_ids[0];
        let s2 = &strand_ids[1];

        // Đảm bảo UUID không phải dạng cable:strand:n
        assert!(!s1.contains(":strand:"));

        // 3. Khởi tạo lại Strands (cấp sẵn ID)
        let strands_init_with_id = AppEvent::FiberStrandsInitialized {
            cable_id: cable_uuid,
            fiber_count: 12,
            strands: vec![
                json!({"id": s1, "strand_no": 1, "status": "active"}),
                json!({"id": s2, "strand_no": 2, "status": "reserved"}),
            ],
        };
        let env_strands2 = EventEnvelope::new(project_uuid, "fiber", cable_uuid, strands_init_with_id, "test-device", None);
        apply_event_to_read_models(&tx, &env_strands2).unwrap();

        // Đảm bảo s1, s2 vẫn tồn tại và count = 2
        let strand_count_2: i64 = tx.query_row(
            "SELECT COUNT(*) FROM fiber_strands WHERE cable_id = ?1",
            params![cable_id],
            |row| row.get(0),
        ).unwrap();
        assert_eq!(strand_count_2, 2);

        // 4. Tạo một feature khác làm tủ nối (enclosure)
        let enclosure_feat_id = Uuid::new_v4();
        let enclosure_created = AppEvent::FeatureCreated {
            id: enclosure_feat_id,
            layer_id,
            group_id: None,
            task_id: None,
            name: "Enclosure Feature".to_string(),
            geom_type: "Point".to_string(),
            metadata: json!({}),
            geometry: json!([]),
            properties: json!({}),
            style_id: None,
            is_visible: true,
            note: None,
            bbox: None,
        };
        let env_enc = EventEnvelope::new(project_uuid, "feature", enclosure_feat_id, enclosure_created, "test-device", None);
        apply_event_to_read_models(&tx, &env_enc).unwrap();

        // 5. Gắn Port vào enclosure
        let port_id = Uuid::new_v4();
        let port_upsert = AppEvent::FiberPortUpserted {
            id: port_id,
            feature_id: enclosure_feat_id,
            port_label: "Port A".to_string(),
            port_kind: "PON".to_string(),
            direction: Some("bidirectional".to_string()),
            status: Some("available".to_string()),
        };
        let env_port = EventEnvelope::new(project_uuid, "fiber", port_id, port_upsert, "test-device", None);
        apply_event_to_read_models(&tx, &env_port).unwrap();

        let port_b_id = Uuid::new_v4();
        let port_b_upsert = AppEvent::FiberPortUpserted {
            id: port_b_id,
            feature_id: enclosure_feat_id,
            port_label: "Port B".to_string(),
            port_kind: "ODF".to_string(),
            direction: Some("bidirectional".to_string()),
            status: Some("available".to_string()),
        };
        let env_port_b = EventEnvelope::new(project_uuid, "fiber", port_b_id, port_b_upsert, "test-device", None);
        apply_event_to_read_models(&tx, &env_port_b).unwrap();

        let termination_id = Uuid::new_v4();
        let termination_upsert = AppEvent::FiberPortTerminationUpserted {
            id: termination_id,
            port_id,
            strand_id: Uuid::parse_str(s1).unwrap(),
            strand_direction: "start".to_string(),
            side: "left".to_string(),
            status: Some("active".to_string()),
        };
        let env_termination = EventEnvelope::new(project_uuid, "fiber", termination_id, termination_upsert, "test-device", None);
        apply_event_to_read_models(&tx, &env_termination).unwrap();

        let patch_id = Uuid::new_v4();
        let patch_upsert = AppEvent::FiberPortPatchUpserted {
            id: patch_id,
            from_port_id: port_id,
            to_port_id: port_b_id,
            status: Some("active".to_string()),
            loss_db: Some(0.05),
        };
        let env_patch = EventEnvelope::new(project_uuid, "fiber", patch_id, patch_upsert, "test-device", None);
        apply_event_to_read_models(&tx, &env_patch).unwrap();

        let termination_count: i64 = tx.query_row(
            "SELECT COUNT(*) FROM fiber_port_terminations WHERE id = ?1",
            params![termination_id.to_string()],
            |row| row.get(0),
        ).unwrap();
        assert_eq!(termination_count, 1);
        let patch_count: i64 = tx.query_row(
            "SELECT COUNT(*) FROM fiber_port_patches WHERE id = ?1",
            params![patch_id.to_string()],
            |row| row.get(0),
        ).unwrap();
        assert_eq!(patch_count, 1);

        // 6. Tạo Splice giữa s1 và s2 tại enclosure
        let splice_id = Uuid::new_v4();
        let splice_upsert = AppEvent::FiberSpliceUpserted {
            id: splice_id,
            enclosure_feature_id: enclosure_feat_id,
            from_strand_id: Uuid::parse_str(s1).unwrap(),
            to_strand_id: Uuid::parse_str(s2).unwrap(),
            from_direction: "start".to_string(),
            to_direction: "end".to_string(),
            loss_db: Some(0.1),
        };
        let env_splice = EventEnvelope::new(project_uuid, "fiber", splice_id, splice_upsert, "test-device", None);
        apply_event_to_read_models(&tx, &env_splice).unwrap();

        // 7. Tạo Circuit
        let circuit_id = Uuid::new_v4();
        let circuit_upsert = AppEvent::FiberCircuitUpserted {
            id: circuit_id,
            project_id: project_uuid,
            name: "Circuit Test".to_string(),
            service_type: Some("data".to_string()),
            status: Some("active".to_string()),
            a_feature_id: cable_feat_id,
            z_feature_id: enclosure_feat_id,
        };
        let env_circ = EventEnvelope::new(project_uuid, "fiber", circuit_id, circuit_upsert, "test-device", None);
        apply_event_to_read_models(&tx, &env_circ).unwrap();

        // 8. Hops Replace
        let hops_replace = AppEvent::FiberCircuitHopsReplaced {
            circuit_id: circuit_id,
            hops: vec![
                json!({"sequence_no": 1, "strand_id": s1, "port_id": Value::Null}),
                json!({"sequence_no": 2, "strand_id": Value::Null, "port_id": port_id.to_string()}),
            ],
        };
        let env_hops = EventEnvelope::new(project_uuid, "fiber", circuit_id, hops_replace, "test-device", None);
        apply_event_to_read_models(&tx, &env_hops).unwrap();

        // Verify hops
        let hop_count: i64 = tx.query_row(
            "SELECT COUNT(*) FROM fiber_circuit_hops WHERE circuit_id = ?1",
            params![circuit_id.to_string()],
            |row| row.get(0),
        ).unwrap();
        assert_eq!(hop_count, 2);

        // 9. Cascade Delete Feature -> Kiểm tra Port, Splice biến mất không?
        let enclosure_deleted = AppEvent::FeatureDeleted {
            id: enclosure_feat_id,
        };
        let env_del_enc = EventEnvelope::new(project_uuid, "feature", enclosure_feat_id, enclosure_deleted, "test-device", None);
        apply_event_to_read_models(&tx, &env_del_enc).unwrap();

        let port_count: i64 = tx.query_row(
            "SELECT COUNT(*) FROM fiber_ports WHERE feature_id = ?1",
            params![enclosure_feat_id.to_string()],
            |row| row.get(0),
        ).unwrap();
        assert_eq!(port_count, 0, "Port failed to cascade delete");

        let splice_count: i64 = tx.query_row(
            "SELECT COUNT(*) FROM fiber_splices WHERE enclosure_feature_id = ?1",
            params![enclosure_feat_id.to_string()],
            |row| row.get(0),
        ).unwrap();
        assert_eq!(splice_count, 0, "Splice failed to cascade delete from enclosure");

        // Vì z_feature_id (enclosure) bị xoá, circuit cũng bị xoá cascade
        let remaining_circuit: i64 = tx.query_row(
            "SELECT COUNT(*) FROM fiber_circuits WHERE id = ?1",
            params![circuit_id.to_string()],
            |row| row.get(0),
        ).unwrap();
        assert_eq!(remaining_circuit, 0, "Circuit failed to cascade delete when z_feature deleted");

        // Hops cũng sẽ bị xoá cascade theo circuit
        let hop_count_after: i64 = tx.query_row(
            "SELECT COUNT(*) FROM fiber_circuit_hops WHERE circuit_id = ?1",
            params![circuit_id.to_string()],
            |row| row.get(0),
        ).unwrap();
        assert_eq!(hop_count_after, 0, "Hops should be deleted when circuit is deleted");

        // 10. Cascade Delete Cable Feature -> Kiểm tra Cable, Strands
        let cable_deleted = AppEvent::FeatureDeleted {
            id: cable_feat_id,
        };
        let env_del_cab = EventEnvelope::new(project_uuid, "feature", cable_feat_id, cable_deleted, "test-device", None);
        apply_event_to_read_models(&tx, &env_del_cab).unwrap();

        let cable_count: i64 = tx.query_row(
            "SELECT COUNT(*) FROM fiber_cables WHERE feature_id = ?1",
            params![cable_feat_id.to_string()],
            |row| row.get(0),
        ).unwrap();
        assert_eq!(cable_count, 0, "Cable failed to cascade delete");

        let remaining_strands: i64 = tx.query_row(
            "SELECT COUNT(*) FROM fiber_strands WHERE cable_id = ?1",
            params![cable_id],
            |row| row.get(0),
        ).unwrap();
        assert_eq!(remaining_strands, 0, "Strands failed to cascade delete");
        
        tx.commit().unwrap();
    }


    fn make_worker(db: PmpDatabase) -> StorageWorker {
        let (_tx, rx) = mpsc::channel(1);
        StorageWorker { rx, db }
    }

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
                "SELECT state_json FROM project_snapshots WHERE project_id = ?1",
                params![project_id],
                |r| r.get(0),
            )
            .expect("select state_json");
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

    #[test]
    fn analyze_pmp_import_reports_counts() {
        let dir = tempdir().expect("tempdir");
        let source_path = dir.path().join("source_preview.pmp");
        let mut source_db = PmpDatabase::open_or_create(source_path.clone()).expect("source db");
        seed_source_design_with_media(&mut source_db, "source-project");

        let target_path = dir.path().join("target_preview.pmp");
        let target_db = PmpDatabase::open_or_create(target_path).expect("target db");
        let worker = make_worker(target_db);

        let preview = worker
            .analyze_pmp_import(&source_path)
            .expect("analyze import");

        assert_eq!(
            preview.get("sourceProjectName").and_then(Value::as_str),
            Some("Source Project")
        );
        assert_eq!(preview.get("regions").and_then(Value::as_i64), Some(1));
        assert_eq!(preview.get("layers").and_then(Value::as_i64), Some(1));
        assert_eq!(preview.get("groups").and_then(Value::as_i64), Some(1));
        assert_eq!(preview.get("features").and_then(Value::as_i64), Some(2));
        assert_eq!(preview.get("mediaAssets").and_then(Value::as_i64), Some(1));
    }

    #[test]
    fn import_pmp_into_project_merges_design_and_media_with_remapped_ids() {
        let dir = tempdir().expect("tempdir");
        let source_path = dir.path().join("source_import.pmp");
        let mut source_db = PmpDatabase::open_or_create(source_path.clone()).expect("source db");
        seed_source_design_with_media(&mut source_db, "source-project");

        let target_path = dir.path().join("target_import.pmp");
        let target_db = PmpDatabase::open_or_create(target_path).expect("target db");
        seed_basic_project(&target_db.conn, "target-project", "Target Project");
        target_db
            .conn
            .execute(
                "INSERT INTO layers (id, project_id, name, metadata_json) VALUES (?1, ?2, ?3, ?4)",
                params!["layer-1", "target-project", "Existing Layer", "{}"],
            )
            .expect("existing target layer");
        target_db
            .conn
            .execute(
                "INSERT INTO features (id, project_id, layer_id, name, geom_type, properties_json, metadata_json)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params!["feature-parent", "target-project", "layer-1", "Existing Feature", "Point", "{}", "{}"],
            )
            .expect("existing target feature");

        let mut worker = make_worker(target_db);
        let result = worker
            .import_pmp_into_project(&source_path, "target-project")
            .expect("import pmp");

        assert_eq!(
            result.get("importedRegions").and_then(Value::as_i64),
            Some(1)
        );
        assert_eq!(
            result.get("importedLayers").and_then(Value::as_i64),
            Some(1)
        );
        assert_eq!(
            result.get("importedGroups").and_then(Value::as_i64),
            Some(1)
        );
        assert_eq!(
            result.get("importedFeatures").and_then(Value::as_i64),
            Some(2)
        );
        assert_eq!(
            result.get("importedMediaAssets").and_then(Value::as_i64),
            Some(1)
        );
        assert_eq!(
            result.get("skippedMediaAssets").and_then(Value::as_i64),
            Some(0)
        );

        let feature_count: i64 = worker
            .db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM features WHERE project_id = ?1",
                params!["target-project"],
                |row| row.get(0),
            )
            .expect("feature count");
        assert_eq!(feature_count, 3);

        let imported_child: (String, String) = worker
            .db
            .conn
            .query_row(
                "SELECT id, metadata_json FROM features WHERE project_id = ?1 AND name = 'Node B' LIMIT 1",
                params!["target-project"],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("imported child");
        assert_ne!(imported_child.0, "feature-child");
        let imported_child_meta: Value =
            serde_json::from_str(&imported_child.1).expect("imported child metadata");
        let imported_parent_id = imported_child_meta
            .get("parent_feature_id")
            .and_then(Value::as_str)
            .expect("parent remap");
        assert_ne!(imported_parent_id, "feature-parent");

        let imported_parent_name: String = worker
            .db
            .conn
            .query_row(
                "SELECT name FROM features WHERE id = ?1",
                params![imported_parent_id],
                |row| row.get(0),
            )
            .expect("imported parent lookup");
        assert_eq!(imported_parent_name, "Node A");

        let media_count: i64 = worker
            .db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM media_assets WHERE project_id = ?1",
                params!["target-project"],
                |row| row.get(0),
            )
            .expect("media count");
        assert_eq!(media_count, 1);

        let target_metadata_text: String = worker
            .db
            .conn
            .query_row(
                "SELECT metadata_json FROM features WHERE id = ?1",
                params![imported_child.0],
                |row| row.get(0),
            )
            .expect("target metadata");
        let target_metadata: Value =
            serde_json::from_str(&target_metadata_text).expect("target metadata json");
        let image_asset_id = target_metadata
            .get("media")
            .and_then(|media| media.get("imageAssetIds"))
            .and_then(Value::as_array)
            .and_then(|items| items.first())
            .and_then(Value::as_str)
            .expect("linked asset");
        assert!(!image_asset_id.is_empty());
    }

    #[test]
    fn import_pmp_into_project_rejects_same_active_database_path() {
        let dir = tempdir().expect("tempdir");
        let target_path = dir.path().join("same_path.pmp");
        let target_db = PmpDatabase::open_or_create(target_path.clone()).expect("target db");
        seed_basic_project(&target_db.conn, "target-project", "Target Project");

        let mut worker = make_worker(target_db);
        let error = worker
            .import_pmp_into_project(&target_path, "target-project")
            .expect_err("should reject self import");
        assert!(error.contains("currently opened .pmp"));
    }

    #[test]
    fn import_pmp_into_project_skips_missing_media_files() {
        let dir = tempdir().expect("tempdir");
        let source_path = dir.path().join("source_missing_media.pmp");
        let mut source_db = PmpDatabase::open_or_create(source_path.clone()).expect("source db");
        let media_path = seed_source_design_with_media(&mut source_db, "source-project");
        fs::remove_file(&media_path).expect("remove media file");

        let target_path = dir.path().join("target_missing_media.pmp");
        let target_db = PmpDatabase::open_or_create(target_path).expect("target db");
        seed_basic_project(&target_db.conn, "target-project", "Target Project");

        let mut worker = make_worker(target_db);
        let result = worker
            .import_pmp_into_project(&source_path, "target-project")
            .expect("import pmp");

        assert_eq!(
            result.get("importedFeatures").and_then(Value::as_i64),
            Some(2)
        );
        assert_eq!(
            result.get("importedMediaAssets").and_then(Value::as_i64),
            Some(0)
        );
        assert_eq!(
            result.get("skippedMediaAssets").and_then(Value::as_i64),
            Some(1)
        );
    }

    #[test]
    fn media_asset_path_follows_design_tree_hierarchy() {
        let dir = tempdir().expect("tempdir");
        let pmp_path = dir.path().join("tree_media.pmp");
        let mut db = PmpDatabase::open_or_create(pmp_path.clone()).expect("open db");
        let project_id = "project-tree";
        db.conn
            .execute(
                "INSERT INTO projects (id, name, title) VALUES (?1, ?2, ?3)",
                params![project_id, "Tree Project", "Tree Project"],
            )
            .expect("project");
        db.conn
            .execute(
                "INSERT INTO regions (id, project_id, name, metadata_json) VALUES (?1, ?2, ?3, ?4)",
                params!["region-1", project_id, "Khu A", "{}"],
            )
            .expect("region");
        db.conn
            .execute(
                "INSERT INTO layers (id, project_id, region_id, name, metadata_json) VALUES (?1, ?2, ?3, ?4, ?5)",
                params!["layer-1", project_id, "region-1", "Tuyen camera", "{}"],
            )
            .expect("layer");
        db.conn
            .execute(
                "INSERT INTO feature_groups (id, project_id, layer_id, name, metadata_json) VALUES (?1, ?2, ?3, ?4, ?5)",
                params!["group-1", project_id, "layer-1", "Nut giao", "{}"],
            )
            .expect("group");
        db.conn
            .execute(
                "INSERT INTO features (id, project_id, layer_id, group_id, name, geom_type, properties_json, metadata_json) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    "parent-feature",
                    project_id,
                    "layer-1",
                    "group-1",
                    "Nga tu A",
                    "Point",
                    "{}",
                    "{}"
                ],
            )
            .expect("parent feature");
        db.conn
            .execute(
                "INSERT INTO features (id, project_id, layer_id, group_id, name, geom_type, properties_json, metadata_json) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    "child-feature",
                    project_id,
                    "layer-1",
                    "group-1",
                    "Camera 01",
                    "Point",
                    "{}",
                    json!({"parent_feature_id": "parent-feature"}).to_string()
                ],
            )
            .expect("child feature");

        let tx = db.conn.transaction().expect("tx");
        let asset = persist_media_asset(
            &tx,
            dir.path(),
            &pmp_path,
            project_id,
            Some("child-feature"),
            b"image-bytes",
            "image/jpeg",
        )
        .expect("persist asset");
        tx.commit().expect("commit");

        let rel_path = asset.get("relPath").and_then(Value::as_str).unwrap_or("");
        let data_url = asset.get("dataUrl").and_then(Value::as_str).unwrap_or("");
        assert!(rel_path.contains("Khu A [region-1]"));
        assert!(rel_path.contains("Tuyen camera [layer-1]"));
        assert!(rel_path.contains("Nut giao [group-1]"));
        assert!(rel_path.contains("Nga tu A [parent-f]"));
        assert!(rel_path.contains("Camera 01 [child-fe]"));
        assert!(data_url.starts_with("data:image/jpeg;base64,"));

        let metadata_text: String = db
            .conn
            .query_row(
                "SELECT metadata_json FROM features WHERE id = ?1",
                params!["child-feature"],
                |row| row.get(0),
            )
            .expect("metadata");
        let metadata: Value = serde_json::from_str(&metadata_text).expect("metadata json");
        let asset_id = asset.get("assetId").and_then(Value::as_str).unwrap_or("");
        assert_eq!(
            metadata
                .get("media")
                .and_then(|media| media.get("imageAssetIds"))
                .and_then(Value::as_array)
                .and_then(|ids| ids.first())
                .and_then(Value::as_str),
            Some(asset_id)
        );

        let (_tx, rx) = mpsc::channel(1);
        let worker = StorageWorker { rx, db };
        let resolved = worker
            .resolve_media_asset(project_id, asset_id)
            .expect("resolve asset");
        assert_eq!(
            resolved.get("assetId").and_then(Value::as_str),
            Some(asset_id)
        );
        assert!(resolved
            .get("dataUrl")
            .and_then(Value::as_str)
            .unwrap_or("")
            .starts_with("data:image/jpeg;base64,"));
    }

    #[test]
    fn opening_old_project_migrates_base64_media_to_assets() {
        let dir = tempdir().expect("tempdir");
        let pmp_path = dir.path().join("legacy_media.pmp");
        let db = PmpDatabase::open_or_create(pmp_path.clone()).expect("open db");
        let project_id = "legacy-project";
        let data_url = format!(
            "data:image/png;base64,{}",
            general_purpose::STANDARD.encode(b"legacy-image")
        );

        db.conn
            .execute(
                "INSERT INTO projects (id, name, title, metadata_json) VALUES (?1, ?2, ?3, ?4)",
                params![project_id, "Legacy", "Legacy", "{}"],
            )
            .expect("project");
        db.conn
            .execute(
                "INSERT INTO layers (id, project_id, name, metadata_json) VALUES (?1, ?2, ?3, ?4)",
                params!["layer-1", project_id, "Layer", "{}"],
            )
            .expect("layer");
        db.conn
            .execute(
                "INSERT INTO features (id, project_id, layer_id, name, geom_type, properties_json, metadata_json) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    "feature-1",
                    project_id,
                    "layer-1",
                    "Camera",
                    "Point",
                    "{}",
                    json!({"media": {"imageUrl": data_url.clone()}}).to_string()
                ],
            )
            .expect("feature");
        db.conn
            .execute(
                "INSERT INTO project_snapshots (project_id, state_json) VALUES (?1, ?2)",
                params![
                    project_id,
                    json!({
                        "layers": {"layer-1": {"id": "layer-1", "name": "Layer"}},
                        "features": {
                            "feature-1": {
                                "id": "feature-1",
                                "layer_id": "layer-1",
                                "name": "Camera",
                                "geom_type": "Point",
                                "metadata": json!({"media": {"imageUrl": data_url}}).to_string(),
                                "properties": {},
                                "coordinates": null
                            }
                        }
                    })
                    .to_string()
                ],
            )
            .expect("snapshot");

        let (_tx, rx) = mpsc::channel(1);
        let mut worker = StorageWorker { rx, db };
        worker
            .auto_migrate_legacy_media_on_open()
            .expect("auto migrate");

        assert!(PathBuf::from(format!("{}.bak", pmp_path.to_string_lossy())).exists());

        let metadata_text: String = worker
            .db
            .conn
            .query_row(
                "SELECT metadata_json FROM features WHERE id = ?1",
                params!["feature-1"],
                |row| row.get(0),
            )
            .expect("metadata");
        assert!(!metadata_text.contains("data:image"));
        let metadata: Value = serde_json::from_str(&metadata_text).expect("metadata json");
        let asset_id = metadata
            .get("media")
            .and_then(|media| media.get("imageAssetIds"))
            .and_then(Value::as_array)
            .and_then(|ids| ids.first())
            .and_then(Value::as_str)
            .expect("asset id");

        let rel_path: String = worker
            .db
            .conn
            .query_row(
                "SELECT rel_path FROM media_assets WHERE id = ?1",
                params![asset_id],
                |row| row.get(0),
            )
            .expect("asset rel path");
        assert!(worker.db.base_dir.join(rel_path).exists());

        let snapshot_text: String = worker
            .db
            .conn
            .query_row(
                "SELECT state_json FROM project_snapshots WHERE project_id = ?1",
                params![project_id],
                |row| row.get(0),
            )
            .expect("snapshot");
        assert!(!snapshot_text.contains("data:image"));
        assert!(snapshot_text.contains(asset_id));
    }

    #[test]
    fn optimize_project_storage_backs_up_migrates_and_compacts() {
        let dir = tempdir().expect("tempdir");
        let pmp_path = dir.path().join("optimize_media.pmp");
        let db = PmpDatabase::open_or_create(pmp_path.clone()).expect("open db");
        let project_id = "optimize-project";
        let data_url = format!(
            "data:image/png;base64,{}",
            general_purpose::STANDARD.encode(vec![7u8; 1024])
        );
        let large_payload = json!({
            "type": "FeatureUpdated",
            "payload": {
                "id": "feature-1",
                "metadata": data_url.repeat(260)
            }
        })
        .to_string();

        db.conn
            .execute(
                "INSERT INTO projects (id, name, title, metadata_json) VALUES (?1, ?2, ?3, ?4)",
                params![project_id, "Optimize", "Optimize", "{}"],
            )
            .expect("project");
        db.conn
            .execute(
                "INSERT INTO layers (id, project_id, name, metadata_json) VALUES (?1, ?2, ?3, ?4)",
                params!["layer-1", project_id, "Layer", "{}"],
            )
            .expect("layer");
        db.conn
            .execute(
                "INSERT INTO features (id, project_id, layer_id, name, geom_type, properties_json, metadata_json) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    "feature-1",
                    project_id,
                    "layer-1",
                    "Camera",
                    "Point",
                    "{}",
                    json!({"media": {"imageUrl": data_url.clone()}}).to_string()
                ],
            )
            .expect("feature");
        db.conn
            .execute(
                "INSERT INTO project_snapshots (project_id, state_json) VALUES (?1, ?2)",
                params![
                    project_id,
                    json!({
                        "layers": {"layer-1": {"id": "layer-1", "name": "Layer"}},
                        "features": {
                            "feature-1": {
                                "id": "feature-1",
                                "layer_id": "layer-1",
                                "name": "Camera",
                                "geom_type": "Point",
                                "metadata": json!({"media": {"imageUrl": data_url}}).to_string(),
                                "properties": {},
                                "coordinates": null
                            }
                        }
                    })
                    .to_string()
                ],
            )
            .expect("snapshot");
        db.conn
            .execute(
                "INSERT INTO events (id, project_id, entity_type, entity_id, event_type, payload_json, metadata_json)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    "event-large-1",
                    project_id,
                    "feature",
                    "feature-1",
                    "FeatureUpdated",
                    large_payload,
                    "{}"
                ],
            )
            .expect("large event");

        let (_tx, rx) = mpsc::channel(1);
        let mut worker = StorageWorker { rx, db };
        let before = project_storage_summary(&worker.db.conn, &worker.db.pmp_path, project_id)
            .expect("before summary");
        assert!(
            before
                .get("legacyMediaRefCount")
                .and_then(Value::as_i64)
                .unwrap_or(0)
                > 0
        );
        assert!(
            before
                .get("largeEventCount")
                .and_then(Value::as_i64)
                .unwrap_or(0)
                > 0
        );

        let result = worker
            .optimize_project_storage(project_id)
            .expect("optimize storage");
        let backup_path = result
            .get("backupPath")
            .and_then(Value::as_str)
            .expect("backup path");
        assert!(PathBuf::from(backup_path).exists());
        assert_eq!(
            result.get("integrityAfter").and_then(Value::as_str),
            Some("ok")
        );
        assert_eq!(
            result.get("migratedMediaRefs").and_then(Value::as_i64),
            Some(1)
        );
        assert_eq!(
            result.get("compactedEvents").and_then(Value::as_i64),
            Some(1)
        );

        let snapshot_text: String = worker
            .db
            .conn
            .query_row(
                "SELECT state_json FROM project_snapshots WHERE project_id = ?1",
                params![project_id],
                |row| row.get(0),
            )
            .expect("snapshot");
        assert!(!snapshot_text.contains("data:image"));
        let event_payload: String = worker
            .db
            .conn
            .query_row(
                "SELECT payload_json FROM events WHERE id = ?1",
                params!["event-large-1"],
                |row| row.get(0),
            )
            .expect("event payload");
        assert!(event_payload.contains("CompactedEvent"));

        let after = project_storage_summary(&worker.db.conn, &worker.db.pmp_path, project_id)
            .expect("after summary");
        assert_eq!(
            after
                .get("legacyMediaRefCount")
                .and_then(Value::as_i64)
                .unwrap_or(-1),
            0
        );
        assert_eq!(
            after
                .get("largeEventCount")
                .and_then(Value::as_i64)
                .unwrap_or(-1),
            0
        );
    }

    #[test]
    fn media_assets_relink_after_project_folder_move() {
        let dir = tempdir().expect("tempdir");
        let pmp_path = dir.path().join("portable_media.pmp");
        let mut db = PmpDatabase::open_or_create(pmp_path.clone()).expect("open db");
        let project_id = "portable-project";
        db.conn
            .execute(
                "INSERT INTO projects (id, name, title) VALUES (?1, ?2, ?3)",
                params![project_id, "Portable", "Portable"],
            )
            .expect("project");
        db.conn
            .execute(
                "INSERT INTO layers (id, project_id, name, metadata_json) VALUES (?1, ?2, ?3, ?4)",
                params!["layer-1", project_id, "Layer", "{}"],
            )
            .expect("layer");
        db.conn
            .execute(
                "INSERT INTO features (id, project_id, layer_id, name, geom_type, properties_json, metadata_json) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params!["feature-1", project_id, "layer-1", "Camera", "Point", "{}", "{}"],
            )
            .expect("feature");

        let tx = db.conn.transaction().expect("tx");
        let asset = persist_media_asset(
            &tx,
            dir.path(),
            &pmp_path,
            project_id,
            Some("feature-1"),
            b"portable-image",
            "image/png",
        )
        .expect("persist asset");
        tx.commit().expect("commit");
        let asset_id = asset.get("assetId").and_then(Value::as_str).unwrap_or("");
        let sha256 = asset.get("sha256").and_then(Value::as_str).unwrap_or("");

        db.conn
            .execute(
                "UPDATE media_assets SET rel_path = ?1 WHERE id = ?2",
                params![format!(r"C:\old-machine\missing\{sha256}.png"), asset_id],
            )
            .expect("break rel path");
        db.conn
            .execute(
                "UPDATE features SET metadata_json = '{}' WHERE id = ?1",
                params!["feature-1"],
            )
            .expect("break metadata link");

        let (_tx, rx) = mpsc::channel(1);
        let mut worker = StorageWorker { rx, db };
        worker
            .auto_migrate_legacy_media_on_open()
            .expect("repair links");

        let resolved = worker
            .resolve_media_asset(project_id, asset_id)
            .expect("resolve repaired asset");
        let repaired_rel_path = resolved
            .get("relPath")
            .and_then(Value::as_str)
            .unwrap_or("");
        assert!(!PathBuf::from(repaired_rel_path).is_absolute());
        assert!(resolved
            .get("dataUrl")
            .and_then(Value::as_str)
            .unwrap_or("")
            .starts_with("data:image/png;base64,"));

        let metadata_text: String = worker
            .db
            .conn
            .query_row(
                "SELECT metadata_json FROM features WHERE id = ?1",
                params!["feature-1"],
                |row| row.get(0),
            )
            .expect("metadata");
        let metadata: Value = serde_json::from_str(&metadata_text).expect("metadata json");
        assert_eq!(
            metadata
                .get("media")
                .and_then(|media| media.get("imageAssetIds"))
                .and_then(Value::as_array)
                .and_then(|ids| ids.first())
                .and_then(Value::as_str),
            Some(asset_id)
        );
    }
}
