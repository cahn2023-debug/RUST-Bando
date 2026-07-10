pub const V2_SCHEMA_SQL: &str = r#"
    PRAGMA journal_mode=WAL;
    PRAGMA synchronous=NORMAL;
    PRAGMA foreign_keys=ON;
    PRAGMA user_version = 2;

    CREATE TABLE IF NOT EXISTS sys_config (
        key TEXT PRIMARY KEY, value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    INSERT OR IGNORE INTO sys_config (key, value) VALUES ('schema_version', '2.0.0');

    CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT,
        base_dir_hint TEXT, metadata_json TEXT DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY, project_id TEXT NOT NULL,
        rel_path TEXT NOT NULL, filename TEXT NOT NULL, extension TEXT,
        file_size INTEGER, hash_sha256 TEXT, mime_type TEXT,
        status TEXT DEFAULT 'active', metadata_json TEXT DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_file_rel_path ON files (rel_path);
    
    CREATE TABLE IF NOT EXISTS events (
        global_seq INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        project_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        metadata_json TEXT DEFAULT '{}',
        device_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        hash TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_events_project ON events (project_id, global_seq);

    CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE,
        color TEXT DEFAULT '#6a9bcc', category TEXT
    );
    CREATE TABLE IF NOT EXISTS file_tags (
        file_id TEXT NOT NULL, tag_id INTEGER NOT NULL,
        PRIMARY KEY (file_id, tag_id),
        FOREIGN KEY(file_id) REFERENCES files(id) ON DELETE CASCADE,
        FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS fts_files_content USING fts5(
        file_id UNINDEXED, content, tokenize="unicode61"
    );

    -- FTS5 Sync Triggers
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
