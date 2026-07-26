use rusqlite::{params, Connection, OptionalExtension};
use serde_json::Value;

pub const CURRENT_SCHEMA_VERSION: i32 = 9;
pub const CURRENT_SCHEMA_LABEL: &str = "9.0.0";

pub const BASE_SCHEMA_SQL: &str = r#"
    CREATE TABLE IF NOT EXISTS sys_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        label TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

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
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY(parent_id, project_id) REFERENCES regions(id, project_id) ON DELETE CASCADE,
        UNIQUE(id, project_id)
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
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY(region_id) REFERENCES regions(id) ON DELETE SET NULL,
        UNIQUE(id, project_id)
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
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY(layer_id, project_id) REFERENCES layers(id, project_id) ON DELETE CASCADE,
        FOREIGN KEY(parent_id, project_id) REFERENCES feature_groups(id, project_id) ON DELETE CASCADE,
        UNIQUE(id, project_id)
    );
    CREATE INDEX IF NOT EXISTS idx_feature_groups_project ON feature_groups (project_id);

    CREATE TABLE IF NOT EXISTS features (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        layer_id TEXT NOT NULL,
        group_id TEXT,
        name TEXT NOT NULL,
        geom_type TEXT NOT NULL,
        coordinates_json TEXT CHECK (
            coordinates_json IS NULL
            OR (json_valid(coordinates_json) AND json_type(coordinates_json) IN ('array', 'object'))
        ),
        properties_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(properties_json) AND json_type(properties_json) = 'object'),
        metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json) AND json_type(metadata_json) = 'object'),
        bbox_json TEXT CHECK (
            bbox_json IS NULL
            OR (json_valid(bbox_json) AND json_type(bbox_json) = 'array')
        ),
        bbox_min_x REAL,
        bbox_min_y REAL,
        bbox_max_x REAL,
        bbox_max_y REAL,
        is_visible INTEGER NOT NULL DEFAULT 1 CHECK (is_visible IN (0, 1)),
        note TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY(layer_id, project_id) REFERENCES layers(id, project_id) ON DELETE CASCADE,
        FOREIGN KEY(group_id) REFERENCES feature_groups(id) ON DELETE SET NULL,
        UNIQUE(id, project_id)
    );
    CREATE INDEX IF NOT EXISTS idx_features_project ON features (project_id);

    CREATE TABLE IF NOT EXISTS media_assets (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        sha256 TEXT NOT NULL,
        rel_path TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
        width INTEGER CHECK (width IS NULL OR width > 0),
        height INTEGER CHECK (height IS NULL OR height > 0),
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
    CREATE UNIQUE INDEX IF NOT EXISTS uq_feature_media_one_primary
        ON feature_media(feature_id) WHERE is_primary = 1;

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
        entity_version INTEGER NOT NULL DEFAULT 1 CHECK (entity_version >= 0),
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
        retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
        last_error TEXT,
        server_seq INTEGER,
        server_hash TEXT,
        server_time TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        acked_at TEXT,
        FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE CASCADE,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_sync_outbox_project_status ON sync_outbox (project_id, status, created_at);

    CREATE TABLE IF NOT EXISTS sync_cursor (
        project_id TEXT PRIMARY KEY,
        last_server_seq INTEGER NOT NULL DEFAULT 0,
        last_event_id TEXT,
        last_ledger_hash TEXT,
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
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
        PRIMARY KEY (project_id, entity_id),
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
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
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
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
    CREATE INDEX IF NOT EXISTS idx_file_tags_tag ON file_tags(tag_id);

    CREATE VIRTUAL TABLE IF NOT EXISTS fts_files_content USING fts5(
        file_id UNINDEXED, content, tokenize='unicode61'
    );

    CREATE TRIGGER IF NOT EXISTS fts_file_insert AFTER INSERT ON files BEGIN
        INSERT INTO fts_files_content(file_id, content)
        VALUES (new.id, COALESCE(new.filename, '') || ' ' || COALESCE(new.metadata_json, ''));
    END;
    CREATE TRIGGER IF NOT EXISTS fts_file_update AFTER UPDATE OF filename, metadata_json ON files BEGIN
        DELETE FROM fts_files_content WHERE file_id = old.id;
        INSERT INTO fts_files_content(file_id, content)
        VALUES (new.id, COALESCE(new.filename, '') || ' ' || COALESCE(new.metadata_json, ''));
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
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
        UNIQUE(id, project_id)
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
        FOREIGN KEY(conversation_id, project_id) REFERENCES ai_conversations(id, project_id) ON DELETE CASCADE,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation ON ai_messages(conversation_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_ai_messages_project ON ai_messages(project_id);

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
        FOREIGN KEY(conversation_id, project_id) REFERENCES ai_conversations(id, project_id) ON DELETE CASCADE,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_ai_actions_project ON ai_actions(project_id, status, created_at);
    CREATE INDEX IF NOT EXISTS idx_ai_actions_conversation ON ai_actions(conversation_id);

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
        fiber_count INTEGER CHECK (fiber_count IS NULL OR fiber_count >= 0),
        owner TEXT,
        status TEXT NOT NULL DEFAULT 'planned',
        source TEXT NOT NULL DEFAULT 'manual',
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY(feature_id, project_id) REFERENCES features(id, project_id) ON DELETE CASCADE,
        UNIQUE(id, project_id)
    );
    CREATE INDEX IF NOT EXISTS idx_fiber_cables_project ON fiber_cables (project_id);
    CREATE INDEX IF NOT EXISTS idx_fiber_cables_feature ON fiber_cables (feature_id);

    CREATE TABLE IF NOT EXISTS fiber_strands (
        id TEXT PRIMARY KEY,
        cable_id TEXT NOT NULL,
        strand_no INTEGER NOT NULL CHECK (strand_no > 0),
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
        sequence_no INTEGER NOT NULL DEFAULT 0 CHECK (sequence_no >= 0),
        vertex_index INTEGER,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY(cable_id, project_id) REFERENCES fiber_cables(id, project_id) ON DELETE CASCADE,
        FOREIGN KEY(feature_id, project_id) REFERENCES features(id, project_id) ON DELETE CASCADE,
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
        loss_db REAL CHECK (loss_db IS NULL OR loss_db >= 0),
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
        loss_db REAL CHECK (loss_db IS NULL OR loss_db >= 0),
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
        FOREIGN KEY(a_feature_id, project_id) REFERENCES features(id, project_id) ON DELETE CASCADE,
        FOREIGN KEY(z_feature_id, project_id) REFERENCES features(id, project_id) ON DELETE CASCADE,
        UNIQUE(project_id, name)
    );
    CREATE INDEX IF NOT EXISTS idx_fiber_circuits_project ON fiber_circuits (project_id);
    CREATE INDEX IF NOT EXISTS idx_fiber_circuits_a_feature ON fiber_circuits (a_feature_id);
    CREATE INDEX IF NOT EXISTS idx_fiber_circuits_z_feature ON fiber_circuits (z_feature_id);

    CREATE TABLE IF NOT EXISTS fiber_circuit_hops (
        circuit_id TEXT NOT NULL,
        sequence_no INTEGER NOT NULL CHECK (sequence_no >= 0),
        strand_id TEXT,
        port_id TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        PRIMARY KEY (circuit_id, sequence_no),
        FOREIGN KEY(circuit_id) REFERENCES fiber_circuits(id) ON DELETE CASCADE,
        FOREIGN KEY(strand_id) REFERENCES fiber_strands(id) ON DELETE SET NULL,
        FOREIGN KEY(port_id) REFERENCES fiber_ports(id) ON DELETE SET NULL,
        CHECK ((strand_id IS NOT NULL AND port_id IS NULL) OR (strand_id IS NULL AND port_id IS NOT NULL))
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
        FOREIGN KEY(feature_id, project_id) REFERENCES features(id, project_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_equipment_project ON equipment (project_id);
    CREATE INDEX IF NOT EXISTS idx_equipment_feature ON equipment (feature_id);

    UPDATE features
    SET metadata_json = json_set(
        COALESCE(NULLIF(metadata_json, ''), '{}'),
        '$.infrastructure.type',
        'SignalLine'
    )
    WHERE (
            LOWER(COALESCE(geom_type, '')) = 'networklink'
            OR (
                LOWER(COALESCE(geom_type, '')) LIKE '%line%'
                AND (
                    json_extract(metadata_json, '$.network.from_feature_id') IS NOT NULL
                    OR json_extract(metadata_json, '$.network.from_endpoint.id') IS NOT NULL
                    OR json_extract(metadata_json, '$.start_node_id') IS NOT NULL
                )
            )
          )
      AND LOWER(COALESCE(json_extract(metadata_json, '$.infrastructure.type'), '')) IN ('', 'signalline', 'networklink');

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
        NULLIF(json_extract(f.metadata_json, '$.infrastructure.cable_type'), ''),
        CAST(json_extract(f.metadata_json, '$.infrastructure.core_count') AS INTEGER),
        NULLIF(json_extract(f.metadata_json, '$.infrastructure.owner'), ''),
        CASE
            WHEN LOWER(COALESCE(NULLIF(json_extract(f.metadata_json, '$.infrastructure.status'), ''), 'planned')) IN ('planned', 'active', 'retired', 'damaged')
                THEN LOWER(COALESCE(NULLIF(json_extract(f.metadata_json, '$.infrastructure.status'), ''), 'planned'))
            ELSE 'planned'
        END,
        'legacy'
    FROM features f
    WHERE LOWER(COALESCE(f.geom_type, '')) = 'networklink'
       OR LOWER(COALESCE(json_extract(f.metadata_json, '$.infrastructure.type'), json_extract(f.metadata_json, '$.type'), '')) IN ('signalline', 'networklink')
       OR (
            LOWER(COALESCE(f.geom_type, '')) LIKE '%line%'
            AND (
                json_extract(f.metadata_json, '$.network.from_feature_id') IS NOT NULL
                OR json_extract(f.metadata_json, '$.network.from_endpoint.id') IS NOT NULL
                OR json_extract(f.metadata_json, '$.start_node_id') IS NOT NULL
            )
       );
"#;

const V9_MIGRATION_SQL: &str = r#"
    CREATE INDEX IF NOT EXISTS idx_ai_actions_conversation ON ai_actions(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_ai_messages_project ON ai_messages(project_id);
    CREATE INDEX IF NOT EXISTS idx_file_tags_tag ON file_tags(tag_id);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_feature_media_one_primary
        ON feature_media(feature_id) WHERE is_primary = 1;

    DROP TRIGGER IF EXISTS fts_file_insert;
    DROP TRIGGER IF EXISTS fts_file_update;
    DROP TRIGGER IF EXISTS fts_file_delete;
    CREATE TRIGGER fts_file_insert AFTER INSERT ON files BEGIN
        INSERT INTO fts_files_content(file_id, content)
        VALUES (NEW.id, COALESCE(NEW.filename, '') || ' ' || COALESCE(NEW.metadata_json, ''));
    END;
    CREATE TRIGGER fts_file_update AFTER UPDATE OF filename, metadata_json ON files BEGIN
        DELETE FROM fts_files_content WHERE file_id = OLD.id;
        INSERT INTO fts_files_content(file_id, content)
        VALUES (NEW.id, COALESCE(NEW.filename, '') || ' ' || COALESCE(NEW.metadata_json, ''));
    END;
    CREATE TRIGGER fts_file_delete AFTER DELETE ON files BEGIN
        DELETE FROM fts_files_content WHERE file_id = OLD.id;
    END;
    DELETE FROM fts_files_content;
    INSERT INTO fts_files_content(file_id, content)
        SELECT id, COALESCE(filename, '') || ' ' || COALESCE(metadata_json, '') FROM files;

    CREATE TRIGGER IF NOT EXISTS trg_regions_parent_project_insert
    BEFORE INSERT ON regions
    WHEN NEW.parent_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM regions parent WHERE parent.id=NEW.parent_id AND parent.project_id=NEW.project_id
    ) BEGIN SELECT RAISE(ABORT, 'region parent must belong to the same project'); END;
    CREATE TRIGGER IF NOT EXISTS trg_regions_parent_project_update
    BEFORE UPDATE OF parent_id, project_id ON regions
    WHEN NEW.parent_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM regions parent WHERE parent.id=NEW.parent_id AND parent.project_id=NEW.project_id
    ) BEGIN SELECT RAISE(ABORT, 'region parent must belong to the same project'); END;

    CREATE TRIGGER IF NOT EXISTS trg_layers_region_project_insert
    BEFORE INSERT ON layers
    WHEN NEW.region_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM regions parent WHERE parent.id=NEW.region_id AND parent.project_id=NEW.project_id
    ) BEGIN SELECT RAISE(ABORT, 'layer region must belong to the same project'); END;
    CREATE TRIGGER IF NOT EXISTS trg_layers_region_project_update
    BEFORE UPDATE OF region_id, project_id ON layers
    WHEN NEW.region_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM regions parent WHERE parent.id=NEW.region_id AND parent.project_id=NEW.project_id
    ) BEGIN SELECT RAISE(ABORT, 'layer region must belong to the same project'); END;
    CREATE TRIGGER IF NOT EXISTS trg_regions_cleanup_delete
    BEFORE DELETE ON regions
    BEGIN
        UPDATE layers SET region_id=NULL
        WHERE region_id IN (
            WITH RECURSIVE descendants(id) AS (
                SELECT OLD.id
                UNION ALL
                SELECT child.id FROM regions child JOIN descendants parent ON child.parent_id=parent.id
            )
            SELECT id FROM descendants
        );
        DELETE FROM regions
        WHERE id IN (
            WITH RECURSIVE descendants(id) AS (
                SELECT child.id FROM regions child WHERE child.parent_id=OLD.id
                UNION ALL
                SELECT child.id FROM regions child JOIN descendants parent ON child.parent_id=parent.id
            )
            SELECT id FROM descendants
        );
    END;

    CREATE TRIGGER IF NOT EXISTS trg_feature_groups_project_insert
    BEFORE INSERT ON feature_groups
    WHEN NOT EXISTS (
        SELECT 1 FROM layers parent WHERE parent.id=NEW.layer_id AND parent.project_id=NEW.project_id
    ) OR (NEW.parent_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM feature_groups parent WHERE parent.id=NEW.parent_id AND parent.project_id=NEW.project_id
    )) BEGIN SELECT RAISE(ABORT, 'feature group relations must belong to the same project'); END;
    CREATE TRIGGER IF NOT EXISTS trg_feature_groups_project_update
    BEFORE UPDATE OF layer_id, parent_id, project_id ON feature_groups
    WHEN NOT EXISTS (
        SELECT 1 FROM layers parent WHERE parent.id=NEW.layer_id AND parent.project_id=NEW.project_id
    ) OR (NEW.parent_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM feature_groups parent WHERE parent.id=NEW.parent_id AND parent.project_id=NEW.project_id
    )) BEGIN SELECT RAISE(ABORT, 'feature group relations must belong to the same project'); END;

    CREATE TRIGGER IF NOT EXISTS trg_features_project_insert
    BEFORE INSERT ON features
    WHEN NOT EXISTS (
        SELECT 1 FROM layers parent WHERE parent.id=NEW.layer_id AND parent.project_id=NEW.project_id
    ) OR (NEW.group_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM feature_groups parent WHERE parent.id=NEW.group_id AND parent.project_id=NEW.project_id
    )) BEGIN SELECT RAISE(ABORT, 'feature relations must belong to the same project'); END;
    CREATE TRIGGER IF NOT EXISTS trg_features_project_update
    BEFORE UPDATE OF layer_id, group_id, project_id ON features
    WHEN NOT EXISTS (
        SELECT 1 FROM layers parent WHERE parent.id=NEW.layer_id AND parent.project_id=NEW.project_id
    ) OR (NEW.group_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM feature_groups parent WHERE parent.id=NEW.group_id AND parent.project_id=NEW.project_id
    )) BEGIN SELECT RAISE(ABORT, 'feature relations must belong to the same project'); END;
    CREATE TRIGGER IF NOT EXISTS trg_feature_groups_cleanup_delete
    BEFORE DELETE ON feature_groups
    BEGIN
        UPDATE features SET group_id=NULL
        WHERE group_id IN (
            WITH RECURSIVE descendants(id) AS (
                SELECT OLD.id
                UNION ALL
                SELECT child.id FROM feature_groups child JOIN descendants parent ON child.parent_id=parent.id
            )
            SELECT id FROM descendants
        );
        DELETE FROM feature_groups
        WHERE id IN (
            WITH RECURSIVE descendants(id) AS (
                SELECT child.id FROM feature_groups child WHERE child.parent_id=OLD.id
                UNION ALL
                SELECT child.id FROM feature_groups child JOIN descendants parent ON child.parent_id=parent.id
            )
            SELECT id FROM descendants
        );
    END;

    CREATE TRIGGER IF NOT EXISTS trg_fiber_cables_project_insert
    BEFORE INSERT ON fiber_cables
    WHEN NOT EXISTS (
        SELECT 1 FROM features parent WHERE parent.id=NEW.feature_id AND parent.project_id=NEW.project_id
    ) BEGIN SELECT RAISE(ABORT, 'fiber cable feature must belong to the same project'); END;
    CREATE TRIGGER IF NOT EXISTS trg_fiber_cables_project_update
    BEFORE UPDATE OF feature_id, project_id ON fiber_cables
    WHEN NOT EXISTS (
        SELECT 1 FROM features parent WHERE parent.id=NEW.feature_id AND parent.project_id=NEW.project_id
    ) BEGIN SELECT RAISE(ABORT, 'fiber cable feature must belong to the same project'); END;

    CREATE TRIGGER IF NOT EXISTS trg_fiber_cable_points_project_insert
    BEFORE INSERT ON fiber_cable_points
    WHEN NOT EXISTS (
        SELECT 1 FROM fiber_cables cable
        JOIN features feature ON feature.id=NEW.feature_id
        WHERE cable.id=NEW.cable_id AND cable.project_id=NEW.project_id
          AND feature.project_id=NEW.project_id
    ) BEGIN SELECT RAISE(ABORT, 'fiber cable point relations must belong to the same project'); END;
    CREATE TRIGGER IF NOT EXISTS trg_fiber_cable_points_project_update
    BEFORE UPDATE OF cable_id, feature_id, project_id ON fiber_cable_points
    WHEN NOT EXISTS (
        SELECT 1 FROM fiber_cables cable
        JOIN features feature ON feature.id=NEW.feature_id
        WHERE cable.id=NEW.cable_id AND cable.project_id=NEW.project_id
          AND feature.project_id=NEW.project_id
    ) BEGIN SELECT RAISE(ABORT, 'fiber cable point relations must belong to the same project'); END;

    CREATE TRIGGER IF NOT EXISTS trg_equipment_project_insert
    BEFORE INSERT ON equipment
    WHEN NOT EXISTS (
        SELECT 1 FROM features parent WHERE parent.id=NEW.feature_id AND parent.project_id=NEW.project_id
    ) BEGIN SELECT RAISE(ABORT, 'equipment feature must belong to the same project'); END;
    CREATE TRIGGER IF NOT EXISTS trg_equipment_project_update
    BEFORE UPDATE OF feature_id, project_id ON equipment
    WHEN NOT EXISTS (
        SELECT 1 FROM features parent WHERE parent.id=NEW.feature_id AND parent.project_id=NEW.project_id
    ) BEGIN SELECT RAISE(ABORT, 'equipment feature must belong to the same project'); END;

    CREATE TRIGGER IF NOT EXISTS trg_fiber_circuits_project_insert
    BEFORE INSERT ON fiber_circuits
    WHEN NOT EXISTS (
        SELECT 1 FROM features a JOIN features z ON z.id=NEW.z_feature_id
        WHERE a.id=NEW.a_feature_id AND a.project_id=NEW.project_id AND z.project_id=NEW.project_id
    ) BEGIN SELECT RAISE(ABORT, 'fiber circuit endpoints must belong to the same project'); END;
    CREATE TRIGGER IF NOT EXISTS trg_fiber_circuits_project_update
    BEFORE UPDATE OF a_feature_id, z_feature_id, project_id ON fiber_circuits
    WHEN NOT EXISTS (
        SELECT 1 FROM features a JOIN features z ON z.id=NEW.z_feature_id
        WHERE a.id=NEW.a_feature_id AND a.project_id=NEW.project_id AND z.project_id=NEW.project_id
    ) BEGIN SELECT RAISE(ABORT, 'fiber circuit endpoints must belong to the same project'); END;

    CREATE TRIGGER IF NOT EXISTS trg_ai_messages_project_insert
    BEFORE INSERT ON ai_messages
    WHEN NOT EXISTS (
        SELECT 1 FROM ai_conversations parent
        WHERE parent.id=NEW.conversation_id AND parent.project_id=NEW.project_id
    ) BEGIN SELECT RAISE(ABORT, 'AI message conversation must belong to the same project'); END;
    CREATE TRIGGER IF NOT EXISTS trg_ai_messages_project_update
    BEFORE UPDATE OF conversation_id, project_id ON ai_messages
    WHEN NOT EXISTS (
        SELECT 1 FROM ai_conversations parent
        WHERE parent.id=NEW.conversation_id AND parent.project_id=NEW.project_id
    ) BEGIN SELECT RAISE(ABORT, 'AI message conversation must belong to the same project'); END;
    CREATE TRIGGER IF NOT EXISTS trg_ai_actions_project_insert
    BEFORE INSERT ON ai_actions
    WHEN NOT EXISTS (
        SELECT 1 FROM ai_conversations parent
        WHERE parent.id=NEW.conversation_id AND parent.project_id=NEW.project_id
    ) BEGIN SELECT RAISE(ABORT, 'AI action conversation must belong to the same project'); END;
    CREATE TRIGGER IF NOT EXISTS trg_ai_actions_project_update
    BEFORE UPDATE OF conversation_id, project_id ON ai_actions
    WHEN NOT EXISTS (
        SELECT 1 FROM ai_conversations parent
        WHERE parent.id=NEW.conversation_id AND parent.project_id=NEW.project_id
    ) BEGIN SELECT RAISE(ABORT, 'AI action conversation must belong to the same project'); END;

    CREATE TRIGGER IF NOT EXISTS trg_sync_outbox_relation_insert
    BEFORE INSERT ON sync_outbox
    WHEN NOT EXISTS (SELECT 1 FROM projects WHERE id=NEW.project_id)
      OR NOT EXISTS (SELECT 1 FROM events WHERE id=NEW.event_id AND project_id=NEW.project_id)
    BEGIN SELECT RAISE(ABORT, 'sync outbox event must belong to the same project'); END;
    CREATE TRIGGER IF NOT EXISTS trg_sync_outbox_relation_update
    BEFORE UPDATE OF event_id, project_id ON sync_outbox
    WHEN NOT EXISTS (SELECT 1 FROM projects WHERE id=NEW.project_id)
      OR NOT EXISTS (SELECT 1 FROM events WHERE id=NEW.event_id AND project_id=NEW.project_id)
    BEGIN SELECT RAISE(ABORT, 'sync outbox event must belong to the same project'); END;
    CREATE TRIGGER IF NOT EXISTS trg_sync_cursor_project_insert
    BEFORE INSERT ON sync_cursor
    WHEN NOT EXISTS (SELECT 1 FROM projects WHERE id=NEW.project_id)
    BEGIN SELECT RAISE(ABORT, 'sync cursor project does not exist'); END;
    CREATE TRIGGER IF NOT EXISTS trg_sync_cursor_project_update
    BEFORE UPDATE OF project_id ON sync_cursor
    WHEN NOT EXISTS (SELECT 1 FROM projects WHERE id=NEW.project_id)
    BEGIN SELECT RAISE(ABORT, 'sync cursor project does not exist'); END;
    CREATE TRIGGER IF NOT EXISTS trg_cached_leases_project_insert
    BEFORE INSERT ON cached_leases
    WHEN NOT EXISTS (SELECT 1 FROM projects WHERE id=NEW.project_id)
    BEGIN SELECT RAISE(ABORT, 'cached lease project does not exist'); END;
    CREATE TRIGGER IF NOT EXISTS trg_cached_leases_project_update
    BEFORE UPDATE OF project_id ON cached_leases
    WHEN NOT EXISTS (SELECT 1 FROM projects WHERE id=NEW.project_id)
    BEGIN SELECT RAISE(ABORT, 'cached lease project does not exist'); END;
    CREATE TRIGGER IF NOT EXISTS trg_sync_conflicts_project_insert
    BEFORE INSERT ON sync_conflicts
    WHEN NOT EXISTS (SELECT 1 FROM projects WHERE id=NEW.project_id)
    BEGIN SELECT RAISE(ABORT, 'sync conflict project does not exist'); END;
    CREATE TRIGGER IF NOT EXISTS trg_sync_conflicts_project_update
    BEFORE UPDATE OF project_id ON sync_conflicts
    WHEN NOT EXISTS (SELECT 1 FROM projects WHERE id=NEW.project_id)
    BEGIN SELECT RAISE(ABORT, 'sync conflict project does not exist'); END;

    CREATE TRIGGER IF NOT EXISTS trg_fiber_hops_exactly_one_insert
    BEFORE INSERT ON fiber_circuit_hops
    WHEN (NEW.strand_id IS NULL) = (NEW.port_id IS NULL)
    BEGIN SELECT RAISE(ABORT, 'fiber circuit hop must reference exactly one strand or port'); END;
    CREATE TRIGGER IF NOT EXISTS trg_fiber_hops_exactly_one_update
    BEFORE UPDATE OF strand_id, port_id ON fiber_circuit_hops
    WHEN (NEW.strand_id IS NULL) = (NEW.port_id IS NULL)
    BEGIN SELECT RAISE(ABORT, 'fiber circuit hop must reference exactly one strand or port'); END;

    CREATE TRIGGER IF NOT EXISTS trg_fiber_splices_endpoint_insert
    BEFORE INSERT ON fiber_splices
    WHEN EXISTS (
        SELECT 1 FROM fiber_splices existing
        WHERE (existing.from_strand_id=NEW.from_strand_id AND existing.from_direction=NEW.from_direction)
           OR (existing.to_strand_id=NEW.from_strand_id AND existing.to_direction=NEW.from_direction)
           OR (existing.from_strand_id=NEW.to_strand_id AND existing.from_direction=NEW.to_direction)
           OR (existing.to_strand_id=NEW.to_strand_id AND existing.to_direction=NEW.to_direction)
    ) BEGIN SELECT RAISE(ABORT, 'fiber strand endpoint is already spliced'); END;
    CREATE TRIGGER IF NOT EXISTS trg_fiber_splices_endpoint_update
    BEFORE UPDATE OF from_strand_id, from_direction, to_strand_id, to_direction ON fiber_splices
    WHEN EXISTS (
        SELECT 1 FROM fiber_splices existing WHERE existing.id<>NEW.id AND (
            (existing.from_strand_id=NEW.from_strand_id AND existing.from_direction=NEW.from_direction)
         OR (existing.to_strand_id=NEW.from_strand_id AND existing.to_direction=NEW.from_direction)
         OR (existing.from_strand_id=NEW.to_strand_id AND existing.from_direction=NEW.to_direction)
         OR (existing.to_strand_id=NEW.to_strand_id AND existing.to_direction=NEW.to_direction)
        )
    ) BEGIN SELECT RAISE(ABORT, 'fiber strand endpoint is already spliced'); END;

    CREATE TRIGGER IF NOT EXISTS trg_fiber_port_patch_endpoint_insert
    BEFORE INSERT ON fiber_port_patches
    WHEN EXISTS (
        SELECT 1 FROM fiber_port_patches existing
        WHERE existing.from_port_id IN (NEW.from_port_id, NEW.to_port_id)
           OR existing.to_port_id IN (NEW.from_port_id, NEW.to_port_id)
    ) BEGIN SELECT RAISE(ABORT, 'fiber port is already patched'); END;
    CREATE TRIGGER IF NOT EXISTS trg_fiber_port_patch_endpoint_update
    BEFORE UPDATE OF from_port_id, to_port_id ON fiber_port_patches
    WHEN EXISTS (
        SELECT 1 FROM fiber_port_patches existing WHERE existing.id<>NEW.id AND (
            existing.from_port_id IN (NEW.from_port_id, NEW.to_port_id)
         OR existing.to_port_id IN (NEW.from_port_id, NEW.to_port_id)
        )
    ) BEGIN SELECT RAISE(ABORT, 'fiber port is already patched'); END;
