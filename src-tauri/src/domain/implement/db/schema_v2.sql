-- V2 Schema Definition
-- Single Source of Truth: event_store

-- 1. Metadata Registry: Store JSON Schemas for validation
CREATE TABLE IF NOT EXISTS metadata_registry (
    id TEXT PRIMARY KEY, -- UUID
    name TEXT UNIQUE NOT NULL,
    schema JSON NOT NULL,
    version INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Event Store: Primary Source of Truth
CREATE TABLE IF NOT EXISTS event_store (
    id TEXT PRIMARY KEY, -- UUID
    project_id TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload JSON NOT NULL,
    version INTEGER NOT NULL, -- Logical version for optimistic locking
    device_id TEXT NOT NULL,
    global_seq INTEGER NOT NULL, -- Sequential ID for sync
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sync_status INTEGER DEFAULT 0 -- 0: Local, 1: Synced, 2: Conflict
);

-- 3. Entity Index (Unified FTS5)
-- Optimized for searching across all entity types
CREATE VIRTUAL TABLE IF NOT EXISTS entity_index USING fts5(
    id UNINDEXED, -- UUID of the entity
    entity_type UNINDEXED, -- 'task', 'feature', 'folder', etc.
    title,
    content,
    tags,
    metadata UNINDEXED -- JSON stored but not tokenized
);

-- 4. Projections (Read Models)
-- Each module will have its own projection tables rebuilt from event_store

-- Project Metadata (Design Settings)
CREATE TABLE IF NOT EXISTS projection_project (
    id TEXT PRIMARY KEY, -- UUID
    name TEXT NOT NULL,
    description TEXT,
    settings JSON,
    updated_at TIMESTAMP
);

-- Folders/Containers
CREATE TABLE IF NOT EXISTS projection_folders (
    id TEXT PRIMARY KEY, -- UUID
    name TEXT NOT NULL,
    parent_id TEXT, -- UUID or NULL
    color TEXT,
    icon TEXT,
    metadata JSON
);

-- Standard Entities (Tasks, Features, etc.)
CREATE TABLE IF NOT EXISTS projection_entities (
    id TEXT PRIMARY KEY, -- UUID
    folder_id TEXT,
    entity_type TEXT NOT NULL, -- 'task', 'feature', 'system_node'
    title TEXT NOT NULL,
    description TEXT,
    status TEXT,
    priority INTEGER,
    assigned_to TEXT, -- JSON array of UUIDs
    tags TEXT, -- JSON array of strings
    metadata JSON, -- Dynamic data validated by metadata_registry
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    FOREIGN KEY (folder_id) REFERENCES projection_folders(id)
);

-- 5. Sync State (For Client tracking)
CREATE TABLE IF NOT EXISTS sync_state (
    id TEXT PRIMARY KEY,
    last_synced_seq INTEGER DEFAULT 0,
    last_synced_at TIMESTAMP
);

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_event_project ON event_store(project_id, global_seq);
CREATE INDEX IF NOT EXISTS idx_event_entity ON event_store(entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_folder ON projection_entities(folder_id);
