use rusqlite::Connection;

pub const CURRENT_SCHEMA_VERSION: i32 = 4;
pub const CURRENT_SCHEMA_LABEL: &str = "4.0.0";

pub const V4_SCHEMA_SQL: &str = r#"
    PRAGMA journal_mode=WAL;
    PRAGMA synchronous=NORMAL;
    PRAGMA foreign_keys=ON;
    PRAGMA user_version = 4;

    CREATE TABLE IF NOT EXISTS sys_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    INSERT OR REPLACE INTO sys_config (key, value) VALUES ('schema_version', '4.0.0');

    CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        label TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    INSERT OR REPLACE INTO schema_migrations (version, label) VALUES (4, '4.0.0');

    CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        base_dir_hint TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json) AND json_type(metadata_json) = 'object'),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        rel_path TEXT NOT NULL,
        filename TEXT NOT NULL,
        extension TEXT,
        file_size INTEGER,
        hash_sha256 TEXT,
        mime_type TEXT,
        status TEXT DEFAULT 'active',
        metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json) AND json_type(metadata_json) = 'object'),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    DROP INDEX IF EXISTS idx_file_rel_path;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_files_project_rel_path ON files (project_id, rel_path);
    CREATE INDEX IF NOT EXISTS idx_files_project_id ON files (project_id);

    CREATE TABLE IF NOT EXISTS regions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        parent_id TEXT,
        name TEXT NOT NULL,
        description TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json) AND json_type(metadata_json) = 'object'),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_regions_project ON regions (project_id);

    CREATE TABLE IF NOT EXISTS layers (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        region_id TEXT,
        name TEXT NOT NULL,
        is_visible INTEGER NOT NULL DEFAULT 1 CHECK (is_visible IN (0, 1)),
        metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json) AND json_type(metadata_json) = 'object'),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_layers_project ON layers (project_id);

    CREATE TABLE IF NOT EXISTS feature_groups (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        layer_id TEXT NOT NULL,
        parent_id TEXT,
        name TEXT NOT NULL,
        group_type TEXT,
        is_visible INTEGER NOT NULL DEFAULT 1 CHECK (is_visible IN (0, 1)),
        metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json) AND json_type(metadata_json) = 'object'),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_feature_groups_project ON feature_groups (project_id);

    CREATE TABLE IF NOT EXISTS features (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        layer_id TEXT NOT NULL,
        group_id TEXT,
        name TEXT NOT NULL,
        geom_type TEXT NOT NULL,
        coordinates_json TEXT,
        properties_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(properties_json) AND json_type(properties_json) = 'object'),
        metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json) AND json_type(metadata_json) = 'object'),
        bbox_json TEXT,
        is_visible INTEGER NOT NULL DEFAULT 1 CHECK (is_visible IN (0, 1)),
        note TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_features_project ON features (project_id);

    CREATE TABLE IF NOT EXISTS media_assets (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        sha256 TEXT NOT NULL,
        rel_path TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        byte_size INTEGER NOT NULL,
        width INTEGER,
        height INTEGER,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    DROP INDEX IF EXISTS idx_media_assets_project_sha;
    CREATE INDEX IF NOT EXISTS idx_media_assets_project_sha ON media_assets (project_id, sha256);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_media_assets_project_rel_path ON media_assets (project_id, rel_path);
    CREATE INDEX IF NOT EXISTS idx_media_assets_project ON media_assets (project_id);

    CREATE TABLE IF NOT EXISTS feature_media (
        feature_id TEXT NOT NULL,
        asset_id TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        PRIMARY KEY (feature_id, asset_id),
        FOREIGN KEY(feature_id) REFERENCES features(id) ON DELETE CASCADE,
        FOREIGN KEY(asset_id) REFERENCES media_assets(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_feature_media_asset ON feature_media (asset_id);

    CREATE TABLE IF NOT EXISTS project_settings (
        project_id TEXT PRIMARY KEY,
        settings_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(settings_json) AND json_type(settings_json) = 'object'),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS project_snapshots (
        project_id TEXT PRIMARY KEY,
        state_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(state_json) AND json_type(state_json) = 'object'),
        hydrated_at TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS events (
        global_seq INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        project_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
        metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json) AND json_type(metadata_json) = 'object'),
        device_id TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        hash TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_events_project ON events (project_id, global_seq);

    CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        color TEXT DEFAULT '#6a9bcc',
        category TEXT
    );
    CREATE TABLE IF NOT EXISTS file_tags (
        file_id TEXT NOT NULL,
        tag_id INTEGER NOT NULL,
        PRIMARY KEY (file_id, tag_id),
        FOREIGN KEY(file_id) REFERENCES files(id) ON DELETE CASCADE,
        FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS fts_files_content USING fts5(
        file_id UNINDEXED, content, tokenize='unicode61'
    );

    CREATE TRIGGER IF NOT EXISTS fts_file_insert AFTER INSERT ON files BEGIN
        INSERT INTO fts_files_content(file_id, content) VALUES (new.id, new.filename || ' ' || new.metadata_json);
    END;
    CREATE TRIGGER IF NOT EXISTS fts_file_update AFTER UPDATE ON files BEGIN
        DELETE FROM fts_files_content WHERE file_id = old.id;
        INSERT INTO fts_files_content(file_id, content) VALUES (new.id, new.filename || ' ' || new.metadata_json);
    END;
    CREATE TRIGGER IF NOT EXISTS fts_file_delete AFTER DELETE ON files BEGIN
        DELETE FROM fts_files_content WHERE file_id = old.id;
    END;
"#;

pub fn apply_v2_schema(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(V4_SCHEMA_SQL)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn apply_schema_sets_v4_and_creates_snapshot_tables() {
        let conn = Connection::open_in_memory().expect("in-memory db");
        apply_v2_schema(&conn).expect("schema applied");

        let version: i32 = conn
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .expect("user_version");
        assert_eq!(version, CURRENT_SCHEMA_VERSION);

        let snapshot_table: String = conn
            .query_row(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'project_snapshots'",
                [],
                |row| row.get(0),
            )
            .expect("project_snapshots table");
        assert_eq!(snapshot_table, "project_snapshots");

        let migration_label: String = conn
            .query_row(
                "SELECT label FROM schema_migrations WHERE version = ?1",
                [CURRENT_SCHEMA_VERSION],
                |row| row.get(0),
            )
            .expect("schema migration label");
        assert_eq!(migration_label, CURRENT_SCHEMA_LABEL);
    }
}