"#;

pub fn apply_base_schema(conn: &Connection) -> Result<(), rusqlite::Error> {
    ensure_legacy_composite_parent_keys(conn)?;
    conn.execute_batch(BASE_SCHEMA_SQL)?;
    ensure_v8_compatibility(conn)
}

pub fn apply_v2_schema(conn: &Connection) -> Result<(), rusqlite::Error> {
    apply_base_schema(conn)?;
    apply_v9_schema(conn)?;
    stamp_schema_version(conn)
}

pub fn apply_v9_schema(conn: &Connection) -> Result<(), rusqlite::Error> {
    normalize_legacy_v9_data(conn)?;
    conn.execute_batch(V9_MIGRATION_SQL)?;
    normalize_timestamps(conn)?;
    ensure_feature_spatial_columns(conn)?;
    create_updated_at_triggers(conn)?;
    create_json_validation_triggers(conn)?;
    create_numeric_validation_triggers(conn)?;
    create_timestamp_validation_triggers(conn)?;
    ensure_feature_spatial_index(conn)
}

fn ensure_feature_spatial_columns(conn: &Connection) -> Result<(), rusqlite::Error> {
    if !table_exists(conn, "features")? {
        return Ok(());
    }
    for (column, ty) in [
        ("bbox_min_x", "REAL"),
        ("bbox_min_y", "REAL"),
        ("bbox_max_x", "REAL"),
        ("bbox_max_y", "REAL"),
    ] {
        if !column_exists(conn, "features", column)? {
            conn.execute(
                &format!("ALTER TABLE features ADD COLUMN {column} {ty}"),
                [],
            )?;
        }
    }
    backfill_feature_bbox_columns(conn)
}

