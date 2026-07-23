use rusqlite::{Connection, OptionalExtension};

pub const CURRENT_SCHEMA_VERSION: i32 = 8;
pub const CURRENT_SCHEMA_LABEL: &str = "8.0.0";

pub const V8_SCHEMA_SQL: &str = r#"
    PRAGMA journal_mode=WAL;
    PRAGMA synchronous=NORMAL;
    PRAGMA foreign_keys=ON;
    PRAGMA user_version = 8;

    CREATE TABLE IF NOT EXISTS sys_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    INSERT OR REPLACE INTO sys_config (key, value) VALUES ('schema_version', '8.0.0');

    CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        label TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    INSERT OR REPLACE INTO schema_migrations (version, label) VALUES (8, '8.0.0');

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
        server_seq INTEGER,
        entity_version INTEGER NOT NULL DEFAULT 1,
        sync_batch_id TEXT,
        sync_status TEXT NOT NULL DEFAULT 'local',
        acked_at TEXT,
        server_time TEXT,
        ledger_hash TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        hash TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_events_project ON events (project_id, global_seq);

    CREATE TABLE IF NOT EXISTS sync_outbox (
        event_id TEXT PRIMARY KEY,
        batch_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        base_entity_version INTEGER NOT NULL DEFAULT 1,
        request_json TEXT NOT NULL CHECK (json_valid(request_json)),
        payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'acked', 'failed', 'conflicted')),
        retry_count INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        server_seq INTEGER,
        server_hash TEXT,
        server_time TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        acked_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_sync_outbox_project_status ON sync_outbox (project_id, status, created_at);

    CREATE TABLE IF NOT EXISTS sync_cursor (
        project_id TEXT PRIMARY KEY,
        last_server_seq INTEGER NOT NULL DEFAULT 0,
        last_event_id TEXT,
        last_ledger_hash TEXT,
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS cached_leases (
        project_id TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        holder TEXT,
        lease_token TEXT,
        entity_version INTEGER NOT NULL DEFAULT 0,
        expires_at TEXT,
        renewed_at TEXT,
        status TEXT NOT NULL DEFAULT 'cached' CHECK (status IN ('cached', 'leased', 'expired')),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        PRIMARY KEY (project_id, entity_id)
    );

    CREATE TABLE IF NOT EXISTS sync_conflicts (
        conflict_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        base_entity_version INTEGER NOT NULL DEFAULT 0,
        local_event_json TEXT NOT NULL CHECK (json_valid(local_event_json)),
        server_event_json TEXT NOT NULL CHECK (json_valid(server_event_json)),
        resolution_status TEXT NOT NULL DEFAULT 'open' CHECK (resolution_status IN ('open', 'local_wins', 'server_wins', 'merged', 'resolved')),
        resolved_by TEXT,
        resolved_at TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sync_conflicts_project_status ON sync_conflicts (project_id, resolution_status, created_at);

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

    CREATE TABLE IF NOT EXISTS ai_conversations (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json) AND json_type(metadata_json) = 'object'),
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_ai_conversations_project ON ai_conversations(project_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS ai_messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('system', 'user', 'assistant', 'tool')),
        content TEXT NOT NULL,
        provider TEXT,
        model TEXT,
        token_usage_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(token_usage_json) AND json_type(token_usage_json) = 'object'),
        citations_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(citations_json) AND json_type(citations_json) = 'array'),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        FOREIGN KEY(conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation ON ai_messages(conversation_id, created_at);

    CREATE TABLE IF NOT EXISTS ai_actions (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        action_type TEXT NOT NULL,
        target_table TEXT NOT NULL,
        target_id TEXT,
        proposal_json TEXT NOT NULL CHECK (json_valid(proposal_json) AND json_type(proposal_json) = 'object'),
        status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed', 'accepted', 'rejected', 'failed')),
        base_version TEXT,
        decision_note TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        decided_at TEXT,
        FOREIGN KEY(conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_ai_actions_project ON ai_actions(project_id, status, created_at);

    CREATE TABLE IF NOT EXISTS ai_embeddings (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        source_table TEXT NOT NULL,
        source_id TEXT NOT NULL,
        source_hash TEXT NOT NULL,
        model TEXT NOT NULL,
        dims INTEGER NOT NULL,
        embedding_json TEXT NOT NULL CHECK (json_valid(embedding_json) AND json_type(embedding_json) = 'array'),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        UNIQUE(project_id, source_table, source_id, model),
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_ai_embeddings_source ON ai_embeddings(project_id, source_table, source_id);

    CREATE TABLE IF NOT EXISTS ai_corrections (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        source_path TEXT,
        source_table TEXT,
        source_id TEXT,
        original_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(original_json)),
        corrected_json TEXT NOT NULL CHECK (json_valid(corrected_json)),
        reason TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_ai_corrections_project ON ai_corrections(project_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS fiber_cables (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        feature_id TEXT NOT NULL UNIQUE,
        cable_type TEXT,
        fiber_count INTEGER,
        owner TEXT,
        status TEXT NOT NULL DEFAULT 'planned',
        source TEXT NOT NULL DEFAULT 'manual',
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY(feature_id) REFERENCES features(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_fiber_cables_project ON fiber_cables (project_id);
    CREATE INDEX IF NOT EXISTS idx_fiber_cables_feature ON fiber_cables (feature_id);

    CREATE TABLE IF NOT EXISTS fiber_strands (
        id TEXT PRIMARY KEY,
        cable_id TEXT NOT NULL,
        strand_no INTEGER NOT NULL,
        color TEXT,
        status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'reserved', 'active', 'damaged')),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        FOREIGN KEY(cable_id) REFERENCES fiber_cables(id) ON DELETE CASCADE,
        UNIQUE(cable_id, strand_no)
    );
    CREATE INDEX IF NOT EXISTS idx_fiber_strands_cable ON fiber_strands (cable_id);
    CREATE INDEX IF NOT EXISTS idx_fiber_strands_id ON fiber_strands (id);

    CREATE TABLE IF NOT EXISTS fiber_cable_points (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        cable_id TEXT NOT NULL,
        feature_id TEXT NOT NULL,
        point_kind TEXT NOT NULL CHECK (point_kind IN ('cable_start', 'cable_end', 'splice_enclosure')),
        sequence_no INTEGER NOT NULL DEFAULT 0,
        vertex_index INTEGER,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY(cable_id) REFERENCES fiber_cables(id) ON DELETE CASCADE,
        FOREIGN KEY(feature_id) REFERENCES features(id) ON DELETE CASCADE,
        UNIQUE(cable_id, point_kind, sequence_no)
    );
    CREATE INDEX IF NOT EXISTS idx_fiber_cable_points_project ON fiber_cable_points (project_id);
    CREATE INDEX IF NOT EXISTS idx_fiber_cable_points_cable ON fiber_cable_points (cable_id);
    CREATE INDEX IF NOT EXISTS idx_fiber_cable_points_feature ON fiber_cable_points (feature_id);

    CREATE TABLE IF NOT EXISTS fiber_ports (
        id TEXT PRIMARY KEY,
        feature_id TEXT NOT NULL,
        port_label TEXT NOT NULL,
        port_kind TEXT NOT NULL,
        direction TEXT NOT NULL DEFAULT 'bidirectional' CHECK (direction IN ('input', 'output', 'bidirectional')),
        status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'reserved', 'active', 'damaged')),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        FOREIGN KEY(feature_id) REFERENCES features(id) ON DELETE CASCADE,
        UNIQUE(feature_id, port_label)
    );
    CREATE INDEX IF NOT EXISTS idx_fiber_ports_feature ON fiber_ports (feature_id);
    CREATE INDEX IF NOT EXISTS idx_fiber_ports_id ON fiber_ports (id);

    CREATE TABLE IF NOT EXISTS fiber_port_terminations (
        id TEXT PRIMARY KEY,
        port_id TEXT NOT NULL,
        strand_id TEXT NOT NULL,
        strand_direction TEXT NOT NULL DEFAULT 'start' CHECK (strand_direction IN ('start', 'end')),
        side TEXT NOT NULL DEFAULT 'left' CHECK (side IN ('left', 'right')),
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        FOREIGN KEY(port_id) REFERENCES fiber_ports(id) ON DELETE CASCADE,
        FOREIGN KEY(strand_id) REFERENCES fiber_strands(id) ON DELETE CASCADE,
        UNIQUE(port_id),
        UNIQUE(strand_id, strand_direction)
    );
    CREATE INDEX IF NOT EXISTS idx_fiber_port_terminations_port ON fiber_port_terminations (port_id);
    CREATE INDEX IF NOT EXISTS idx_fiber_port_terminations_strand ON fiber_port_terminations (strand_id, strand_direction);

    CREATE TABLE IF NOT EXISTS fiber_port_patches (
        id TEXT PRIMARY KEY,
        from_port_id TEXT NOT NULL,
        to_port_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        loss_db REAL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        FOREIGN KEY(from_port_id) REFERENCES fiber_ports(id) ON DELETE CASCADE,
        FOREIGN KEY(to_port_id) REFERENCES fiber_ports(id) ON DELETE CASCADE,
        CHECK(from_port_id <> to_port_id)
    );
    CREATE INDEX IF NOT EXISTS idx_fiber_port_patches_from ON fiber_port_patches (from_port_id);
    CREATE INDEX IF NOT EXISTS idx_fiber_port_patches_to ON fiber_port_patches (to_port_id);

    CREATE TABLE IF NOT EXISTS fiber_splices (
        id TEXT PRIMARY KEY,
        enclosure_feature_id TEXT NOT NULL,
        from_strand_id TEXT NOT NULL,
        to_strand_id TEXT NOT NULL,
        from_direction TEXT NOT NULL DEFAULT 'start' CHECK (from_direction IN ('start', 'end')),
        to_direction TEXT NOT NULL DEFAULT 'start' CHECK (to_direction IN ('start', 'end')),
        loss_db REAL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        FOREIGN KEY(enclosure_feature_id) REFERENCES features(id) ON DELETE CASCADE,
        FOREIGN KEY(from_strand_id) REFERENCES fiber_strands(id) ON DELETE CASCADE,
        FOREIGN KEY(to_strand_id) REFERENCES fiber_strands(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_fiber_splices_enclosure ON fiber_splices (enclosure_feature_id);
    CREATE INDEX IF NOT EXISTS idx_fiber_splices_from_strand ON fiber_splices (from_strand_id);
    CREATE INDEX IF NOT EXISTS idx_fiber_splices_to_strand ON fiber_splices (to_strand_id);

    CREATE TABLE IF NOT EXISTS fiber_circuits (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        service_type TEXT NOT NULL DEFAULT 'data',
        status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'suspended', 'down', 'retired')),
        a_feature_id TEXT NOT NULL,
        z_feature_id TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY(a_feature_id) REFERENCES features(id) ON DELETE CASCADE,
        FOREIGN KEY(z_feature_id) REFERENCES features(id) ON DELETE CASCADE,
        UNIQUE(project_id, name)
    );
    CREATE INDEX IF NOT EXISTS idx_fiber_circuits_project ON fiber_circuits (project_id);
    CREATE INDEX IF NOT EXISTS idx_fiber_circuits_a_feature ON fiber_circuits (a_feature_id);
    CREATE INDEX IF NOT EXISTS idx_fiber_circuits_z_feature ON fiber_circuits (z_feature_id);

    CREATE TABLE IF NOT EXISTS fiber_circuit_hops (
        circuit_id TEXT NOT NULL,
        sequence_no INTEGER NOT NULL,
        strand_id TEXT,
        port_id TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        PRIMARY KEY (circuit_id, sequence_no),
        FOREIGN KEY(circuit_id) REFERENCES fiber_circuits(id) ON DELETE CASCADE,
        FOREIGN KEY(strand_id) REFERENCES fiber_strands(id) ON DELETE SET NULL,
        FOREIGN KEY(port_id) REFERENCES fiber_ports(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_fiber_circuit_hops_circuit ON fiber_circuit_hops (circuit_id);
    CREATE INDEX IF NOT EXISTS idx_fiber_circuit_hops_strand ON fiber_circuit_hops (strand_id);
    CREATE INDEX IF NOT EXISTS idx_fiber_circuit_hops_port ON fiber_circuit_hops (port_id);

    CREATE TABLE IF NOT EXISTS equipment (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        feature_id TEXT NOT NULL,
        equipment_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY(feature_id) REFERENCES features(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_equipment_project ON equipment (project_id);
    CREATE INDEX IF NOT EXISTS idx_equipment_feature ON equipment (feature_id);

    INSERT OR IGNORE INTO fiber_cables (
        id,
        project_id,
        feature_id,
        cable_type,
        fiber_count,
        owner,
        status,
        source
    )
    SELECT
        f.id,
        f.project_id,
        f.id,
        COALESCE(
            NULLIF(json_extract(f.metadata_json, '$.infrastructure.cable_type'), ''),
            NULLIF(json_extract(f.metadata_json, '$.infrastructure.type'), ''),
            NULLIF(f.geom_type, '')
        ),
        CAST(json_extract(f.metadata_json, '$.infrastructure.core_count') AS INTEGER),
        NULLIF(json_extract(f.metadata_json, '$.infrastructure.owner'), ''),
        CASE
            WHEN LOWER(COALESCE(NULLIF(json_extract(f.metadata_json, '$.infrastructure.status'), ''), 'planned')) IN ('planned', 'active', 'retired', 'damaged')
                THEN LOWER(COALESCE(NULLIF(json_extract(f.metadata_json, '$.infrastructure.status'), ''), 'planned'))
            ELSE 'planned'
        END,
        'legacy'
    FROM features f
    WHERE LOWER(f.geom_type) = 'networklink'
       OR LOWER(COALESCE(json_extract(f.metadata_json, '$.infrastructure.type'), json_extract(f.metadata_json, '$.type'), '')) IN ('signalline', 'networklink')
       OR (
            LOWER(COALESCE(f.geom_type, '')) LIKE '%line%'
            AND (
                (json_extract(f.metadata_json, '$.network.from_feature_id') IS NOT NULL AND json_extract(f.metadata_json, '$.network.to_feature_id') IS NOT NULL)
                OR (json_extract(f.metadata_json, '$.network.from_endpoint.id') IS NOT NULL AND json_extract(f.metadata_json, '$.network.to_endpoint.id') IS NOT NULL)
                OR (json_extract(f.metadata_json, '$.start_node_id') IS NOT NULL AND json_extract(f.metadata_json, '$.end_node_id') IS NOT NULL)
            )
       );
"#;

pub fn apply_v2_schema(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(V8_SCHEMA_SQL)?;
    ensure_v8_compatibility(conn)
}

fn column_exists(conn: &Connection, table: &str, column: &str) -> Result<bool, rusqlite::Error> {
    conn.query_row(
        "SELECT 1 FROM pragma_table_info(?1) WHERE name = ?2 LIMIT 1",
        [table, column],
        |_| Ok(()),
    )
    .optional()
    .map(|value| value.is_some())
}

fn fiber_splices_has_legacy_self_check(conn: &Connection) -> Result<bool, rusqlite::Error> {
    conn.query_row(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'fiber_splices'",
        [],
        |row| row.get::<_, String>(0),
    )
    .optional()
    .map(|sql| sql.is_some_and(|value| value.contains("CHECK(from_strand_id <> to_strand_id)")))
}

fn rebuild_fiber_splices_without_legacy_self_check(
    conn: &Connection,
) -> Result<(), rusqlite::Error> {
    conn.execute_batch(
        r#"
        PRAGMA foreign_keys=OFF;

        DROP TRIGGER IF EXISTS trg_fiber_splices_no_self_insert;
        DROP TRIGGER IF EXISTS trg_fiber_splices_no_self_update;
        DROP TRIGGER IF EXISTS trg_fiber_splices_no_duplicate_insert;
        DROP TRIGGER IF EXISTS trg_fiber_splices_no_duplicate_update;

        CREATE TABLE IF NOT EXISTS fiber_splices_v8_rebuild (
            id TEXT PRIMARY KEY,
            enclosure_feature_id TEXT NOT NULL,
            from_strand_id TEXT NOT NULL,
            to_strand_id TEXT NOT NULL,
            from_direction TEXT NOT NULL DEFAULT 'start' CHECK (from_direction IN ('start', 'end')),
            to_direction TEXT NOT NULL DEFAULT 'start' CHECK (to_direction IN ('start', 'end')),
            loss_db REAL,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            FOREIGN KEY(enclosure_feature_id) REFERENCES features(id) ON DELETE CASCADE,
            FOREIGN KEY(from_strand_id) REFERENCES fiber_strands(id) ON DELETE CASCADE,
            FOREIGN KEY(to_strand_id) REFERENCES fiber_strands(id) ON DELETE CASCADE
        );

        INSERT OR REPLACE INTO fiber_splices_v8_rebuild (
            id,
            enclosure_feature_id,
            from_strand_id,
            to_strand_id,
            from_direction,
            to_direction,
            loss_db,
            created_at,
            updated_at
        )
        SELECT
            id,
            enclosure_feature_id,
            from_strand_id,
            to_strand_id,
            from_direction,
            to_direction,
            loss_db,
            created_at,
            updated_at
        FROM fiber_splices;

        DROP TABLE fiber_splices;
        ALTER TABLE fiber_splices_v8_rebuild RENAME TO fiber_splices;
        CREATE INDEX IF NOT EXISTS idx_fiber_splices_enclosure ON fiber_splices (enclosure_feature_id);
        CREATE INDEX IF NOT EXISTS idx_fiber_splices_from_strand ON fiber_splices (from_strand_id);
        CREATE INDEX IF NOT EXISTS idx_fiber_splices_to_strand ON fiber_splices (to_strand_id);

        PRAGMA foreign_keys=ON;
        "#,
    )
}

pub fn ensure_v8_compatibility(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS fiber_port_terminations (
            id TEXT PRIMARY KEY,
            port_id TEXT NOT NULL,
            strand_id TEXT NOT NULL,
            strand_direction TEXT NOT NULL DEFAULT 'start' CHECK (strand_direction IN ('start', 'end')),
            side TEXT NOT NULL DEFAULT 'left' CHECK (side IN ('left', 'right')),
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            FOREIGN KEY(port_id) REFERENCES fiber_ports(id) ON DELETE CASCADE,
            FOREIGN KEY(strand_id) REFERENCES fiber_strands(id) ON DELETE CASCADE,
            UNIQUE(port_id),
            UNIQUE(strand_id, strand_direction)
        );
        CREATE INDEX IF NOT EXISTS idx_fiber_port_terminations_port ON fiber_port_terminations (port_id);
        CREATE INDEX IF NOT EXISTS idx_fiber_port_terminations_strand ON fiber_port_terminations (strand_id, strand_direction);

        CREATE TABLE IF NOT EXISTS fiber_port_patches (
            id TEXT PRIMARY KEY,
            from_port_id TEXT NOT NULL,
            to_port_id TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            loss_db REAL,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            FOREIGN KEY(from_port_id) REFERENCES fiber_ports(id) ON DELETE CASCADE,
            FOREIGN KEY(to_port_id) REFERENCES fiber_ports(id) ON DELETE CASCADE,
            CHECK(from_port_id <> to_port_id)
        );
        CREATE INDEX IF NOT EXISTS idx_fiber_port_patches_from ON fiber_port_patches (from_port_id);
        CREATE INDEX IF NOT EXISTS idx_fiber_port_patches_to ON fiber_port_patches (to_port_id);
        "#,
    )?;

    if !column_exists(conn, "fiber_splices", "from_direction")? {
        conn.execute_batch(
            "ALTER TABLE fiber_splices ADD COLUMN from_direction TEXT NOT NULL DEFAULT 'start';",
        )?;
    }
    if !column_exists(conn, "fiber_splices", "to_direction")? {
        conn.execute_batch(
            "ALTER TABLE fiber_splices ADD COLUMN to_direction TEXT NOT NULL DEFAULT 'start';",
        )?;
    }
    if fiber_splices_has_legacy_self_check(conn)? {
        rebuild_fiber_splices_without_legacy_self_check(conn)?;
    }

    conn.execute_batch(
        r#"
        DROP TRIGGER IF EXISTS trg_fiber_splices_no_self_insert;
        DROP TRIGGER IF EXISTS trg_fiber_splices_no_self_update;
        DROP TRIGGER IF EXISTS trg_fiber_splices_no_duplicate_insert;
        DROP TRIGGER IF EXISTS trg_fiber_splices_no_duplicate_update;
        DROP TRIGGER IF EXISTS trg_fiber_port_patches_no_duplicate_insert;
        DROP TRIGGER IF EXISTS trg_fiber_port_patches_no_duplicate_update;

        CREATE TRIGGER IF NOT EXISTS trg_fiber_splices_no_self_insert
        BEFORE INSERT ON fiber_splices
        WHEN NEW.from_strand_id = NEW.to_strand_id
         AND NEW.from_direction = NEW.to_direction
        BEGIN
            SELECT RAISE(ABORT, 'fiber splice cannot connect a strand to itself');
        END;

        CREATE TRIGGER IF NOT EXISTS trg_fiber_splices_no_self_update
        BEFORE UPDATE ON fiber_splices
        WHEN NEW.from_strand_id = NEW.to_strand_id
         AND NEW.from_direction = NEW.to_direction
        BEGIN
            SELECT RAISE(ABORT, 'fiber splice cannot connect a strand to itself');
        END;

        CREATE TRIGGER IF NOT EXISTS trg_fiber_splices_no_duplicate_insert
        BEFORE INSERT ON fiber_splices
        WHEN EXISTS (
            SELECT 1
            FROM fiber_splices existing
            WHERE existing.id <> NEW.id
              AND (
                (existing.from_strand_id = NEW.from_strand_id
                  AND existing.from_direction = NEW.from_direction
                  AND existing.to_strand_id = NEW.to_strand_id
                  AND existing.to_direction = NEW.to_direction)
                OR
                (existing.from_strand_id = NEW.to_strand_id
                  AND existing.from_direction = NEW.to_direction
                  AND existing.to_strand_id = NEW.from_strand_id
                  AND existing.to_direction = NEW.from_direction)
              )
        )
        BEGIN
            SELECT RAISE(ABORT, 'fiber splice pair already exists');
        END;

        CREATE TRIGGER IF NOT EXISTS trg_fiber_splices_no_duplicate_update
        BEFORE UPDATE ON fiber_splices
        WHEN EXISTS (
            SELECT 1
            FROM fiber_splices existing
            WHERE existing.id <> NEW.id
              AND (
                (existing.from_strand_id = NEW.from_strand_id
                  AND existing.from_direction = NEW.from_direction
                  AND existing.to_strand_id = NEW.to_strand_id
                  AND existing.to_direction = NEW.to_direction)
                OR
                (existing.from_strand_id = NEW.to_strand_id
                  AND existing.from_direction = NEW.to_direction
                  AND existing.to_strand_id = NEW.from_strand_id
                  AND existing.to_direction = NEW.from_direction)
              )
        )
        BEGIN
            SELECT RAISE(ABORT, 'fiber splice pair already exists');
        END;

        CREATE TRIGGER IF NOT EXISTS trg_fiber_port_patches_no_duplicate_insert
        BEFORE INSERT ON fiber_port_patches
        WHEN EXISTS (
            SELECT 1
            FROM fiber_port_patches existing
            WHERE existing.id <> NEW.id
              AND (
                (existing.from_port_id = NEW.from_port_id AND existing.to_port_id = NEW.to_port_id)
                OR
                (existing.from_port_id = NEW.to_port_id AND existing.to_port_id = NEW.from_port_id)
              )
        )
        BEGIN
            SELECT RAISE(ABORT, 'fiber port patch already exists');
        END;

        CREATE TRIGGER IF NOT EXISTS trg_fiber_port_patches_no_duplicate_update
        BEFORE UPDATE ON fiber_port_patches
        WHEN EXISTS (
            SELECT 1
            FROM fiber_port_patches existing
            WHERE existing.id <> NEW.id
              AND (
                (existing.from_port_id = NEW.from_port_id AND existing.to_port_id = NEW.to_port_id)
                OR
                (existing.from_port_id = NEW.to_port_id AND existing.to_port_id = NEW.from_port_id)
              )
        )
        BEGIN
            SELECT RAISE(ABORT, 'fiber port patch already exists');
        END;
        "#,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;

    #[test]
    fn apply_schema_sets_v7_and_creates_fiber_tables() {
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

        let ai_table: String = conn
            .query_row(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'ai_conversations'",
                [],
                |row| row.get(0),
            )
            .expect("ai_conversations table");
        assert_eq!(ai_table, "ai_conversations");

        let migration_label: String = conn
            .query_row(
                "SELECT label FROM schema_migrations WHERE version = ?1",
                [CURRENT_SCHEMA_VERSION],
                |row| row.get(0),
            )
            .expect("schema migration label");
        assert_eq!(migration_label, CURRENT_SCHEMA_LABEL);

        let fiber_table: String = conn
            .query_row(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'fiber_cables'",
                [],
                |row| row.get(0),
            )
            .expect("fiber_cables table");
        assert_eq!(fiber_table, "fiber_cables");

        let cable_points_table: String = conn
            .query_row(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'fiber_cable_points'",
                [],
                |row| row.get(0),
            )
            .expect("fiber_cable_points table");
        assert_eq!(cable_points_table, "fiber_cable_points");
    }

    #[test]
    fn apply_schema_backfills_network_lines_into_fiber_cables() {
        let conn = Connection::open_in_memory().expect("in-memory db");
        apply_v2_schema(&conn).expect("schema applied");

        conn.execute(
            "INSERT INTO projects (id, name, title) VALUES (?1, ?2, ?3)",
            params!["project-1", "Project 1", "Project 1"],
        )
        .expect("project");
        conn.execute(
            "INSERT INTO layers (id, project_id, region_id, name, is_visible, metadata_json) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params!["layer-1", "project-1", Option::<String>::None, "Layer 1", 1, "{}"],
        )
        .expect("layer");
        conn.execute(
            "INSERT INTO features (id, project_id, layer_id, group_id, name, geom_type, coordinates_json, properties_json, metadata_json) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                "feature-1",
                "project-1",
                "layer-1",
                Option::<String>::None,
                "Line 1",
                "LineString",
                "[[0,0],[1,1]]",
                "{}",
                r#"{"network":{"from_feature_id":"node-a","to_feature_id":"node-b"},"infrastructure":{"type":"SignalLine","core_count":12,"status":"legacy"}}"#,
            ],
        )
        .expect("feature");

        apply_v2_schema(&conn).expect("schema reapplied");

        let cable_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM fiber_cables WHERE id = ?1",
                ["feature-1"],
                |row| row.get(0),
            )
            .expect("fiber cable count");
        assert_eq!(cable_count, 1);

        let cable_status: String = conn
            .query_row(
                "SELECT status FROM fiber_cables WHERE id = ?1",
                ["feature-1"],
                |row| row.get(0),
            )
            .expect("fiber cable status");
        assert_eq!(cable_status, "planned");

        let strand_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM fiber_strands WHERE cable_id = ?1",
                ["feature-1"],
                |row| row.get(0),
            )
            .expect("fiber strand count");
        assert_eq!(strand_count, 0);
    }

    #[test]
    fn apply_schema_migrates_existing_splice_direction_columns() {
        let conn = Connection::open_in_memory().expect("in-memory db");
        conn.execute_batch(
            r#"
            CREATE TABLE fiber_splices (
                id TEXT PRIMARY KEY,
                enclosure_feature_id TEXT NOT NULL,
                from_strand_id TEXT NOT NULL,
                to_strand_id TEXT NOT NULL,
                loss_db REAL,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            );
            "#,
        )
        .expect("legacy splice table");

        apply_v2_schema(&conn).expect("schema migrated");

        assert!(
            column_exists(&conn, "fiber_splices", "from_direction").expect("from_direction lookup")
        );
        assert!(column_exists(&conn, "fiber_splices", "to_direction").expect("to_direction lookup"));

        conn.execute(
            "INSERT INTO fiber_splices (id, enclosure_feature_id, from_strand_id, to_strand_id, from_direction, to_direction, loss_db)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params!["splice-1", "enclosure-1", "strand-1", "strand-2", "end", "start", 0.05],
        )
        .expect("directional splice insert");

        let duplicate = conn.execute(
            "INSERT INTO fiber_splices (id, enclosure_feature_id, from_strand_id, to_strand_id, from_direction, to_direction, loss_db)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params!["splice-2", "enclosure-1", "strand-2", "strand-1", "start", "end", 0.05],
        );
        assert!(duplicate.is_err());

        conn.execute(
            "INSERT INTO fiber_splices (id, enclosure_feature_id, from_strand_id, to_strand_id, from_direction, to_direction, loss_db)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params!["splice-3", "enclosure-1", "strand-1", "strand-1", "end", "start", 0.05],
        )
        .expect("same strand with opposite directions insert");

        let same_direction_self_splice = conn.execute(
            "INSERT INTO fiber_splices (id, enclosure_feature_id, from_strand_id, to_strand_id, from_direction, to_direction, loss_db)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params!["splice-4", "enclosure-1", "strand-1", "strand-1", "end", "end", 0.05],
        );
        assert!(same_direction_self_splice.is_err());
    }

    #[test]
    fn apply_schema_rebuilds_legacy_splice_self_check() {
        let conn = Connection::open_in_memory().expect("in-memory db");
        conn.execute_batch(
            r#"
            CREATE TABLE fiber_splices (
                id TEXT PRIMARY KEY,
                enclosure_feature_id TEXT NOT NULL,
                from_strand_id TEXT NOT NULL,
                to_strand_id TEXT NOT NULL,
                from_direction TEXT NOT NULL DEFAULT 'start' CHECK (from_direction IN ('start', 'end')),
                to_direction TEXT NOT NULL DEFAULT 'start' CHECK (to_direction IN ('start', 'end')),
                loss_db REAL,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                CHECK(from_strand_id <> to_strand_id)
            );
            INSERT INTO fiber_splices (id, enclosure_feature_id, from_strand_id, to_strand_id, from_direction, to_direction, loss_db)
            VALUES ('splice-existing', 'enclosure-1', 'strand-1', 'strand-2', 'end', 'start', 0.05);
            "#,
        )
        .expect("legacy splice table with self check");

        apply_v2_schema(&conn).expect("schema migrated");
        assert!(!fiber_splices_has_legacy_self_check(&conn).expect("legacy check lookup"));
        conn.execute_batch("PRAGMA foreign_keys=OFF;")
            .expect("disable foreign keys for isolated check migration assertions");

        let existing_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM fiber_splices WHERE id = ?1",
                ["splice-existing"],
                |row| row.get(0),
            )
            .expect("existing splice count");
        assert_eq!(existing_count, 1);

        conn.execute(
            "INSERT INTO fiber_splices (id, enclosure_feature_id, from_strand_id, to_strand_id, from_direction, to_direction, loss_db)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params!["splice-same-strand", "enclosure-1", "strand-1", "strand-1", "start", "end", 0.05],
        )
        .expect("same strand with opposite directions insert after rebuild");
    }

    #[test]
    fn apply_schema_creates_odf_port_mapping_tables() {
        let conn = Connection::open_in_memory().expect("in-memory db");
        apply_v2_schema(&conn).expect("schema applied");

        let terminations_table: String = conn
            .query_row(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'fiber_port_terminations'",
                [],
                |row| row.get(0),
            )
            .expect("fiber_port_terminations table");
        assert_eq!(terminations_table, "fiber_port_terminations");

        let patches_table: String = conn
            .query_row(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'fiber_port_patches'",
                [],
                |row| row.get(0),
            )
            .expect("fiber_port_patches table");
        assert_eq!(patches_table, "fiber_port_patches");

        conn.execute_batch("PRAGMA foreign_keys=OFF;")
            .expect("disable foreign keys for isolated constraint assertions");
        conn.execute(
            "INSERT INTO fiber_port_terminations (id, port_id, strand_id, strand_direction, side)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params!["termination-1", "port-1", "strand-1", "start", "left"],
        )
        .expect("termination insert");

        let duplicate_port = conn.execute(
            "INSERT INTO fiber_port_terminations (id, port_id, strand_id, strand_direction, side)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params!["termination-2", "port-1", "strand-2", "start", "right"],
        );
        assert!(duplicate_port.is_err());

        let self_patch = conn.execute(
            "INSERT INTO fiber_port_patches (id, from_port_id, to_port_id)
             VALUES (?1, ?2, ?3)",
            params!["patch-1", "port-1", "port-1"],
        );
        assert!(self_patch.is_err());

        conn.execute(
            "INSERT INTO fiber_port_patches (id, from_port_id, to_port_id)
             VALUES (?1, ?2, ?3)",
            params!["patch-2", "port-1", "port-2"],
        )
        .expect("port patch insert");

        let reverse_duplicate = conn.execute(
            "INSERT INTO fiber_port_patches (id, from_port_id, to_port_id)
             VALUES (?1, ?2, ?3)",
            params!["patch-3", "port-2", "port-1"],
        );
        assert!(reverse_duplicate.is_err());
    }
}
