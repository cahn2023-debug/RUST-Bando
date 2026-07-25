use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DatabaseAuditSeverity {
    Error,
    Warning,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseAuditIssue {
    pub severity: DatabaseAuditSeverity,
    pub rule: String,
    pub table: String,
    pub record_key: String,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SyncOutboxAuditSummary {
    pub pending: i64,
    pub acked: i64,
    pub failed: i64,
    pub conflicted: i64,
    pub max_retry_count: i64,
    pub missing_event_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseAuditReport {
    pub integrity_check: String,
    pub foreign_keys_enabled: bool,
    pub foreign_key_violation_count: usize,
    pub user_version: i32,
    pub schema_migration_version: Option<i32>,
    pub configured_schema_version: Option<String>,
    pub sync_outbox: SyncOutboxAuditSummary,
    pub issues: Vec<DatabaseAuditIssue>,
}

impl DatabaseAuditReport {
    pub fn has_blocking_errors(&self) -> bool {
        self.integrity_check != "ok"
            || !self.foreign_keys_enabled
            || self
                .issues
                .iter()
                .any(|issue| issue.severity == DatabaseAuditSeverity::Error)
    }
}

fn table_exists(conn: &Connection, table: &str) -> Result<bool, rusqlite::Error> {
    conn.query_row(
        "SELECT 1 FROM sqlite_schema WHERE type IN ('table', 'view') AND name = ?1 LIMIT 1",
        [table],
        |_| Ok(()),
    )
    .optional()
    .map(|row| row.is_some())
}

fn scalar_i64(conn: &Connection, sql: &str) -> Result<i64, rusqlite::Error> {
    conn.query_row(sql, [], |row| row.get(0))
}

fn collect_issues(
    conn: &Connection,
    issues: &mut Vec<DatabaseAuditIssue>,
    rule: &str,
    table: &str,
    detail: &str,
    sql: &str,
) -> Result<(), rusqlite::Error> {
    let mut stmt = conn.prepare(sql)?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
    for record_key in rows {
        issues.push(DatabaseAuditIssue {
            severity: DatabaseAuditSeverity::Error,
            rule: rule.to_string(),
            table: table.to_string(),
            record_key: record_key?,
            detail: detail.to_string(),
        });
    }
    Ok(())
}

fn collect_count_warning(
    conn: &Connection,
    issues: &mut Vec<DatabaseAuditIssue>,
    rule: &str,
    table: &str,
    detail: &str,
    sql: &str,
) -> Result<(), rusqlite::Error> {
    let count = scalar_i64(conn, sql)?;
    if count > 0 {
        issues.push(DatabaseAuditIssue {
            severity: DatabaseAuditSeverity::Warning,
            rule: rule.to_string(),
            table: table.to_string(),
            record_key: "*".to_string(),
            detail: format!("{detail}: {count}"),
        });
    }
    Ok(())
}

fn collect_record_warnings(
    conn: &Connection,
    issues: &mut Vec<DatabaseAuditIssue>,
    rule: &str,
    table: &str,
    detail: &str,
    sql: &str,
) -> Result<(), rusqlite::Error> {
    let mut stmt = conn.prepare(sql)?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
    for record_key in rows {
        issues.push(DatabaseAuditIssue {
            severity: DatabaseAuditSeverity::Warning,
            rule: rule.to_string(),
            table: table.to_string(),
            record_key: record_key?,
            detail: detail.to_string(),
        });
    }
    Ok(())
}

pub fn audit_database(conn: &Connection) -> Result<DatabaseAuditReport, rusqlite::Error> {
    let integrity_check: String = conn.query_row("PRAGMA integrity_check", [], |row| row.get(0))?;
    let foreign_keys_enabled =
        conn.pragma_query_value(None, "foreign_keys", |row| row.get::<_, i64>(0))? == 1;
    let user_version = conn.pragma_query_value(None, "user_version", |row| row.get(0))?;
    let mut issues = Vec::new();

    let mut foreign_key_violation_count = 0usize;
    {
        let mut stmt = conn.prepare("PRAGMA foreign_key_check")?;
        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, String>(2)?,
            ))
        })?;
        for row in rows {
            let (table, rowid, parent) = row?;
            foreign_key_violation_count += 1;
            issues.push(DatabaseAuditIssue {
                severity: DatabaseAuditSeverity::Error,
                rule: "foreign_key_violation".to_string(),
                table,
                record_key: rowid.to_string(),
                detail: format!("Referenced parent table is missing a matching row: {parent}"),
            });
        }
    }

    if integrity_check != "ok" {
        issues.push(DatabaseAuditIssue {
            severity: DatabaseAuditSeverity::Error,
            rule: "integrity_check".to_string(),
            table: "sqlite".to_string(),
            record_key: "*".to_string(),
            detail: integrity_check.clone(),
        });
    }
    if !foreign_keys_enabled {
        issues.push(DatabaseAuditIssue {
            severity: DatabaseAuditSeverity::Error,
            rule: "foreign_keys_disabled".to_string(),
            table: "sqlite".to_string(),
            record_key: "*".to_string(),
            detail: "PRAGMA foreign_keys must be enabled for every connection".to_string(),
        });
    }

    let nullable_relationship_checks = [
        ("regions", "parent_id", "regions", "parent region"),
        ("layers", "region_id", "regions", "region"),
        (
            "feature_groups",
            "parent_id",
            "feature_groups",
            "parent group",
        ),
        ("features", "group_id", "feature_groups", "feature group"),
    ];
    for (child_table, foreign_key, parent_table, relation_name) in nullable_relationship_checks {
        if !table_exists(conn, child_table)? || !table_exists(conn, parent_table)? {
            continue;
        }
        let cross_project_sql = format!(
            "SELECT child.id FROM {child_table} child
             JOIN {parent_table} parent ON parent.id = child.{foreign_key}
             WHERE parent.project_id <> child.project_id LIMIT 100"
        );
        collect_issues(
            conn,
            &mut issues,
            "cross_project_nullable_relation",
            child_table,
            &format!("{relation_name} belongs to another project"),
            &cross_project_sql,
        )?;

        let orphan_sql = format!(
            "SELECT child.id FROM {child_table} child
             LEFT JOIN {parent_table} parent ON parent.id = child.{foreign_key}
             WHERE child.{foreign_key} IS NOT NULL AND parent.id IS NULL LIMIT 100"
        );
        collect_issues(
            conn,
            &mut issues,
            "orphan_nullable_relation",
            child_table,
            &format!(
                "Missing {relation_name}; migration is blocked until the relation is repaired explicitly"
            ),
            &orphan_sql,
        )?;
    }

    let relationship_checks = [
        (
            "feature_groups",
            "orphan_or_cross_project_layer",
            "Layer is missing or belongs to another project",
            "SELECT child.id FROM feature_groups child LEFT JOIN layers parent ON parent.id = child.layer_id
             WHERE parent.id IS NULL OR parent.project_id <> child.project_id LIMIT 100",
        ),
        (
            "features",
            "orphan_or_cross_project_layer",
            "Layer is missing or belongs to another project",
            "SELECT child.id FROM features child LEFT JOIN layers parent ON parent.id = child.layer_id
             WHERE parent.id IS NULL OR parent.project_id <> child.project_id LIMIT 100",
        ),
        (
            "fiber_cables",
            "cross_project_feature",
            "Cable feature belongs to another project",
            "SELECT child.id FROM fiber_cables child JOIN features parent ON parent.id = child.feature_id
             WHERE parent.project_id <> child.project_id LIMIT 100",
        ),
        (
            "fiber_cable_points",
            "cross_project_relation",
            "Cable point, cable and feature must belong to one project",
            "SELECT child.id FROM fiber_cable_points child
             JOIN fiber_cables cable ON cable.id = child.cable_id
             JOIN features feature ON feature.id = child.feature_id
             WHERE cable.project_id <> child.project_id OR feature.project_id <> child.project_id LIMIT 100",
        ),
        (
            "equipment",
            "cross_project_feature",
            "Equipment feature belongs to another project",
            "SELECT child.id FROM equipment child JOIN features parent ON parent.id = child.feature_id
             WHERE parent.project_id <> child.project_id LIMIT 100",
        ),
        (
            "fiber_circuits",
            "cross_project_endpoint",
            "Circuit endpoints must belong to the circuit project",
            "SELECT child.id FROM fiber_circuits child
             JOIN features a ON a.id = child.a_feature_id JOIN features z ON z.id = child.z_feature_id
             WHERE a.project_id <> child.project_id OR z.project_id <> child.project_id LIMIT 100",
        ),
        (
            "ai_messages",
            "cross_project_conversation",
            "AI message and conversation belong to different projects",
            "SELECT child.id FROM ai_messages child JOIN ai_conversations parent ON parent.id = child.conversation_id
             WHERE parent.project_id <> child.project_id LIMIT 100",
        ),
        (
            "ai_actions",
            "cross_project_conversation",
            "AI action and conversation belong to different projects",
            "SELECT child.id FROM ai_actions child JOIN ai_conversations parent ON parent.id = child.conversation_id
             WHERE parent.project_id <> child.project_id LIMIT 100",
        ),
        (
            "sync_outbox",
            "orphan_or_cross_project_event",
            "Outbox event is missing or belongs to another project",
            "SELECT child.event_id FROM sync_outbox child LEFT JOIN events parent ON parent.id = child.event_id
             WHERE parent.id IS NULL OR parent.project_id <> child.project_id LIMIT 100",
        ),
        (
            "sync_cursor",
            "orphan_project",
            "Sync cursor project does not exist",
            "SELECT child.project_id FROM sync_cursor child LEFT JOIN projects parent ON parent.id = child.project_id
             WHERE parent.id IS NULL LIMIT 100",
        ),
        (
            "cached_leases",
            "orphan_project",
            "Cached lease project does not exist",
            "SELECT child.project_id || ':' || child.entity_id FROM cached_leases child
             LEFT JOIN projects parent ON parent.id = child.project_id WHERE parent.id IS NULL LIMIT 100",
        ),
        (
            "sync_conflicts",
            "orphan_project",
            "Sync conflict project does not exist",
            "SELECT child.conflict_id FROM sync_conflicts child LEFT JOIN projects parent ON parent.id = child.project_id
             WHERE parent.id IS NULL LIMIT 100",
        ),
    ];
    for (table, rule, detail, sql) in relationship_checks {
        if table_exists(conn, table)? {
            collect_issues(conn, &mut issues, rule, table, detail, sql)?;
        }
    }

    let json_checks = [
        ("projects", "metadata_json", "object"),
        ("files", "metadata_json", "object"),
        ("regions", "metadata_json", "object"),
        ("layers", "metadata_json", "object"),
        ("feature_groups", "metadata_json", "object"),
        ("features", "properties_json", "object"),
        ("features", "metadata_json", "object"),
        ("project_settings", "settings_json", "object"),
        ("project_snapshots", "state_json", "object"),
        ("events", "payload_json", ""),
        ("events", "metadata_json", "object"),
        ("sync_outbox", "request_json", ""),
        ("sync_outbox", "payload_json", ""),
        ("sync_conflicts", "local_event_json", ""),
        ("sync_conflicts", "server_event_json", ""),
        ("ai_messages", "token_usage_json", "object"),
        ("ai_messages", "citations_json", "array"),
        ("ai_actions", "proposal_json", "object"),
        ("ai_embeddings", "embedding_json", "array"),
    ];
    for (table, column, expected_type) in json_checks {
        if !table_exists(conn, table)? {
            continue;
        }
        let type_clause = if expected_type.is_empty() {
            String::new()
        } else {
            format!(" OR json_type({column}) <> '{expected_type}'")
        };
        let sql = format!(
            "SELECT CAST(rowid AS TEXT) FROM {table}
             WHERE {column} IS NULL OR NOT json_valid({column}){type_clause} LIMIT 100"
        );
        collect_issues(
            conn,
            &mut issues,
            "invalid_json",
            table,
            &format!("{column} must contain valid JSON of the expected type"),
            &sql,
        )?;
    }
    if table_exists(conn, "features")? {
        for (column, expected_type) in [
            ("coordinates_json", "array_or_object"),
            ("bbox_json", "array"),
        ] {
            let valid_types = if expected_type == "array_or_object" {
                "'array', 'object'"
            } else {
                "'array'"
            };
            let sql = format!(
                "SELECT id FROM features WHERE {column} IS NOT NULL
                 AND CASE
                    WHEN NOT json_valid({column}) THEN 1
                    WHEN json_type({column}) IN ({valid_types}) THEN 0
                    WHEN json_type({column}) = 'null' THEN 0
                    WHEN json_type({column}) = 'text'
                         AND json_valid(json_extract({column}, '$'))
                         AND json_type(json_extract({column}, '$')) IN ({valid_types}) THEN 0
                    ELSE 1
                 END = 1 LIMIT 100"
            );
            collect_issues(
                conn,
                &mut issues,
                "invalid_nullable_json",
                "features",
                &format!("{column} is invalid"),
                &sql,
            )?;

            let legacy_sql = format!(
                "SELECT id FROM features WHERE {column} IS NOT NULL
                 AND json_valid({column})
                 AND (
                    json_type({column}) = 'null'
                    OR (
                        json_type({column}) = 'text'
                        AND json_valid(json_extract({column}, '$'))
                        AND json_type(json_extract({column}, '$')) IN ({valid_types})
                    )
                 ) LIMIT 100"
            );
            collect_record_warnings(
                conn,
                &mut issues,
                "normalizable_legacy_json",
                "features",
                &format!(
                    "{column} uses a legacy JSON wrapper and will be normalized during v9 migration"
                ),
                &legacy_sql,
            )?;
        }
    }

    if table_exists(conn, "fiber_circuit_hops")? {
        collect_issues(
            conn,
            &mut issues,
            "invalid_hop_target",
            "fiber_circuit_hops",
            "Exactly one of strand_id or port_id must be set",
            "SELECT circuit_id || ':' || sequence_no FROM fiber_circuit_hops
             WHERE (strand_id IS NULL) = (port_id IS NULL) LIMIT 100",
        )?;
    }
    if table_exists(conn, "fiber_splices")? {
        collect_issues(
            conn,
            &mut issues,
            "duplicate_splice_endpoint",
            "fiber_splices",
            "A strand endpoint may participate in only one splice",
            "SELECT strand_id || ':' || direction FROM (
                SELECT from_strand_id strand_id, from_direction direction FROM fiber_splices
                UNION ALL SELECT to_strand_id, to_direction FROM fiber_splices
             ) GROUP BY strand_id, direction HAVING COUNT(*) > 1 LIMIT 100",
        )?;
    }
    if table_exists(conn, "fiber_port_patches")? {
        collect_issues(
            conn,
            &mut issues,
            "duplicate_patch_port",
            "fiber_port_patches",
            "A port may participate in only one patch",
            "SELECT port_id FROM (
                SELECT from_port_id port_id FROM fiber_port_patches
                UNION ALL SELECT to_port_id FROM fiber_port_patches
             ) GROUP BY port_id HAVING COUNT(*) > 1 LIMIT 100",
        )?;
    }
    if table_exists(conn, "feature_media")? {
        collect_issues(
            conn,
            &mut issues,
            "multiple_primary_media",
            "feature_media",
            "A feature may have only one primary media asset",
            "SELECT feature_id FROM feature_media WHERE is_primary = 1
             GROUP BY feature_id HAVING COUNT(*) > 1 LIMIT 100",
        )?;
    }
    if table_exists(conn, "fiber_cables")? {
        collect_record_warnings(
            conn,
            &mut issues,
            "fiber_count_mismatch",
            "fiber_cables",
            "fiber_count differs from the number of fiber_strands",
            "SELECT cable.id FROM fiber_cables cable LEFT JOIN fiber_strands strand ON strand.cable_id = cable.id
             GROUP BY cable.id HAVING cable.fiber_count IS NOT NULL AND cable.fiber_count <> COUNT(strand.id) LIMIT 100",
        )?;
    }

    let numeric_checks = [
        ("media_assets", "byte_size < 0 OR width <= 0 OR height <= 0"),
        ("events", "entity_version < 0"),
        ("sync_outbox", "retry_count < 0 OR base_entity_version < 0"),
        ("cached_leases", "entity_version < 0"),
        ("fiber_cables", "fiber_count < 0"),
        ("fiber_strands", "strand_no <= 0"),
        ("fiber_cable_points", "sequence_no < 0"),
        ("fiber_port_patches", "loss_db < 0"),
        ("fiber_splices", "loss_db < 0"),
        ("fiber_circuit_hops", "sequence_no < 0"),
    ];
    for (table, predicate) in numeric_checks {
        if table_exists(conn, table)? {
            collect_issues(
                conn,
                &mut issues,
                "invalid_numeric_value",
                table,
                "Numeric value is outside its valid range",
                &format!("SELECT CAST(rowid AS TEXT) FROM {table} WHERE {predicate} LIMIT 100"),
            )?;
        }
    }

    for (table, column) in [
        ("projects", "created_at"),
        ("projects", "updated_at"),
        ("features", "created_at"),
        ("features", "updated_at"),
        ("events", "created_at"),
        ("sync_outbox", "created_at"),
        ("sync_outbox", "updated_at"),
    ] {
        if table_exists(conn, table)? {
            collect_issues(
                conn,
                &mut issues,
                "invalid_timestamp",
                table,
                &format!("{column} cannot be normalized to UTC"),
                &format!(
                    "SELECT CAST(rowid AS TEXT) FROM {table}
                     WHERE {column} IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', {column}) IS NULL LIMIT 100"
                ),
            )?;
        }
    }

    for (table, index_name, columns) in [
        (
            "ai_actions",
            "idx_ai_actions_conversation",
            "conversation_id",
        ),
        ("ai_messages", "idx_ai_messages_project", "project_id"),
        ("file_tags", "idx_file_tags_tag", "tag_id"),
    ] {
        if table_exists(conn, table)?
            && conn
                .query_row(
                    "SELECT 1 FROM sqlite_schema WHERE type='index' AND name=?1",
                    [index_name],
                    |_| Ok(()),
                )
                .optional()?
                .is_none()
        {
            issues.push(DatabaseAuditIssue {
                severity: DatabaseAuditSeverity::Warning,
                rule: "missing_index".to_string(),
                table: table.to_string(),
                record_key: index_name.to_string(),
                detail: format!("Create an index beginning with {columns}"),
            });
        }
    }
    for (table, index_name) in [
        ("fiber_ports", "idx_fiber_ports_id"),
        ("fiber_strands", "idx_fiber_strands_id"),
    ] {
        if table_exists(conn, table)?
            && conn
                .query_row(
                    "SELECT 1 FROM sqlite_schema WHERE type='index' AND name=?1",
                    [index_name],
                    |_| Ok(()),
                )
                .optional()?
                .is_some()
        {
            issues.push(DatabaseAuditIssue {
                severity: DatabaseAuditSeverity::Warning,
                rule: "redundant_primary_key_index".to_string(),
                table: table.to_string(),
                record_key: index_name.to_string(),
                detail: "Explicit index duplicates the table primary-key index; verify query plans before removal"
                    .to_string(),
            });
        }
    }

    let sync_outbox = if table_exists(conn, "sync_outbox")? {
        let status_count = |status: &str| {
            conn.query_row(
                "SELECT COUNT(*) FROM sync_outbox WHERE status = ?1",
                [status],
                |row| row.get(0),
            )
        };
        let missing_event_count = if table_exists(conn, "events")? {
            scalar_i64(
                conn,
                "SELECT COUNT(*) FROM sync_outbox outbox
                 LEFT JOIN events event ON event.id = outbox.event_id WHERE event.id IS NULL",
            )?
        } else {
            scalar_i64(conn, "SELECT COUNT(*) FROM sync_outbox")?
        };
        SyncOutboxAuditSummary {
            pending: status_count("pending")?,
            acked: status_count("acked")?,
            failed: status_count("failed")?,
            conflicted: status_count("conflicted")?,
            max_retry_count: scalar_i64(
                conn,
                "SELECT COALESCE(MAX(retry_count), 0) FROM sync_outbox",
            )?,
            missing_event_count,
        }
    } else {
        SyncOutboxAuditSummary {
            pending: 0,
            acked: 0,
            failed: 0,
            conflicted: 0,
            max_retry_count: 0,
            missing_event_count: 0,
        }
    };
    if sync_outbox.missing_event_count > 0 {
        issues.push(DatabaseAuditIssue {
            severity: DatabaseAuditSeverity::Error,
            rule: "outbox_event_missing".to_string(),
            table: "sync_outbox".to_string(),
            record_key: "*".to_string(),
            detail: format!(
                "{} outbox records do not have a matching event",
                sync_outbox.missing_event_count
            ),
        });
    }
    if sync_outbox.failed > 0 || sync_outbox.conflicted > 0 {
        collect_count_warning(
            conn,
            &mut issues,
            "outbox_requires_attention",
            "sync_outbox",
            "Failed or conflicted outbox rows",
            "SELECT COUNT(*) FROM sync_outbox WHERE status IN ('failed', 'conflicted')",
        )?;
    }

    let schema_migration_version: Option<i32> = if table_exists(conn, "schema_migrations")? {
        conn.query_row("SELECT MAX(version) FROM schema_migrations", [], |row| {
            row.get(0)
        })?
    } else {
        None
    };
    let configured_schema_version: Option<String> = if table_exists(conn, "sys_config")? {
        conn.query_row(
            "SELECT value FROM sys_config WHERE key='schema_version'",
            [],
            |row| row.get(0),
        )
        .optional()?
    } else {
        None
    };
    if let Some(version) = schema_migration_version {
        if version != user_version {
            issues.push(DatabaseAuditIssue {
                severity: DatabaseAuditSeverity::Error,
                rule: "schema_version_mismatch".to_string(),
                table: "schema_migrations".to_string(),
                record_key: version.to_string(),
                detail: format!("PRAGMA user_version is {user_version}"),
            });
        }
    }
    if user_version > 0
        && configured_schema_version
            .as_deref()
            .is_none_or(|version| !version.starts_with(&format!("{user_version}.")))
    {
        issues.push(DatabaseAuditIssue {
            severity: DatabaseAuditSeverity::Error,
            rule: "configured_schema_version_mismatch".to_string(),
            table: "sys_config".to_string(),
            record_key: configured_schema_version
                .clone()
                .unwrap_or_else(|| "<missing>".to_string()),
            detail: format!("PRAGMA user_version is {user_version}"),
        });
    }

    Ok(DatabaseAuditReport {
        integrity_check,
        foreign_keys_enabled,
        foreign_key_violation_count,
        user_version,
        schema_migration_version,
        configured_schema_version,
        sync_outbox,
        issues,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn audit_reports_invalid_json_and_cross_project_relation() {
        let conn = Connection::open_in_memory().expect("database");
        conn.execute_batch(
            r#"
            PRAGMA foreign_keys=ON;
            CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY);
            INSERT INTO schema_migrations VALUES(8);
            CREATE TABLE sys_config(key TEXT PRIMARY KEY, value TEXT);
            INSERT INTO sys_config VALUES('schema_version', '8.0.0');
            CREATE TABLE projects(id TEXT PRIMARY KEY, metadata_json TEXT, created_at TEXT, updated_at TEXT);
            CREATE TABLE regions(id TEXT PRIMARY KEY, project_id TEXT, parent_id TEXT, metadata_json TEXT);
            CREATE TABLE layers(id TEXT PRIMARY KEY, project_id TEXT, region_id TEXT, metadata_json TEXT);
            CREATE TABLE feature_groups(
                id TEXT PRIMARY KEY, project_id TEXT, layer_id TEXT, parent_id TEXT, metadata_json TEXT
            );
            CREATE TABLE features(
                id TEXT PRIMARY KEY, project_id TEXT, layer_id TEXT, group_id TEXT,
                properties_json TEXT, metadata_json TEXT, coordinates_json TEXT, bbox_json TEXT,
                created_at TEXT, updated_at TEXT
            );
            INSERT INTO projects VALUES('p1', '{}', '2026-01-01 00:00:00', '2026-01-01 00:00:00');
            INSERT INTO projects VALUES('p2', '{}', '2026-01-01 00:00:00', '2026-01-01 00:00:00');
            INSERT INTO layers VALUES('l1', 'p1', NULL, '{}');
            INSERT INTO features VALUES(
                'f1', 'p2', 'l1', NULL, '{}', '{bad', NULL, NULL,
                '2026-01-01 00:00:00', '2026-01-01 00:00:00'
            );
            INSERT INTO features VALUES(
                'f2', 'p1', 'l1', NULL, '{}', '{}', '42', NULL,
                '2026-01-01 00:00:00', '2026-01-01 00:00:00'
            );
            PRAGMA user_version=8;
            "#,
        )
        .expect("fixture");

        let report = audit_database(&conn).expect("audit");
        assert!(report.has_blocking_errors());
        assert!(report
            .issues
            .iter()
            .any(|issue| issue.rule == "orphan_or_cross_project_layer"));
        assert!(report
            .issues
            .iter()
            .any(|issue| issue.rule == "invalid_json"));
        assert!(report
            .issues
            .iter()
            .any(|issue| { issue.rule == "invalid_nullable_json" && issue.record_key == "f2" }));
    }

    #[test]
    fn audit_allows_legacy_json_but_blocks_dangling_nullable_relation() {
        let conn = Connection::open_in_memory().expect("database");
        conn.execute_batch(
            r#"
            PRAGMA foreign_keys=ON;
            CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY);
            INSERT INTO schema_migrations VALUES(8);
            CREATE TABLE sys_config(key TEXT PRIMARY KEY, value TEXT);
            INSERT INTO sys_config VALUES('schema_version', '8.0.0');
            CREATE TABLE projects(id TEXT PRIMARY KEY, metadata_json TEXT, created_at TEXT, updated_at TEXT);
            CREATE TABLE regions(id TEXT PRIMARY KEY, project_id TEXT, parent_id TEXT, metadata_json TEXT);
            CREATE TABLE layers(id TEXT PRIMARY KEY, project_id TEXT, region_id TEXT, metadata_json TEXT);
            CREATE TABLE feature_groups(
                id TEXT PRIMARY KEY, project_id TEXT, layer_id TEXT, parent_id TEXT, metadata_json TEXT
            );
            CREATE TABLE features(
                id TEXT PRIMARY KEY, project_id TEXT, layer_id TEXT, group_id TEXT,
                properties_json TEXT, metadata_json TEXT, coordinates_json TEXT, bbox_json TEXT,
                created_at TEXT, updated_at TEXT
            );
            INSERT INTO projects VALUES('p1', '{}', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
            INSERT INTO layers VALUES('l1', 'p1', 'missing-region', '{}');
            INSERT INTO features VALUES(
                'f1', 'p1', 'l1', NULL, '{}', '{}', '"[105.78,21.04]"', NULL,
                '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
            );
            INSERT INTO features VALUES(
                'f2', 'p1', 'l1', NULL, '{}', '{}', 'null', NULL,
                '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
            );
            PRAGMA user_version=8;
            "#,
        )
        .expect("fixture");

        let report = audit_database(&conn).expect("audit");
        assert!(report.has_blocking_errors());
        assert!(report
            .issues
            .iter()
            .any(|issue| issue.rule == "normalizable_legacy_json"));
        assert!(report
            .issues
            .iter()
            .any(|issue| issue.rule == "orphan_nullable_relation"));
    }
}