fn ensure_feature_spatial_index(conn: &Connection) -> Result<(), rusqlite::Error> {
    if !table_exists(conn, "features")? {
        return Ok(());
    }
    conn.execute_batch(
        r#"
        CREATE INDEX IF NOT EXISTS idx_features_project_bbox
            ON features(project_id, bbox_min_x, bbox_max_x, bbox_min_y, bbox_max_y);

        CREATE VIRTUAL TABLE IF NOT EXISTS feature_rtree
            USING rtree(rowid, min_x, max_x, min_y, max_y);

        INSERT OR REPLACE INTO feature_rtree(rowid, min_x, max_x, min_y, max_y)
        SELECT rowid, bbox_min_x, bbox_max_x, bbox_min_y, bbox_max_y
        FROM features
        WHERE bbox_min_x IS NOT NULL
          AND bbox_min_y IS NOT NULL
          AND bbox_max_x IS NOT NULL
          AND bbox_max_y IS NOT NULL;

        DELETE FROM feature_rtree
        WHERE rowid NOT IN (
            SELECT rowid FROM features
            WHERE bbox_min_x IS NOT NULL
              AND bbox_min_y IS NOT NULL
              AND bbox_max_x IS NOT NULL
              AND bbox_max_y IS NOT NULL
        );

        CREATE TRIGGER IF NOT EXISTS trg_feature_rtree_insert
        AFTER INSERT ON features
        WHEN NEW.bbox_min_x IS NOT NULL AND NEW.bbox_min_y IS NOT NULL
         AND NEW.bbox_max_x IS NOT NULL AND NEW.bbox_max_y IS NOT NULL
        BEGIN
            INSERT OR REPLACE INTO feature_rtree(rowid, min_x, max_x, min_y, max_y)
            VALUES (NEW.rowid, NEW.bbox_min_x, NEW.bbox_max_x, NEW.bbox_min_y, NEW.bbox_max_y);
        END;

        CREATE TRIGGER IF NOT EXISTS trg_feature_rtree_update
        AFTER UPDATE OF bbox_min_x, bbox_min_y, bbox_max_x, bbox_max_y ON features
        BEGIN
            DELETE FROM feature_rtree WHERE rowid = NEW.rowid;
            INSERT OR REPLACE INTO feature_rtree(rowid, min_x, max_x, min_y, max_y)
            SELECT NEW.rowid, NEW.bbox_min_x, NEW.bbox_max_x, NEW.bbox_min_y, NEW.bbox_max_y
            WHERE NEW.bbox_min_x IS NOT NULL AND NEW.bbox_min_y IS NOT NULL
              AND NEW.bbox_max_x IS NOT NULL AND NEW.bbox_max_y IS NOT NULL;
        END;

        CREATE TRIGGER IF NOT EXISTS trg_feature_rtree_delete
        AFTER DELETE ON features
        BEGIN
            DELETE FROM feature_rtree WHERE rowid = OLD.rowid;
        END;
        "#,
    )
}

