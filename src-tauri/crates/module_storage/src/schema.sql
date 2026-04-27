-- Database Schema for GIS/Task Management V5.3

-- Enable WAL mode for high concurrency
-- Note: This is usually done via PRAGMA in code, but added here for documentation.

-- Event Store (Source of Truth)
CREATE TABLE IF NOT EXISTS event_store (
    id BLOB PRIMARY KEY, -- UUID
    entity_id BLOB NOT NULL, -- UUID
    schema_version INTEGER NOT NULL,
    created_at INTEGER NOT NULL, -- Timestamp
    payload TEXT NOT NULL -- JSON payload
);

-- Indexes for event retrieval
CREATE INDEX IF NOT EXISTS idx_events_entity ON event_store (entity_id);
CREATE INDEX IF NOT EXISTS idx_events_stream ON event_store (entity_id, created_at ASC);

-- Projection Table: Tasks
CREATE TABLE IF NOT EXISTS tasks (
    id BLOB PRIMARY KEY, -- UUID
    project_id BLOB NOT NULL,
    parent_id BLOB,
    title TEXT NOT NULL,
    priority INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'todo',
    is_completed BOOLEAN NOT NULL DEFAULT 0,
    color TEXT,
    target_file_path TEXT,
    start_date INTEGER,
    end_date INTEGER,
    last_event_id BLOB NOT NULL -- For Idempotency
);

-- Projection Table: Features (Upgraded V5.3 for Explorer Support)
CREATE TABLE IF NOT EXISTS features (
    id BLOB PRIMARY KEY, -- UUID
    project_id BLOB,     -- UUID (New in Phase 2)
    name TEXT,           -- Name for Explorer
    layer_id BLOB,       -- UUID of layer
    geom_type TEXT,      -- For icons
    geometry BLOB NOT NULL, -- WKB
    last_event_id BLOB NOT NULL -- For Idempotency
);

-- Projection Table: Project Settings
CREATE TABLE IF NOT EXISTS project_settings (
    project_id BLOB PRIMARY KEY,
    epsg_code TEXT NOT NULL,
    units TEXT NOT NULL,
    center_lat REAL,
    center_lon REAL,
    default_zoom REAL NOT NULL,
    last_event_id BLOB NOT NULL
);

-- Projection Table: Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id BLOB PRIMARY KEY,
    project_id BLOB NOT NULL,
    user_email TEXT,
    action_type TEXT NOT NULL,
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    old_values_json TEXT,
    new_values_json TEXT,
    created_at INTEGER NOT NULL
);

-- Projection Table: Design Styles
CREATE TABLE IF NOT EXISTS design_styles (
    id BLOB PRIMARY KEY,
    project_id BLOB NOT NULL,
    name TEXT NOT NULL,
    geom_type TEXT NOT NULL,
    stroke_color TEXT,
    stroke_width REAL,
    fill_color TEXT,
    opacity REAL,
    icon_path TEXT,
    dash_pattern TEXT,
    created_at INTEGER NOT NULL,
    last_event_id BLOB NOT NULL
);