fn backfill_feature_bbox_columns(conn: &Connection) -> Result<(), rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, coordinates_json, bbox_json
         FROM features
         WHERE bbox_min_x IS NULL
            OR bbox_min_y IS NULL
            OR bbox_max_x IS NULL
            OR bbox_max_y IS NULL",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, Option<String>>(1)?,
            row.get::<_, Option<String>>(2)?,
        ))
    })?;
    let mut updates = Vec::new();
    for row in rows {
        let (id, coordinates_json, bbox_json) = row?;
        let bbox = bbox_json
            .as_deref()
            .and_then(parse_bbox_array)
            .or_else(|| coordinates_json.as_deref().and_then(parse_coordinate_bbox));
        if let Some((min_x, min_y, max_x, max_y)) = bbox {
            updates.push((id, min_x, min_y, max_x, max_y));
        }
    }
    drop(stmt);

    for (id, min_x, min_y, max_x, max_y) in updates {
        conn.execute(
            "UPDATE features
             SET bbox_min_x = ?2, bbox_min_y = ?3, bbox_max_x = ?4, bbox_max_y = ?5,
                 bbox_json = COALESCE(bbox_json, json_array(?2, ?3, ?4, ?5))
             WHERE id = ?1",
            params![id, min_x, min_y, max_x, max_y],
        )?;
    }
    Ok(())
}

fn parse_bbox_array(text: &str) -> Option<(f64, f64, f64, f64)> {
    let value: Value = serde_json::from_str(text).ok()?;
    let arr = value.as_array()?;
    if arr.len() != 4 {
        return None;
    }
    let min_x = arr[0].as_f64()?;
    let min_y = arr[1].as_f64()?;
    let max_x = arr[2].as_f64()?;
    let max_y = arr[3].as_f64()?;
    Some((
        min_x.min(max_x),
        min_y.min(max_y),
        min_x.max(max_x),
        min_y.max(max_y),
    ))
}

fn parse_coordinate_bbox(text: &str) -> Option<(f64, f64, f64, f64)> {
    let value: Value = serde_json::from_str(text).ok()?;
    let mut bbox: Option<(f64, f64, f64, f64)> = None;
    collect_coordinate_bbox(&value, &mut bbox);
    bbox
}

fn collect_coordinate_bbox(value: &Value, bbox: &mut Option<(f64, f64, f64, f64)>) {
    let Some(arr) = value.as_array() else {
        return;
    };
    if arr.len() >= 2 && arr[0].is_number() && arr[1].is_number() {
        if let (Some(x), Some(y)) = (arr[0].as_f64(), arr[1].as_f64()) {
            *bbox = Some(match *bbox {
                Some((min_x, min_y, max_x, max_y)) => {
                    (min_x.min(x), min_y.min(y), max_x.max(x), max_y.max(y))
                }
                None => (x, y, x, y),
            });
        }
        return;
    }
    for child in arr {
        collect_coordinate_bbox(child, bbox);
    }
}

fn ensure_legacy_composite_parent_keys(conn: &Connection) -> Result<(), rusqlite::Error> {
    for (table, index) in [
        ("regions", "idx_regions_id_project_v9_parent"),
        ("layers", "idx_layers_id_project_v9_parent"),
        ("feature_groups", "idx_feature_groups_id_project_v9_parent"),
        ("features", "idx_features_id_project_v9_parent"),
        (
            "ai_conversations",
            "idx_ai_conversations_id_project_v9_parent",
        ),
        ("fiber_cables", "idx_fiber_cables_id_project_v9_parent"),
    ] {
        if column_exists(conn, table, "id")? && column_exists(conn, table, "project_id")? {
            conn.execute(
                &format!("CREATE UNIQUE INDEX IF NOT EXISTS {index} ON {table}(id, project_id)"),
                [],
            )?;
        }
    }
    Ok(())
}

pub fn normalize_legacy_v9_data(conn: &Connection) -> Result<(), rusqlite::Error> {
    if column_exists(conn, "features", "coordinates_json")? {
        conn.execute_batch(
            r#"
            UPDATE features
            SET coordinates_json = NULL
            WHERE coordinates_json IS NOT NULL
              AND json_valid(coordinates_json)
              AND json_type(coordinates_json) = 'null';

            UPDATE features
            SET coordinates_json = json(json_extract(coordinates_json, '$'))
            WHERE coordinates_json IS NOT NULL
              AND json_valid(coordinates_json)
              AND json_type(coordinates_json) = 'text'
              AND json_valid(json_extract(coordinates_json, '$'))
              AND json_type(json_extract(coordinates_json, '$')) IN ('array', 'object');
            "#,
        )?;
    }
    if column_exists(conn, "features", "bbox_json")? {
        conn.execute_batch(
            r#"
            UPDATE features
            SET bbox_json = NULL
            WHERE bbox_json IS NOT NULL
              AND json_valid(bbox_json)
              AND json_type(bbox_json) = 'null';

            UPDATE features
            SET bbox_json = json(json_extract(bbox_json, '$'))
            WHERE bbox_json IS NOT NULL
              AND json_valid(bbox_json)
              AND json_type(bbox_json) = 'text'
              AND json_valid(json_extract(bbox_json, '$'))
              AND json_type(json_extract(bbox_json, '$')) = 'array';
            "#,
        )?;
    }

    Ok(())
}

pub fn stamp_schema_version(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute(
        "INSERT OR REPLACE INTO schema_migrations(version, label) VALUES (?1, ?2)",
        (CURRENT_SCHEMA_VERSION, CURRENT_SCHEMA_LABEL),
    )?;
    conn.execute(
        "INSERT INTO sys_config(key, value) VALUES('schema_version', ?1)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
        [CURRENT_SCHEMA_LABEL],
    )?;
    conn.pragma_update(None, "user_version", CURRENT_SCHEMA_VERSION)
}

fn normalize_timestamps(conn: &Connection) -> Result<(), rusqlite::Error> {
    for (table, columns) in [
        ("projects", &["created_at", "updated_at"][..]),
        ("files", &["created_at", "updated_at"][..]),
        ("regions", &["created_at", "updated_at"][..]),
        ("layers", &["created_at", "updated_at"][..]),
        ("feature_groups", &["created_at", "updated_at"][..]),
        ("features", &["created_at", "updated_at"][..]),
        ("project_settings", &["created_at", "updated_at"][..]),
        ("project_snapshots", &["created_at", "updated_at"][..]),
        ("events", &["created_at"][..]),
        ("sync_outbox", &["created_at", "updated_at"][..]),
        ("sync_conflicts", &["created_at", "updated_at"][..]),
        ("ai_conversations", &["created_at", "updated_at"][..]),
        ("ai_embeddings", &["created_at", "updated_at"][..]),
        ("fiber_cables", &["created_at", "updated_at"][..]),
        ("fiber_strands", &["created_at", "updated_at"][..]),
        ("fiber_cable_points", &["created_at", "updated_at"][..]),
        ("fiber_ports", &["created_at", "updated_at"][..]),
        ("fiber_port_terminations", &["created_at", "updated_at"][..]),
        ("fiber_port_patches", &["created_at", "updated_at"][..]),
        ("fiber_splices", &["created_at", "updated_at"][..]),
        ("fiber_circuits", &["created_at", "updated_at"][..]),
        ("fiber_circuit_hops", &["created_at", "updated_at"][..]),
        ("equipment", &["created_at", "updated_at"][..]),
    ] {
        for column in columns {
            conn.execute(
                &format!(
                    "UPDATE {table} SET {column}=strftime('%Y-%m-%dT%H:%M:%fZ', {column})
                     WHERE {column} IS NOT NULL AND {column} NOT GLOB '????-??-??T??:??:??.???Z'"
                ),
                [],
            )?;
        }
    }
    Ok(())
}

fn create_updated_at_triggers(conn: &Connection) -> Result<(), rusqlite::Error> {
    for table in [
        "projects",
        "files",
        "regions",
        "layers",
        "feature_groups",
        "features",
        "project_settings",
        "project_snapshots",
        "sync_outbox",
        "sync_conflicts",
        "ai_conversations",
        "ai_embeddings",
        "fiber_cables",
        "fiber_strands",
        "fiber_cable_points",
        "fiber_ports",
        "fiber_port_terminations",
        "fiber_port_patches",
        "fiber_splices",
        "fiber_circuits",
        "fiber_circuit_hops",
        "equipment",
    ] {
        conn.execute_batch(&format!(
            "CREATE TRIGGER IF NOT EXISTS trg_{table}_updated_at
             AFTER UPDATE ON {table}
             WHEN NEW.updated_at = OLD.updated_at
               OR NEW.updated_at NOT GLOB '????-??-??T??:??:??.???Z'
             BEGIN
                 UPDATE {table} SET updated_at=strftime(
                     '%Y-%m-%dT%H:%M:%fZ',
                     CASE WHEN NEW.updated_at = OLD.updated_at THEN 'now' ELSE NEW.updated_at END
                 )
                 WHERE rowid=NEW.rowid;
             END;"
        ))?;
    }
    Ok(())
}

fn create_json_validation_triggers(conn: &Connection) -> Result<(), rusqlite::Error> {
    for (table, column, expected_type, nullable) in [
        ("projects", "metadata_json", "object", false),
        ("files", "metadata_json", "object", false),
        ("regions", "metadata_json", "object", false),
        ("layers", "metadata_json", "object", false),
        ("feature_groups", "metadata_json", "object", false),
        ("features", "coordinates_json", "", true),
        ("features", "properties_json", "object", false),
        ("features", "metadata_json", "object", false),
        ("features", "bbox_json", "array", true),
        ("project_settings", "settings_json", "object", false),
        ("project_snapshots", "state_json", "object", false),
        ("events", "payload_json", "", false),
        ("events", "metadata_json", "object", false),
        ("sync_outbox", "request_json", "", false),
        ("sync_outbox", "payload_json", "", false),
        ("sync_conflicts", "local_event_json", "", false),
        ("sync_conflicts", "server_event_json", "", false),
        ("ai_messages", "token_usage_json", "object", false),
        ("ai_messages", "citations_json", "array", false),
        ("ai_actions", "proposal_json", "object", false),
        ("ai_embeddings", "embedding_json", "array", false),
    ] {
        let invalid_json = if table == "features" && column == "coordinates_json" {
            format!(
                "(NOT json_valid(NEW.{column}) OR json_type(NEW.{column}) NOT IN ('array', 'object'))"
            )
        } else if expected_type.is_empty() {
            format!("NOT json_valid(NEW.{column})")
        } else {
            format!(
                "(NOT json_valid(NEW.{column}) OR json_type(NEW.{column}) <> '{expected_type}')"
            )
        };
        let predicate = if nullable {
            format!("NEW.{column} IS NOT NULL AND {invalid_json}")
        } else {
            format!("NEW.{column} IS NULL OR {invalid_json}")
        };
        conn.execute_batch(&format!(
            "CREATE TRIGGER IF NOT EXISTS trg_{table}_{column}_json_insert
             BEFORE INSERT ON {table} WHEN {predicate}
             BEGIN SELECT RAISE(ABORT, '{table}.{column} contains invalid JSON'); END;
             CREATE TRIGGER IF NOT EXISTS trg_{table}_{column}_json_update
             BEFORE UPDATE OF {column} ON {table} WHEN {predicate}
             BEGIN SELECT RAISE(ABORT, '{table}.{column} contains invalid JSON'); END;"
        ))?;
    }
    Ok(())
}

fn create_numeric_validation_triggers(conn: &Connection) -> Result<(), rusqlite::Error> {
    for (table, predicate) in [
        (
            "media_assets",
            "NEW.byte_size < 0 OR NEW.width <= 0 OR NEW.height <= 0",
        ),
        ("events", "NEW.entity_version < 0"),
        (
            "sync_outbox",
            "NEW.retry_count < 0 OR NEW.base_entity_version < 0",
        ),
        ("cached_leases", "NEW.entity_version < 0"),
        ("fiber_cables", "NEW.fiber_count < 0"),
        ("fiber_strands", "NEW.strand_no <= 0"),
        ("fiber_cable_points", "NEW.sequence_no < 0"),
        ("fiber_port_patches", "NEW.loss_db < 0"),
        ("fiber_splices", "NEW.loss_db < 0"),
        ("fiber_circuit_hops", "NEW.sequence_no < 0"),
    ] {
        conn.execute_batch(&format!(
            "CREATE TRIGGER IF NOT EXISTS trg_{table}_numeric_insert
             BEFORE INSERT ON {table} WHEN {predicate}
             BEGIN SELECT RAISE(ABORT, '{table} contains an invalid numeric value'); END;
             CREATE TRIGGER IF NOT EXISTS trg_{table}_numeric_update
             BEFORE UPDATE ON {table} WHEN {predicate}
             BEGIN SELECT RAISE(ABORT, '{table} contains an invalid numeric value'); END;"
        ))?;
    }
    Ok(())
}

fn create_timestamp_validation_triggers(conn: &Connection) -> Result<(), rusqlite::Error> {
    for (table, columns) in [
        ("projects", &["created_at", "updated_at"][..]),
        ("files", &["created_at", "updated_at"][..]),
        ("regions", &["created_at", "updated_at"][..]),
        ("layers", &["created_at", "updated_at"][..]),
        ("feature_groups", &["created_at", "updated_at"][..]),
        ("features", &["created_at", "updated_at"][..]),
        ("events", &["created_at"][..]),
        ("sync_outbox", &["created_at", "updated_at"][..]),
    ] {
        for column in columns {
            conn.execute_batch(&format!(
                "CREATE TRIGGER IF NOT EXISTS trg_{table}_{column}_timestamp_insert
                 BEFORE INSERT ON {table}
                 WHEN NEW.{column} IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', NEW.{column}) IS NULL
                 BEGIN SELECT RAISE(ABORT, '{table}.{column} contains an invalid timestamp'); END;
                 CREATE TRIGGER IF NOT EXISTS trg_{table}_{column}_timestamp_update
                 BEFORE UPDATE OF {column} ON {table}
                 WHEN NEW.{column} IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', NEW.{column}) IS NULL
                 BEGIN SELECT RAISE(ABORT, '{table}.{column} contains an invalid timestamp'); END;
                 CREATE TRIGGER IF NOT EXISTS trg_{table}_{column}_timestamp_normalize_insert
                 AFTER INSERT ON {table}
                 WHEN NEW.{column} NOT GLOB '????-??-??T??:??:??.???Z'
                 BEGIN
                     UPDATE {table} SET {column}=strftime('%Y-%m-%dT%H:%M:%fZ', NEW.{column})
                     WHERE rowid=NEW.rowid;
                 END;
                 CREATE TRIGGER IF NOT EXISTS trg_{table}_{column}_timestamp_normalize_update
                 AFTER UPDATE OF {column} ON {table}
                 WHEN NEW.{column} NOT GLOB '????-??-??T??:??:??.???Z'
                 BEGIN
                     UPDATE {table} SET {column}=strftime('%Y-%m-%dT%H:%M:%fZ', NEW.{column})
                     WHERE rowid=NEW.rowid;
                 END;"
            ))?;
        }
    }
    Ok(())
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

fn table_exists(conn: &Connection, table: &str) -> Result<bool, rusqlite::Error> {
    conn.query_row(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1 LIMIT 1",
        [table],
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
    ensure_legacy_composite_parent_keys(conn)?;
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
    fn normalizes_legacy_json_without_changing_dangling_relationships() {
        let conn = Connection::open_in_memory().expect("database");
        conn.execute_batch(
            r#"
            CREATE TABLE regions(id TEXT PRIMARY KEY, project_id TEXT, parent_id TEXT);
            CREATE TABLE layers(id TEXT PRIMARY KEY, project_id TEXT, region_id TEXT);
            CREATE TABLE feature_groups(id TEXT PRIMARY KEY, project_id TEXT, parent_id TEXT);
            CREATE TABLE features(
                id TEXT PRIMARY KEY,
                group_id TEXT,
                coordinates_json TEXT,
                bbox_json TEXT
            );
            INSERT INTO layers VALUES('l1', 'p1', 'missing-region');
            INSERT INTO features VALUES('f1', NULL, '"[105.78,21.04]"', NULL);
            INSERT INTO features VALUES('f2', NULL, 'null', NULL);
            "#,
        )
        .expect("legacy fixture");

        normalize_legacy_v9_data(&conn).expect("normalize");

        let coordinates: String = conn
            .query_row(
                "SELECT coordinates_json FROM features WHERE id='f1'",
                [],
                |row| row.get(0),
            )
            .expect("coordinates");
        let null_coordinates: Option<String> = conn
            .query_row(
                "SELECT coordinates_json FROM features WHERE id='f2'",
                [],
                |row| row.get(0),
            )
            .expect("null coordinates");
        let region_id: Option<String> = conn
            .query_row("SELECT region_id FROM layers WHERE id='l1'", [], |row| {
                row.get(0)
            })
            .expect("region");

        assert_eq!(coordinates, "[105.78,21.04]");
        assert_eq!(null_coordinates, None);
        assert_eq!(region_id.as_deref(), Some("missing-region"));
    }

    #[test]
    fn backfills_feature_bbox_columns_and_rtree_from_coordinates() {
        let conn = Connection::open_in_memory().expect("database");
        apply_v2_schema(&conn).expect("schema applied");
        conn.execute(
            "INSERT INTO projects(id, name, title) VALUES('p1', 'Project', 'Project')",
            [],
        )
        .expect("project");
        conn.execute(
            "INSERT INTO layers(id, project_id, name) VALUES('l1', 'p1', 'Layer')",
            [],
        )
        .expect("layer");
        conn.execute(
            "INSERT INTO features(id, project_id, layer_id, name, geom_type, coordinates_json)
             VALUES('f1', 'p1', 'l1', 'Line', 'LineString', '[[105.0,21.0],[106.0,22.0]]')",
            [],
        )
        .expect("feature");

        apply_v2_schema(&conn).expect("schema reapplied");

        let bbox: (f64, f64, f64, f64) = conn
            .query_row(
                "SELECT bbox_min_x, bbox_min_y, bbox_max_x, bbox_max_y FROM features WHERE id='f1'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .expect("bbox");
        let spatial_count: i64 = conn
            .query_row(
                "SELECT COUNT(*)
                 FROM feature_rtree r
                 INNER JOIN features f ON f.rowid = r.rowid
                 WHERE f.id = 'f1'
                   AND r.max_x >= 105.5 AND r.min_x <= 105.5
                   AND r.max_y >= 21.5 AND r.min_y <= 21.5",
                [],
                |row| row.get(0),
            )
            .expect("rtree");

        assert_eq!(bbox, (105.0, 21.0, 106.0, 22.0));
        assert_eq!(spatial_count, 1);
    }

    #[test]
    fn legacy_parent_tables_gain_composite_keys_before_child_tables_are_created() {
        let conn = Connection::open_in_memory().expect("database");
        conn.pragma_update(None, "foreign_keys", "ON")
            .expect("foreign keys");
        conn.execute_batch(
            r#"
            CREATE TABLE features (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                layer_id TEXT NOT NULL,
                group_id TEXT,
                name TEXT NOT NULL,
                geom_type TEXT NOT NULL,
                coordinates_json TEXT,
                properties_json TEXT DEFAULT '{}',
                metadata_json TEXT DEFAULT '{}',
                bbox_json TEXT,
                is_visible INTEGER NOT NULL DEFAULT 1,
                note TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            "#,
        )
        .expect("legacy features");

        apply_base_schema(&conn).expect("compatible base schema");
        conn.execute_batch(
            r#"
            INSERT INTO projects(id, name, title) VALUES('p1', 'P1', 'P1');
            INSERT INTO layers(id, project_id, name) VALUES('l1', 'p1', 'Layer');
            INSERT INTO features(id, project_id, layer_id, name, geom_type)
            VALUES('f1', 'p1', 'l1', 'Cable', 'LineString');
            INSERT INTO fiber_cables(id, project_id, feature_id)
            VALUES('c1', 'p1', 'f1');
            "#,
        )
        .expect("composite foreign key is valid");
    }

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
        conn.execute(
            "INSERT INTO features (id, project_id, layer_id, group_id, name, geom_type, coordinates_json, properties_json, metadata_json) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                "feature-2",
                "project-1",
                "layer-1",
                Option::<String>::None,
                "Legacy Power Line",
                "Polyline",
                "[[0,0],[2,2]]",
                "{}",
                r#"{"infrastructure":{"type":"PowerLine","core_count":24}}"#,
            ],
        )
        .expect("legacy feature");

        apply_v2_schema(&conn).expect("schema reapplied");

        let cable_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM fiber_cables WHERE id = ?1",
                ["feature-1"],
                |row| row.get(0),
            )
            .expect("fiber cable count");
        assert_eq!(cable_count, 1);

        let legacy_cable_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM fiber_cables WHERE id = ?1",
                ["feature-2"],
                |row| row.get(0),
            )
            .expect("legacy fiber cable count");
        assert_eq!(legacy_cable_count, 0);

        let normalized_type: String = conn
            .query_row(
                "SELECT json_extract(metadata_json, '$.infrastructure.type') FROM features WHERE id = ?1",
                ["feature-2"],
                |row| row.get(0),
            )
            .expect("normalized metadata type");
        assert_eq!(normalized_type, "PowerLine");

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
            params!["splice-3", "enclosure-1", "strand-3", "strand-3", "end", "start", 0.05],
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
            params!["splice-same-strand", "enclosure-1", "strand-3", "strand-3", "start", "end", 0.05],
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

    #[test]
    fn v9_enforces_project_json_hop_and_fts_rules() {
        let conn = Connection::open_in_memory().expect("in-memory db");
        conn.pragma_update(None, "foreign_keys", "ON")
            .expect("foreign keys");
        apply_v2_schema(&conn).expect("schema applied");
        conn.execute_batch(
            r#"
            INSERT INTO projects(id, name, title) VALUES('p1', 'P1', 'P1');
            INSERT INTO projects(id, name, title) VALUES('p2', 'P2', 'P2');
            INSERT INTO regions(id, project_id, name) VALUES('r1', 'p1', 'Region 1');
            INSERT INTO layers(id, project_id, name) VALUES('l1', 'p1', 'Layer 1');
            INSERT INTO layers(id, project_id, name) VALUES('l2', 'p2', 'Layer 2');
            UPDATE layers SET region_id='r1' WHERE id='l1';
            INSERT INTO feature_groups(id, project_id, layer_id, name)
            VALUES('g1', 'p1', 'l1', 'Group 1');
            INSERT INTO features(
                id, project_id, layer_id, group_id, name, geom_type, coordinates_json
            ) VALUES('f1', 'p1', 'l1', 'g1', 'Feature 1', 'Point', '[1,2]');
            INSERT INTO features(
                id, project_id, layer_id, name, geom_type, coordinates_json
            ) VALUES('f2', 'p1', 'l1', 'Feature 2', 'Point', '[2,3]');
            INSERT INTO fiber_circuits(
                id, project_id, name, a_feature_id, z_feature_id
            ) VALUES('c1', 'p1', 'Circuit', 'f1', 'f2');
            INSERT INTO files(id, project_id, rel_path, filename, metadata_json)
            VALUES('file-1', 'p1', 'docs/a.txt', 'alpha.txt', '{}');
            "#,
        )
        .expect("fixture");

        conn.pragma_update(None, "foreign_keys", "OFF")
            .expect("simulate upgraded v8 tables without new foreign keys");
        conn.execute("DELETE FROM feature_groups WHERE id='g1'", [])
            .expect("delete group");
        let cleared_group: Option<String> = conn
            .query_row("SELECT group_id FROM features WHERE id='f1'", [], |row| {
                row.get(0)
            })
            .expect("cleared group");
        assert_eq!(cleared_group, None);
        conn.execute("DELETE FROM regions WHERE id='r1'", [])
            .expect("delete region");
        let cleared_region: Option<String> = conn
            .query_row("SELECT region_id FROM layers WHERE id='l1'", [], |row| {
                row.get(0)
            })
            .expect("cleared region");
        assert_eq!(cleared_region, None);

        let cross_project_feature = conn.execute(
            "INSERT INTO features(id, project_id, layer_id, name, geom_type)
             VALUES('bad-project', 'p2', 'l1', 'Bad', 'Point')",
            [],
        );
        assert!(cross_project_feature.is_err());

        let invalid_json = conn.execute(
            "UPDATE features SET coordinates_json='{bad' WHERE id='f1'",
            [],
        );
        assert!(invalid_json.is_err());

        let invalid_hop = conn.execute(
            "INSERT INTO fiber_circuit_hops(circuit_id, sequence_no)
             VALUES('c1', 0)",
            [],
        );
        assert!(invalid_hop.is_err());

        let fts_content: String = conn
            .query_row(
                "SELECT content FROM fts_files_content WHERE file_id='file-1'",
                [],
                |row| row.get(0),
            )
            .expect("FTS content");
        assert_eq!(fts_content, "alpha.txt {}");

        conn.execute(
            "UPDATE files SET status='archived', updated_at=CURRENT_TIMESTAMP WHERE id='file-1'",
            [],
        )
        .expect("status update");
        let unchanged_fts_content: String = conn
            .query_row(
                "SELECT content FROM fts_files_content WHERE file_id='file-1'",
                [],
                |row| row.get(0),
            )
            .expect("unchanged FTS content");
        assert_eq!(unchanged_fts_content, "alpha.txt {}");
        let normalized_updated_at: String = conn
            .query_row(
                "SELECT updated_at FROM files WHERE id='file-1'",
                [],
                |row| row.get(0),
            )
            .expect("normalized timestamp");
        assert!(normalized_updated_at.contains('T'));
        assert!(normalized_updated_at.ends_with('Z'));

        conn.execute("UPDATE files SET filename='beta.txt' WHERE id='file-1'", [])
            .expect("rename");
        let updated_fts_content: String = conn
            .query_row(
                "SELECT content FROM fts_files_content WHERE file_id='file-1'",
                [],
                |row| row.get(0),
            )
            .expect("updated FTS content");
        assert_eq!(updated_fts_content, "beta.txt {}");
    }
}
