# V2 Architecture - Complete Refactoring Plan

> **Status:** Design Document  
> **Version:** 2.0.0  
> **Date:** 2026-04-12  
> **Target:** Single Source of Truth + Event-driven + Extensible + Sync-ready

---

## Table of Contents

1. [Vision & Principles](#1--vision--principles)
2. [Target Architecture](#2--target-architecture)
3. [Core Database Schema V2](#3--core-database-schema-v2)
4. [Event Store Design](#4--event-store-design)
5. [Projection Engine](#5--projection-engine)
6. [Metadata Registry](#6--metadata-registry)
7. [Unified Entity Index](#7--unified-entity-index)
8. [Versioned .pmp Format](#8--versioned-pmp-format)
9. [Sync Engine Architecture](#9--sync-engine-architecture)
10. [Actor Model Pipeline](#10--actor-model-pipeline)
11. [AI & Vector Search Architecture](#11--ai--vector-search-architecture)
12. [Migration Strategy V1 → V2](#12--migration-strategy-v1--v2)
13. [Implementation Roadmap](#13--implementation-roadmap)
14. [Product SKU & Licensing](#14--product-sku--licensing)
15. [Appendix - Code Mapping](#15--appendix---code-mapping)

---

## 1. Vision & Principles

### 1.1 Core Philosophy

V2 is defined as:

> **"Single Source of Truth + Event-driven + Extensible + Sync-ready"**

### 1.2 Architectural Principles

| Principle | Description |
|-----------|-------------|
| ❌ No V1 Fallback | Once migrated, V1 code paths are removed entirely |
| ✅ UUID Everywhere | All entity IDs are UUID v4/v7, no auto-increment integers |
| ✅ Event is Source of Truth | `event_store` is the authoritative data source |
| ✅ Read Models Separated (CQRS-lite) | Projections are derived, never written to directly |
| ✅ Schema Governed | `metadata_registry` controls all JSON schemas |
| ✅ Sync Native | Every event carries `device_id`, `version`, `global_seq` |
| ✅ Offline First | Local writes always succeed; sync is async background |

### 1.3 What Changes vs Current Architecture

| Aspect | Current (V1) | V2 Target |
|--------|-------------|-----------|
| **Event table** | `design_events` (GIS only) | `event_store` (all entities) |
| **IDs** | Mixed INTEGER + TEXT | UUID everywhere |
| **Write path** | Direct table writes | Event → Projection only |
| **Search** | 3 scattered FTS5 tables | 1 unified `entity_index` |
| **Metadata** | Ad-hoc JSON columns | `metadata_registry` with versioning |
| **Sync** | Stub only | Full event-based sync |
| **Blob storage** | File paths only | SHA-256 deduplicated blob store |
| **Format** | Single SQLite file | Versioned container (zip optional) |
| **Pipeline** | Direct function calls | Actor Model with message queues |
| **Vector search** | Stored but not queried | LanceDB with semantic search |

---

## 2. Target Architecture

### 2.1 System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            Tauri Frontend                                │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  ┌────────────┐ │
│  │  Design Map  │  │  Task Panel  │  │  File Manager │  │  Analytics │ │
│  │  (React)     │  │  (React)     │  │  (React)      │  │  (React)   │ │
│  └──────┬───────┘  └──────┬───────┘  └───────┬───────┘  └─────┬──────┘ │
│         │                 │                  │                 │         │
│         └─────────────────┴──────────────────┴─────────────────┘         │
│                                   │                                       │
│                            Tauri Commands                                 │
└───────────────────────────────────┼───────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼───────────────────────────────────────┐
│                         Core Engine (Rust)                                 │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────┐    │
│  │                    Command Layer (Tauri Handlers)                 │    │
│  │  project.rs | task.rs | design.rs | import.rs | sync.rs          │    │
│  └──────────────────────────────┬───────────────────────────────────┘    │
│                                 │                                         │
│  ┌──────────────────────────────▼───────────────────────────────────┐    │
│  │                     Event Dispatcher                               │    │
│  │  - Validates commands against metadata_registry schemas           │    │
│  │  - Assigns UUID, device_id, version, global_seq                   │    │
│  │  - Appends to event_store (atomic)                                │    │
│  │  - Triggers projection pipeline                                   │    │
│  └──────────────────────────────┬───────────────────────────────────┘    │
│                                 │                                         │
│  ┌──────────────────────────────▼───────────────────────────────────┐    │
│  │                    Event Store (SQLite)                            │    │
│  │                     SOURCE OF TRUTH                                │    │
│  │  event_store | metadata_registry | entity_index | sync_state      │    │
│  └──────────────────────────────┬───────────────────────────────────┘    │
│                                 │                                         │
│  ┌──────────────────────────────▼───────────────────────────────────┐    │
│  │                   Projection Engine (CQRS-lite)                    │    │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌───────────────┐ │    │
│  │  │ Task       │ │ Feature    │ │ File       │ │ WorkItem      │ │    │
│  │  │ Projector  │ │ Projector  │ │ Projector  │ │ Projector     │ │    │
│  │  └─────┬──────┘ └─────┬──────┘ └─────┬──────┘ └──────┬────────┘ │    │
│  └────────┼──────────────┼──────────────┼───────────────┼──────────┘    │
│           │              │              │               │               │
│  ┌────────▼──────────────▼──────────────▼───────────────▼──────────┐    │
│  │                   Read Models (Projections)                       │    │
│  │  tasks | features | files | work_items | materials | contracts  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                 │                                         │
│  ┌──────────────────────────────▼───────────────────────────────────┐    │
│  │                      Actor Pipeline                                │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │    │
│  │  │Ingestion │→│ Parsing  │→│ AI       │→│Normalize │→│Storage │ │    │
│  │  │ Actor    │  │ Actor    │  │ Analysis │  │ Actor    │  │ Actor  │ │    │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └────────┘ │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                 │                                         │
│  ┌──────────────────────────────▼───────────────────────────────────┐    │
│  │                      Sync Engine                                   │    │
│  │  - Local event queue  - Conflict detection  - Push/Pull API      │    │
│  │  - Background retry   - Delta sync            - Blob sync        │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼───────────────────────────────────────┐
│                          Storage Layer                                     │
│                                                                            │
│  project.pmp/                        │  Server (Cloud/Enterprise)         │
│  ├── core.db (SQLite)                │  ├── Event Store (PostgreSQL)      │
│  ├── analytics.duckdb                │  ├── Blob Storage (S3/MinIO)       │
│  ├── blobs/                          │  ├── Sync API (Rust/Node)          │
│  │   └── sha256/ab/cd/file.bin      │  └── Auth & RBAC                   │
│  ├── index/ (search index)           │                                    │
│  └── manifest.json                   │                                    │
└───────────────────────────────────────────────────────────────────────────┘
```

### 2.2 .pmp Container Structure

```
project.pmp/                          ← Can be folder or .zip
├── core.db                           ← SQLite (events + projections)
├── analytics.duckdb                  ← DuckDB (OLAP cache)
├── blobs/                            ← Content-addressable blob storage
│   └── sha256/
│       ├── ab/cdef1234...            ← First 2 chars as subfolder
│       │   └── 1234567890abcdef...   ← Full SHA-256 hash as filename
│       └── 12/3456789abcdef...
├── index/                            ← Optional search index (LanceDB)
│   └── embeddings.lance/
└── manifest.json                     ← Version & metadata entry point
```

**manifest.json:**
```json
{
  "format_version": "2.0",
  "app_version": "1.3.0",
  "project_id": "550e8400-e29b-41d4-a716-446655440000",
  "created_at": "2026-04-12T10:30:00Z",
  "updated_at": "2026-04-12T15:45:00Z",
  "features": ["event_sourcing", "sync", "ai_analysis"],
  "db_schema_version": 5,
  "metadata_schema_version": 3,
  "device_id": "device-abc-123"
}
```

### 2.3 Three-Layer Versioning

| Layer | Field | Purpose | Example |
|-------|-------|---------|---------|
| **Format** | `format_version` in manifest.json | Container format version | `"2.0"` |
| **Schema** | `db_schema_version` in manifest | SQLite schema version | `5` |
| **Metadata** | `metadata_schema_version` in manifest | JSON schema version in registry | `3` |

**Why 3 layers:**
- Format version changes require different file handling logic
- Schema version changes require SQL migrations
- Metadata version changes require JSON schema validation updates

---

## 3. Core Database Schema V2

### 3.1 Overview

```
core.db (SQLite)
│
├── SYSTEM TABLES
│   ├── migrations              ← Schema migration tracking
│   └── sync_state              ← Per-device sync tracking
│
├── SOURCE OF TRUTH
│   └── event_store             ← ALL changes as events
│
├── SCHEMA CONTROL
│   └── metadata_registry       ← JSON schema definitions
│
├── SEARCH INDEX
│   └── entity_index            ← Unified search (replaces FTS5 scattered)
│
├── BLOB METADATA
│   └── blob_registry           ← SHA-256 → path mapping
│
└── READ MODELS (PROJECTIONS)
    ├── projects
    ├── tasks
    ├── features
    ├── files
    ├── work_items
    ├── materials
    ├── contracts
    ├── personnel
    ├── notes
    ├── content_types
    ├── content_fields
    ├── content_items
    ├── roles
    ├── personnel_roles
    ├── project_settings
    ├── audit_logs
    ├── feature_attachments
    ├── design_styles
    └── contract_execution_groups
```

### 3.2 System Tables

#### `migrations`
Tracks which schema migrations have been applied.

```sql
CREATE TABLE migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    migration_name TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL DEFAULT (datetime('now')),
    checksum TEXT NOT NULL
);
```

#### `sync_state`
Tracks sync progress per device.

```sql
CREATE TABLE sync_state (
    device_id TEXT PRIMARY KEY,
    device_name TEXT,
    last_pushed_seq INTEGER DEFAULT 0,
    last_pulled_seq INTEGER DEFAULT 0,
    last_sync_at TEXT,
    sync_status TEXT DEFAULT 'idle',  -- idle, syncing, error
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 3.3 Event Store (Source of Truth)

```sql
CREATE TABLE event_store (
    id TEXT PRIMARY KEY,                        -- UUID v4/v7
    project_id TEXT NOT NULL,                   -- Project UUID
    entity_type TEXT NOT NULL,                  -- "task", "feature", "file", "layer", etc.
    entity_id TEXT NOT NULL,                    -- Target entity UUID
    event_type TEXT NOT NULL,                   -- "created", "updated", "deleted"
    payload_json TEXT NOT NULL,                 -- Event-specific data
    metadata_json TEXT,                         -- Context metadata (user, device, etc.)
    version INTEGER NOT NULL,                   -- Monotonic version per entity
    global_seq INTEGER NOT NULL UNIQUE,         -- Global monotonic sequence
    device_id TEXT NOT NULL,                    -- Originating device ID
    correlation_id TEXT,                        -- Groups related events
    causation_id TEXT,                          -- ID of event that caused this
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    
    -- Indexes for common query patterns
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Query: All events for an entity (rebuild state)
CREATE INDEX idx_event_store_entity ON event_store(entity_type, entity_id, version);

-- Query: Events since last sync (device pull)
CREATE INDEX idx_event_store_global_seq ON event_store(global_seq);

-- Query: Events by device (conflict analysis)
CREATE INDEX idx_event_store_device ON event_store(device_id, global_seq);

-- Query: Correlated events (bulk operations)
CREATE INDEX idx_event_store_correlation ON event_store(correlation_id);
```

**Key Design Decisions:**

| Field | Purpose | Type | Notes |
|-------|---------|------|-------|
| `id` | Event unique identifier | UUID v7 | Time-sortable UUID for better write performance |
| `global_seq` | Global ordering | INTEGER AUTOINCREMENT | Single source of truth for event ordering |
| `version` | Per-entity version | INTEGER | Detect conflicts: if two devices have same entity at same version |
| `device_id` | Origin device | TEXT | Enables multi-device sync |
| `correlation_id` | Group related events | UUID | All events from one UI action share this ID |
| `causation_id` | Event chain tracking | UUID | Links cause → effect events |

### 3.4 Metadata Registry

```sql
CREATE TABLE metadata_registry (
    id TEXT PRIMARY KEY,                        -- UUID
    entity_type TEXT NOT NULL,                  -- "task", "feature", "file", etc.
    schema_name TEXT NOT NULL,                  -- Human-readable name
    schema_json TEXT NOT NULL,                  -- JSON Schema definition
    version INTEGER NOT NULL,                   -- Schema version
    is_active BOOLEAN NOT NULL DEFAULT 1,       -- Current active schema
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    
    UNIQUE(entity_type, version)
);

CREATE INDEX idx_metadata_registry_type ON metadata_registry(entity_type, is_active);
```

**Example schema_json:**
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "task": {
      "name": {"type": "string", "minLength": 1},
      "description": {"type": "string"},
      "status": {"enum": ["todo", "in_progress", "done", "cancelled"]},
      "priority": {"enum": ["low", "normal", "high", "urgent"]},
      "progress": {"type": "number", "minimum": 0, "maximum": 100},
      "assignee_id": {"type": "string", "format": "uuid"},
      "contract_id": {"type": "string", "format": "uuid"}
    },
    "required": ["name", "status"]
  }
}
```

**Purpose:**
- Eliminates "JSON chaos" — all metadata follows registered schemas
- Enables schema evolution with version tracking
- Supports validation at event write time
- Enables backward-compatible schema changes

### 3.5 Entity Index (Unified Search)

Replaces scattered FTS5 tables (`file_search`, `task_search`, `note_search`) with one unified index.

```sql
CREATE TABLE entity_index (
    entity_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    project_id TEXT NOT NULL,
    name TEXT,
    search_vector TEXT,
    tags TEXT,                     -- JSON array of tags
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    
    PRIMARY KEY (entity_id, entity_type),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- FTS5 virtual table on top of entity_index
CREATE VIRTUAL TABLE entity_search USING fts5(
    entity_id UNINDEXED,
    entity_type UNINDEXED,
    name,
    search_vector,
    tags,
    content='entity_index',
    content_rowid='rowid',
    tokenize='unicode61 remove_diacritics 2'
);

-- Triggers for automatic FTS sync
CREATE TRIGGER entity_index_ai AFTER INSERT ON entity_index BEGIN
    INSERT INTO entity_search(rowid, entity_id, entity_type, name, search_vector, tags)
    VALUES (new.rowid, new.entity_id, new.entity_type, new.name, new.search_vector, new.tags);
END;

CREATE TRIGGER entity_index_ad AFTER DELETE ON entity_index BEGIN
    INSERT INTO entity_search(entity_search, rowid, entity_id, entity_type, name, search_vector, tags)
    VALUES('delete', old.rowid, old.entity_id, old.entity_type, old.name, old.search_vector, old.tags);
END;

CREATE TRIGGER entity_index_au AFTER UPDATE ON entity_index BEGIN
    INSERT INTO entity_search(entity_search, rowid, entity_id, entity_type, name, search_vector, tags)
    VALUES('delete', old.rowid, old.entity_id, old.entity_type, old.name, old.search_vector, old.tags);
    INSERT INTO entity_search(rowid, entity_id, entity_type, name, search_vector, tags)
    VALUES (new.rowid, new.entity_id, new.entity_type, new.name, new.search_vector, new.tags);
END;

CREATE INDEX idx_entity_index_project ON entity_index(project_id);
CREATE INDEX idx_entity_index_type ON entity_index(entity_type);
CREATE INDEX idx_entity_index_updated ON entity_index(updated_at);
```

**Advantages over current approach:**
- One index to maintain instead of 3+
- Cross-entity search possible
- Automatic sync via triggers (no manual FTS management)
- Extensible with tags and metadata

### 3.6 Blob Registry

```sql
CREATE TABLE blob_registry (
    id TEXT PRIMARY KEY,                        -- UUID
    sha256 TEXT NOT NULL UNIQUE,                -- Content hash
    file_size INTEGER NOT NULL,
    mime_type TEXT,
    original_filename TEXT,
    blob_path TEXT NOT NULL,                    -- Relative path in blobs/ folder
    reference_count INTEGER DEFAULT 1,          -- For garbage collection
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    
    -- Index for quick lookup by hash
    INDEX idx_blob_registry_sha256 (sha256)
);
```

### 3.7 Read Model Tables (Projections)

All projection tables use UUID instead of INTEGER IDs. Key changes from V1:

#### `projects` (V2)
```sql
CREATE TABLE projects (
    id TEXT PRIMARY KEY,                        -- UUID
    name TEXT NOT NULL,
    root_path TEXT,
    path TEXT,
    description TEXT,
    contract_number TEXT,
    investor TEXT,
    contractor TEXT,
    signed_date TEXT,
    duration TEXT,
    end_date TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    metadata_json TEXT DEFAULT '{}',
    current_version INTEGER DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

#### `tasks` (V2)
```sql
CREATE TABLE tasks (
    id TEXT PRIMARY KEY,                        -- UUID
    project_id TEXT NOT NULL,
    parent_id TEXT,                             -- UUID (self-reference)
    related_file_id TEXT,                       -- UUID
    name TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'todo',
    priority TEXT DEFAULT 'normal',
    start_date TEXT,
    end_date TEXT,
    target_file_path TEXT,
    anchor_data TEXT,
    progress REAL DEFAULT 0,
    is_completed BOOLEAN DEFAULT 0,
    color TEXT,
    assignee_id TEXT,                           -- UUID (personnel)
    contract_id TEXT,                           -- UUID
    current_version INTEGER DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES tasks(id) ON DELETE SET NULL,
    FOREIGN KEY (related_file_id) REFERENCES files(id) ON DELETE SET NULL,
    FOREIGN KEY (assignee_id) REFERENCES personnel(id) ON DELETE SET NULL,
    FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE SET NULL
);

CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_tasks_parent ON tasks(parent_id);
```

#### `features` (V2 — NEW)
Currently features exist only in MapState (in-memory). V2 persists them.

```sql
CREATE TABLE features (
    id TEXT PRIMARY KEY,                        -- UUID
    project_id TEXT NOT NULL,
    layer_id TEXT,                              -- UUID
    group_id TEXT,                              -- UUID
    name TEXT NOT NULL,
    geom_type TEXT NOT NULL,                    -- "Point", "LineString", "Polygon", "Rect"
    geometry_json TEXT NOT NULL,                -- GeoJSON geometry
    properties_json TEXT DEFAULT '{}',          -- Feature properties
    metadata_json TEXT DEFAULT '{}',            -- System metadata
    style_id TEXT,                              -- UUID (design_styles)
    current_version INTEGER DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (layer_id) REFERENCES layers(id) ON DELETE SET NULL,
    FOREIGN KEY (group_id) REFERENCES feature_groups(id) ON DELETE SET NULL,
    FOREIGN KEY (style_id) REFERENCES design_styles(id) ON DELETE SET NULL
);

-- Spatial index note: R-Tree is rebuilt from geometry_json on load
-- Alternative: Use SQLite R*Tree module for persistent spatial index
CREATE INDEX idx_features_project ON features(project_id);
CREATE INDEX idx_features_layer ON features(layer_id);
```

#### `files` (V2)
```sql
CREATE TABLE files (
    id TEXT PRIMARY KEY,                        -- UUID
    project_id TEXT NOT NULL,
    blob_id TEXT,                               -- UUID (if stored as blob)
    rel_path TEXT NOT NULL,                     -- Relative to project root
    filename TEXT NOT NULL,
    extension TEXT,
    file_size INTEGER DEFAULT 0,
    hash_sha256 TEXT,
    mime_type TEXT,
    file_type TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    content_summary TEXT,
    metadata_json TEXT DEFAULT '{}',
    categorization TEXT,
    current_version INTEGER DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (blob_id) REFERENCES blob_registry(id) ON DELETE SET NULL
);

CREATE INDEX idx_files_project ON files(project_id);
CREATE INDEX idx_files_hash ON files(hash_sha256);
CREATE UNIQUE INDEX idx_files_rel_path ON files(project_id, rel_path COLLATE NOCASE);
```

#### Other Projection Tables (V2 — UUID changes only)

| Table | Key Changes |
|-------|-------------|
| `work_items` | `id`, `project_id`, `feature_id`, `material_id` → UUID; add `current_version` |
| `materials` | `id` → UUID; add `current_version` |
| `contracts` | `id`, `project_id` → UUID; add `current_version` |
| `personnel` | `id`, `project_id` → UUID; add `current_version` |
| `notes` | `id`, `project_id` → UUID; add `current_version` |
| `content_types` | `id` → UUID |
| `content_fields` | `id`, `content_type_id` → UUID |
| `content_items` | `id`, `content_type_id`, `project_id` → UUID |
| `roles` | `id` → UUID |
| `project_settings` | `project_id` → UUID |
| `audit_logs` | `id`, `project_id`, `user_id` → UUID; `record_id` → UUID |
| `feature_attachments` | `id`, `project_id`, `file_id` → UUID; `feature_id` → UUID |
| `design_styles` | `id`, `project_id` → UUID |
| `contract_execution_groups` | `id`, `project_id` → UUID |

**NEW: Removed Tables**
- `design_events` → replaced by `event_store`
- `design_snapshots` → replaced by `event_store` + projection cache
- `task_dependencies` → managed via `tasks.parent_id` + separate `task_links` table
- `content_index` → replaced by `entity_index`
- `file_search`, `task_search`, `note_search` → replaced by `entity_search`

**NEW: Added Tables**
- `layers` — Persistent layer definitions (currently in MapState only)
- `feature_groups` — Persistent feature group definitions
- `event_store` — Unified event log
- `metadata_registry` — Schema definitions
- `entity_index` — Unified search index
- `blob_registry` — Blob metadata
- `sync_state` — Device sync tracking
- `migrations` — Schema migration tracking
- `task_links` — Explicit task dependencies (replaces text-based `dependencies` column)

#### `layers` (NEW)
```sql
CREATE TABLE layers (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    is_visible BOOLEAN DEFAULT 1,
    order_index INTEGER DEFAULT 0,
    metadata_json TEXT DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
```

#### `feature_groups` (NEW)
```sql
CREATE TABLE feature_groups (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    metadata_json TEXT DEFAULT '{}',            -- Group-level metadata (inheritance source)
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
```

#### `task_links` (NEW)
```sql
CREATE TABLE task_links (
    id TEXT PRIMARY KEY,
    from_task_id TEXT NOT NULL,
    to_task_id TEXT NOT NULL,
    link_type TEXT DEFAULT 'depends_on',        -- "depends_on", "relates_to", "blocks"
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    
    FOREIGN KEY (from_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (to_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    UNIQUE(from_task_id, to_task_id, link_type)
);
```

---

## 4. Event Store Design

### 4.1 Event Types (V2)

Replaces `DesignEventType` with a unified `Event` type covering all entities.

```rust
/// Unified event type for ALL entities (not just GIS)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum AppEvent {
    // Project events
    ProjectCreated {
        name: String,
        root_path: String,
        metadata: serde_json::Value,
    },
    ProjectUpdated {
        changes: serde_json::Value,
    },

    // Task events
    TaskCreated {
        name: String,
        parent_id: Option<Uuid>,
        metadata: serde_json::Value,
    },
    TaskUpdated {
        changes: serde_json::Value,
    },
    TaskDeleted,
    TaskLinked {
        from_task_id: Uuid,
        to_task_id: Uuid,
        link_type: TaskLinkType,
    },
    TaskUnlinked {
        from_task_id: Uuid,
        to_task_id: Uuid,
    },

    // Feature events (replaces DesignEventType)
    FeatureCreated {
        layer_id: Uuid,
        group_id: Option<Uuid>,
        name: String,
        geom_type: String,
        geometry: serde_json::Value,
        properties: serde_json::Value,
        style_id: Option<Uuid>,
    },
    FeatureUpdated {
        changes: serde_json::Value,
    },
    FeatureDeleted,
    FeatureMoved {
        delta_x: f64,
        delta_y: f64,
    },

    // Layer events
    LayerCreated {
        name: String,
        metadata: serde_json::Value,
    },
    LayerUpdated {
        changes: serde_json::Value,
    },
    LayerDeleted,

    // Feature Group events
    FeatureGroupCreated {
        name: String,
        metadata: serde_json::Value,
    },
    FeatureGroupUpdated {
        changes: serde_json::Value,
    },
    FeatureGroupDeleted,

    // File events
    FileIndexed {
        rel_path: String,
        filename: String,
        file_size: i64,
        hash_sha256: Option<String>,
        metadata: serde_json::Value,
    },
    FileUpdated {
        changes: serde_json::Value,
    },
    FileDeleted,

    // Work Item events
    WorkItemCreated {
        feature_id: Uuid,
        material_id: Option<Uuid>,
        name: String,
        quantity: f64,
        unit_price: f64,
        metadata: serde_json::Value,
    },
    WorkItemUpdated {
        changes: serde_json::Value,
    },
    WorkItemDeleted,

    // Settings events
    SettingsUpdated {
        changes: serde_json::Value,
    },

    // Import events
    DatasetImported {
        dataset_id: String,
        feature_count: usize,
        metadata: serde_json::Value,
    },
}
```

### 4.2 Event Envelope

Every event is wrapped in an envelope before storage:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventEnvelope {
    pub id: Uuid,                     // Event ID (UUID v7)
    pub project_id: Uuid,
    pub entity_type: String,          // "task", "feature", "file", etc.
    pub entity_id: Uuid,
    pub event: AppEvent,              // The actual event
    pub version: i64,                 // Per-entity version
    pub global_seq: i64,              // Global sequence number
    pub device_id: String,            // Device identifier
    pub correlation_id: Option<Uuid>, // Groups related events
    pub causation_id: Option<Uuid>,   // What caused this event
    pub metadata: serde_json::Value,  // System metadata (user, timestamp, etc.)
    pub created_at: chrono::DateTime<chrono::Utc>,
}

impl EventEnvelope {
    pub fn new(
        project_id: Uuid,
        entity_type: &str,
        entity_id: Uuid,
        event: AppEvent,
        device_id: &str,
        correlation_id: Option<Uuid>,
    ) -> Self {
        Self {
            id: Uuid::now_v7(),
            project_id,
            entity_type: entity_type.to_string(),
            entity_id,
            event,
            version: 1,  // Will be set by event store
            global_seq: 0,  // Will be set by event store
            device_id: device_id.to_string(),
            correlation_id,
            causation_id: None,
            metadata: serde_json::json!({}),
            created_at: chrono::Utc::now(),
        }
    }
}
```

### 4.3 Event Store API

```rust
pub struct EventStore {
    conn: Arc<Mutex<Connection>>,
    device_id: String,
}

impl EventStore {
    /// Append a single event (auto-assigns global_seq, version)
    pub fn append(&self, event: AppEvent, entity_type: &str, entity_id: Uuid) -> Result<EventEnvelope, String>;

    /// Append multiple events atomically
    pub fn append_batch(&self, events: Vec<(AppEvent, &str, Uuid)>) -> Result<Vec<EventEnvelope>, String>;

    /// Get all events for an entity (rebuild state)
    pub fn get_entity_events(&self, entity_type: &str, entity_id: Uuid) -> Result<Vec<EventEnvelope>, String>;

    /// Get events since a global sequence number (for sync)
    pub fn get_events_since(&self, global_seq: i64) -> Result<Vec<EventEnvelope>, String>;

    /// Get latest version of an entity
    pub fn get_entity_version(&self, entity_type: &str, entity_id: Uuid) -> Result<i64, String>;

    /// Get current device's sync state
    pub fn get_sync_state(&self) -> Result<SyncState, String>;

    /// Update sync state
    pub fn update_sync_state(&self, last_pushed_seq: i64, last_pulled_seq: i64) -> Result<(), String>;
}
```

### 4.4 Event Flow

```
UI Action (e.g., "Create Task")
    │
    ▼
Tauri Command (create_task)
    │
    ├── 1. Validate against metadata_registry schema
    ├── 2. Get next version for entity
    ├── 3. Create EventEnvelope
    ├── 4. Append to event_store (IMMEDIATE transaction)
    ├── 5. Trigger projection pipeline
    └── 6. Return event_id to UI

Projection Pipeline (async)
    │
    ├── 1. Deserialize event
    ├── 2. Route to correct projector (TaskProjector, FeatureProjector, etc.)
    ├── 3. Projector updates read model table (UPSERT)
    ├── 4. Update entity_index
    └── 5. Emit Tauri event to UI ("task-created")
```

---

## 5. Projection Engine

### 5.1 Overview

The Projection Engine (PE) transforms events into read model tables. It implements **CQRS-lite**: events are the write model, projection tables are the read model.

```
┌─────────────────────────────────────────────────────────────┐
│                    Projection Engine                         │
│                                                              │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐ │
│  │ Task     │   │ Feature  │   │ File     │   │ WorkItem │ │
│  │Projector │   │Projector │   │Projector │   │Projector │ │
│  └────┬─────┘   └────┬─────┘   └────┬─────┘   └────┬─────┘ │
│       │              │              │              │        │
│       ▼              ▼              ▼              ▼        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Projection Tables (Read Models)          │  │
│  │  tasks | features | files | work_items | materials   │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Projector Trait

```rust
pub trait Projector: Send + Sync {
    /// Entity type this projector handles
    fn entity_type(&self) -> &str;

    /// Apply an event to the read model
    fn apply(&self, conn: &Connection, event: &EventEnvelope) -> Result<(), String>;

    /// Rebuild the entire projection from event_store (for recovery)
    fn rebuild(&self, conn: &Connection, project_id: Uuid) -> Result<usize, String>;
}
```

### 5.3 TaskProjector Example

```rust
pub struct TaskProjector;

impl Projector for TaskProjector {
    fn entity_type(&self) -> &str { "task" }

    fn apply(&self, conn: &Connection, event: &EventEnvelope) -> Result<(), String> {
        match &event.event {
            AppEvent::TaskCreated { name, parent_id, metadata } => {
                conn.execute(
                    "INSERT INTO tasks (id, project_id, parent_id, name, current_version, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                    params![
                        event.entity_id,
                        event.project_id,
                        parent_id,
                        name,
                        event.version,
                        event.created_at,
                        event.created_at,
                    ],
                ).map_err(|e| e.to_string())?;

                // Update entity_index
                conn.execute(
                    "INSERT OR REPLACE INTO entity_index (entity_id, entity_type, project_id, name, search_vector, updated_at)
                     VALUES (?1, 'task', ?2, ?3, ?4, ?5)",
                    params![
                        event.entity_id,
                        event.project_id,
                        name,
                        name,  // search_vector = name for tasks
                        event.created_at,
                    ],
                ).map_err(|e| e.to_string())?;
            }

            AppEvent::TaskUpdated { changes } => {
                let changes: serde_json::Value = changes.clone();
                if let Some(obj) = changes.as_object() {
                    for (key, value) in obj {
                        if key == "name" {
                            // Also update entity_index
                            conn.execute(
                                "UPDATE entity_index SET name = ?, search_vector = ?, updated_at = datetime('now')
                                 WHERE entity_id = ? AND entity_type = 'task'",
                                params![value, value, event.entity_id],
                            ).map_err(|e| e.to_string())?;
                        }
                        // Build dynamic UPDATE query
                        let sql = format!("UPDATE tasks SET {} = ?, updated_at = datetime('now') WHERE id = ?", key);
                        conn.execute(&sql, params![value, event.entity_id]).map_err(|e| e.to_string())?;
                    }
                }
            }

            AppEvent::TaskDeleted => {
                conn.execute(
                    "DELETE FROM tasks WHERE id = ?1",
                    params![event.entity_id],
                ).map_err(|e| e.to_string())?;

                conn.execute(
                    "DELETE FROM entity_index WHERE entity_id = ? AND entity_type = 'task'",
                    params![event.entity_id],
                ).map_err(|e| e.to_string())?;
            }

            _ => {}
        }
        Ok(())
    }

    fn rebuild(&self, conn: &Connection, project_id: Uuid) -> Result<usize, String> {
        // Clear projection table
        conn.execute("DELETE FROM tasks WHERE project_id = ?", params![project_id]).map_err(|e| e.to_string())?;

        // Replay all task events
        let mut stmt = conn.prepare(
            "SELECT id, payload_json, created_at FROM event_store
             WHERE project_id = ? AND entity_type = 'task'
             ORDER BY global_seq ASC"
        ).map_err(|e| e.to_string())?;

        let events: Vec<(String, String, String)> = stmt
            .query_map(params![project_id], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?))
            }).map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        let count = events.len();

        for (entity_id, payload_json, created_at) in events {
            let event: AppEvent = serde_json::from_str(&payload_json).map_err(|e| e.to_string())?;
            // Apply event...
        }

        Ok(count)
    }
}
```

### 5.4 Projection Registry

```rust
pub struct ProjectionEngine {
    projectors: HashMap<String, Box<dyn Projector>>,
    event_store: Arc<EventStore>,
    conn: Arc<Mutex<Connection>>,
}

impl ProjectionEngine {
    pub fn register(&mut self, projector: Box<dyn Projector>) {
        self.projectors.insert(projector.entity_type().to_string(), projector);
    }

    /// Process a single event through the correct projector
    pub fn process_event(&self, event: &EventEnvelope) -> Result<(), String> {
        let projector = self.projectors
            .get(&event.entity_type)
            .ok_or_else(|| format!("No projector for entity_type: {}", event.entity_type))?;

        projector.apply(&self.conn.lock().unwrap(), event)
    }

    /// Process a batch of events
    pub fn process_batch(&self, events: &[EventEnvelope]) -> Result<(), String> {
        for event in events {
            self.process_event(event)?;
        }
        Ok(())
    }

    /// Rebuild all projections for a project
    pub fn rebuild_all(&self, project_id: Uuid) -> Result<(), String> {
        for projector in self.projectors.values() {
            projector.rebuild(&self.conn.lock().unwrap(), project_id)?;
        }
        Ok(())
    }
}
```

### 5.5 Current → V2 Projection Mapping

| Current Logic | Current Location | V2 Projector |
|---------------|------------------|--------------|
| `apply_event_to_structural_tables()` | `db/logic.rs` | `FeatureProjector`, `WorkItemProjector` |
| Side effects (camera rotation, line segmentation) | `design_events/mod.rs` | `SideEffectActor` (async) |
| Topology propagation | `design_events/topology.rs` | `TopologyProjector` |
| Metadata inheritance | `db/logic.rs` | Built into each projector |
| FTS index updates | Manual per-table | Automatic via `entity_index` triggers |

---

## 6. Metadata Registry

### 6.1 Purpose

The Metadata Registry eliminates "JSON chaos" by:
1. Defining schemas for all `metadata_json`, `properties_json`, `payload_json` columns
2. Tracking schema versions for backward compatibility
3. Validating events against schemas before storage
4. Enabling automatic schema migration

### 6.2 Schema Format

Uses JSON Schema (draft-07) stored as TEXT in `metadata_registry.schema_json`.

```json
{
  "entity_type": "task",
  "version": 1,
  "schema": {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "type": "object",
    "properties": {
      "name": { "type": "string", "minLength": 1, "maxLength": 200 },
      "description": { "type": "string", "maxLength": 5000 },
      "status": { "enum": ["todo", "in_progress", "done", "cancelled"] },
      "priority": { "enum": ["low", "normal", "high", "urgent"] },
      "progress": { "type": "number", "minimum": 0, "maximum": 100 },
      "assignee_id": { "type": ["string", "null"], "format": "uuid" },
      "contract_id": { "type": ["string", "null"], "format": "uuid" },
      "start_date": { "type": ["string", "null"], "format": "date-time" },
      "end_date": { "type": ["string", "null"], "format": "date-time" }
    },
    "required": ["name", "status"],
    "additionalProperties": false
  }
}
```

### 6.3 Schema Validation at Event Time

```rust
use jsonschema::JSONSchema;

pub struct SchemaValidator {
    compiled_schemas: HashMap<String, JSONSchema>,
}

impl SchemaValidator {
    pub fn validate(&self, entity_type: &str, data: &serde_json::Value) -> Result<(), String> {
        let schema = self.compiled_schemas
            .get(entity_type)
            .ok_or_else(|| format!("No schema registered for: {}", entity_type))?;

        if let Err(errors) = schema.validate(data) {
            let error_msgs: Vec<String> = errors.map(|e| e.to_string()).collect();
            return Err(format!("Schema validation failed: {}", error_msgs.join(", ")));
        }
        Ok(())
    }
}
```

### 6.4 Schema Evolution Strategy

```
Version 1: { name, status, priority }
Version 2: { name, status, priority, assignee_id }  ← Added field
Version 3: { name, status, priority, assignee_id, tags }  ← Added tags

Migration: All existing events remain at V1/V2 format
           New events use V3 schema
           Projection handles missing fields with defaults
```

### 6.5 Default Schemas (Seed Data)

On first run, the system registers default schemas for all entity types:

```rust
pub fn seed_default_schemas(conn: &Connection) -> Result<(), String> {
    let defaults = vec![
        ("task", TASK_SCHEMA_V1),
        ("feature", FEATURE_SCHEMA_V1),
        ("file", FILE_SCHEMA_V1),
        ("work_item", WORK_ITEM_SCHEMA_V1),
        ("project", PROJECT_SCHEMA_V1),
        ("layer", LAYER_SCHEMA_V1),
        ("feature_group", GROUP_SCHEMA_V1),
    ];

    for (entity_type, schema_json) in defaults {
        conn.execute(
            "INSERT OR IGNORE INTO metadata_registry (id, entity_type, schema_name, schema_json, version, is_active)
             VALUES (uuid4(), ?1, ?2, ?3, 1, 1)",
            params![entity_type, format!("Default {} Schema", entity_type), schema_json],
        ).map_err(|e| e.to_string())?;
    }
    Ok(())
}
```

---

## 7. Unified Entity Index

### 7.1 Replaces Scattered FTS5 Tables

| Current | V2 Replacement |
|---------|----------------|
| `file_search` FTS5 | `entity_index` + `entity_search` FTS5 |
| `task_search` FTS5 | `entity_index` + `entity_search` FTS5 |
| `note_search` FTS5 | `entity_index` + `entity_search` FTS5 |
| `idx_files_path`, `idx_files_filename` | `entity_index.search_vector` |

### 7.2 Search API

```rust
pub struct SearchEngine {
    conn: Arc<Mutex<Connection>>,
}

impl SearchEngine {
    /// Full-text search across all entities
    pub fn search(&self, query: &str, project_id: Uuid, entity_types: Option<Vec<&str>>, limit: usize)
        -> Result<Vec<SearchResult>, String>
    {
        let type_filter = match &entity_types {
            Some(types) => format!("AND entity_type IN ({})", types.iter().map(|_| "'?'").collect::<Vec<_>>().join(", ")),
            None => "".to_string(),
        };

        let sql = format!(
            "SELECT es.entity_id, es.entity_type, es.name, es.rank
             FROM entity_search es
             WHERE es.entity_search MATCH ?1
               AND es.entity_id IN (SELECT entity_id FROM entity_index WHERE project_id = ?2 {} )
             ORDER BY es.rank
             LIMIT ?3",
            type_filter
        );

        // Execute query...
    }

    /// Cross-entity search with filters
    pub fn advanced_search(&self, filters: SearchFilters) -> Result<Vec<SearchResult>, String> {
        // Build dynamic query based on filters
    }
}

pub struct SearchResult {
    pub entity_id: Uuid,
    pub entity_type: String,
    pub name: String,
    pub rank: f64,
}
```

### 7.3 Automatic Index Updates

All projection tables update `entity_index` automatically via the projector pattern. Additionally, FTS5 triggers keep `entity_search` in sync.

**No manual FTS management needed.**

---

## 8. Versioned .pmp Format

### 8.1 Container Structure

```
project.pmp/                          ← Can be:
├── core.db                           ←   1. Folder (dev mode)
├── analytics.duckdb                  ←   2. Single SQLite file (legacy mode)
├── blobs/                            ←   3. Zip archive (distribution mode)
│   └── sha256/
│       ├── ab/
│       │   └── cdef1234567890abcdef...
│       └── 12/
│           └── 3456789abcdef012345...
├── index/
│   └── embeddings.lance/            ← Optional LanceDB vector index
└── manifest.json                     ← Entry point
```

### 8.2 manifest.json Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["format_version", "project_id", "created_at"],
  "properties": {
    "format_version": {
      "type": "string",
      "description": "Container format version",
      "enum": ["2.0"]
    },
    "app_version": {
      "type": "string",
      "description": "Application version that created/last modified this file"
    },
    "project_id": {
      "type": "string",
      "format": "uuid"
    },
    "created_at": {
      "type": "string",
      "format": "date-time"
    },
    "updated_at": {
      "type": "string",
      "format": "date-time"
    },
    "features": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": ["event_sourcing", "sync", "ai_analysis", "vector_search", "analytics"]
      }
    },
    "db_schema_version": {
      "type": "integer",
      "description": "SQLite schema version number"
    },
    "metadata_schema_version": {
      "type": "integer",
      "description": "Metadata registry schema version"
    },
    "device_id": {
      "type": "string",
      "description": "ID of the device that last modified this file"
    },
    "last_global_seq": {
      "type": "integer",
      "description": "Last event global_seq number written"
    }
  }
}
```

### 8.3 Format Version Handling

```rust
pub struct PmpContainer {
    pub path: PathBuf,
    pub manifest: Manifest,
}

impl PmpContainer {
    pub fn open(path: &Path) -> Result<Self, String> {
        let manifest = Self::read_manifest(path)?;

        // Check format compatibility
        if manifest.format_version != "2.0" {
            return Err(format!("Unsupported format version: {}", manifest.format_version));
        }

        // Run migrations if needed
        if manifest.db_schema_version < LATEST_SCHEMA_VERSION {
            Self::run_migrations(path, manifest.db_schema_version)?;
        }

        Ok(Self {
            path: path.to_path_buf(),
            manifest,
        })
    }

    pub fn save(&self) -> Result<(), String> {
        self.write_manifest()?;
        Ok(())
    }

    /// Package as .zip for distribution
    pub fn package_as_zip(&self, output_path: &Path) -> Result<(), String> {
        // Zip the entire folder
    }

    /// Extract from .zip
    pub fn extract_from_zip(zip_path: &Path, output_dir: &Path) -> Result<(), String> {
        // Unzip to folder
    }
}
```

### 8.4 Migration Engine

```rust
pub struct MigrationEngine {
    migrations: Vec<Box<dyn Migration>>,
}

pub trait Migration: Send + Sync {
    fn id(&self) -> i64;
    fn name(&self) -> &str;
    fn up(&self, conn: &Connection) -> Result<(), String>;
    fn down(&self, conn: &Connection) -> Result<(), String>;  // Optional
}

impl MigrationEngine {
    pub fn run(&self, conn: &Connection, from_version: i64) -> Result<i64, String> {
        let mut current = from_version;

        for migration in &self.migrations {
            if migration.id() <= current {
                continue;
            }

            println!("[Migration] Running: {}", migration.name());
            migration.up(conn)?;

            // Track migration
            conn.execute(
                "INSERT INTO migrations (migration_name, checksum) VALUES (?1, ?2)",
                params![migration.name(), migration.id()],
            ).map_err(|e| e.to_string())?;

            current = migration.id();
        }

        Ok(current)
    }
}
```

### 8.5 Blob Storage

```
blobs/
└── sha256/
    ├── ab/
    │   └── cdef1234567890abcdef1234567890abcdef1234567890abcdef12
    ├── 12/
    │   └── 3456789abcdef0123456789abcdef0123456789abcdef012345
    └── ff/
        └── 00112233445566778899aabbccddeeff00112233445566778899
```

**Advantages:**
- **Deduplication:** Same content = same hash = stored once
- **Integrity:** Hash verification on read
- **Sync-friendly:** Only transfer blobs not yet present on target
- **GC:** `reference_count = 0` → safe to delete

**Blob API:**
```rust
pub struct BlobStore {
    base_path: PathBuf,
}

impl BlobStore {
    pub fn store(&self, data: &[u8], original_filename: Option<&str>) -> Result<Uuid, String> {
        let sha256 = calculate_sha256(data);
        let blob_path = self.hash_to_path(&sha256);

        if !blob_path.exists() {
            std::fs::create_dir_all(blob_path.parent().unwrap())?;
            std::fs::write(&blob_path, data)?;
        }

        // Register in blob_registry
        let id = Uuid::new_v4();
        // ... INSERT into blob_registry
        Ok(id)
    }

    pub fn get(&self, blob_id: Uuid) -> Result<Vec<u8>, String> {
        // Lookup blob_path from blob_registry
        // Read file and verify SHA-256
        // Return data
    }

    pub fn gc(&self, conn: &Connection) -> Result<usize, String> {
        // Find blobs with reference_count = 0
        // Delete from disk and registry
    }
}
```

---

## 9. Sync Engine Architecture

### 9.1 Strategy: Event-Based Sync (NOT File Sync)

**Why event-based?**
- ✅ Supports offline-first: write locally, sync when online
- ✅ Conflict detection at event level
- ✅ Delta sync: only transfer new events
- ✅ Multi-device: each device has its own `device_id`
- ✅ Server is just an event aggregator (no business logic)

**Why NOT file sync?**
- ❌ Cannot handle concurrent writes
- ❌ No conflict resolution
- ❌ Must transfer entire file even for small changes
- ❌ No offline support

### 9.2 Sync Architecture

```
Device A                        Server                       Device B
────────                        ──────                       ──────

Local Event Store               Postgres Event Store         Local Event Store
┌──────────────┐                ┌──────────────┐             ┌──────────────┐
│ event 1 (seq│                │              │             │              │
│ event 2 (seq│                │              │             │              │
│ event 3 (seq│                │              │             │  event 10    │
│ event 4 (seq│                │              │             │  event 11    │
└──────┬───────┘                └──────┬───────┘             └──────┬───────┘
       │                               │                            │
       │  POST /push-events             │                            │
       │  since=last_pushed_seq        │                            │
       ├──────────────────────────────►│                            │
       │                               │                            │
       │  Store & merge events         │                            │
       │  Resolve conflicts            │                            │
       │                               │                            │
       │  200 OK (accepted count)      │                            │
       │◄──────────────────────────────┤                            │
       │                               │                            │
       │                               │   GET /pull-events         │
       │                               │   since=last_pulled_seq    │
       │                               │◄───────────────────────────┤
       │                               │                            │
       │                               │  Return new events         │
       │                               │───────────────────────────►│
       │                               │                            │
       │  GET /pull-events             │                            │
       │  since=last_pulled_seq        │                            │
       ├──────────────────────────────►│                            │
       │                               │                            │
       │  Return new events            │                            │
       │◄──────────────────────────────┤                            │
       │                               │                            │
       ▼                               ▼                            ▼
  Apply remote events             Store all                     Apply remote events
  to projection                   events                        to projection
```

### 9.3 Sync State Table

```sql
CREATE TABLE sync_state (
    device_id TEXT PRIMARY KEY,
    device_name TEXT,
    last_pushed_seq INTEGER DEFAULT 0,     -- Last event seq sent to server
    last_pulled_seq INTEGER DEFAULT 0,     -- Last event seq received from server
    last_sync_at TEXT,                     -- Last successful sync timestamp
    sync_status TEXT DEFAULT 'idle',       -- idle, syncing, error
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 9.4 Sync API (Client Side)

```rust
pub struct SyncEngine {
    event_store: Arc<EventStore>,
    server_url: String,
    http_client: reqwest::Client,
}

impl SyncEngine {
    /// Push local events to server
    pub async fn push_events(&self) -> Result<PushResult, String> {
        let sync_state = self.event_store.get_sync_state()?;
        let events = self.event_store.get_events_since(sync_state.last_pushed_seq)?;

        if events.is_empty() {
            return Ok(PushResult { pushed: 0 });
        }

        let response = self.http_client
            .post(&format!("{}/push-events", self.server_url))
            .json(&PushRequest {
                device_id: self.event_store.device_id.clone(),
                events: events.clone(),
                since_seq: sync_state.last_pushed_seq,
            })
            .send()
            .await
            .map_err(|e| e.to_string())?;

        let result: PushResponse = response.json().await.map_err(|e| e.to_string())?;

        // Update sync state
        let max_seq = events.iter().map(|e| e.global_seq).max().unwrap_or(0);
        self.event_store.update_sync_state(max_seq, sync_state.last_pulled_seq)?;

        Ok(PushResult { pushed: events.len() })
    }

    /// Pull remote events from server
    pub async fn pull_events(&self) -> Result<PullResult, String> {
        let sync_state = self.event_store.get_sync_state()?;

        let response = self.http_client
            .get(&format!("{}/pull-events", self.server_url))
            .query(&[("since", sync_state.last_pulled_seq)])
            .send()
            .await
            .map_err(|e| e.to_string())?;

        let result: PullResponse = response.json().await.map_err(|e| e.to_string())?;

        // Apply remote events locally
        for event in &result.events {
            self.apply_remote_event(event)?;
        }

        // Update sync state
        let max_seq = result.events.iter().map(|e| e.global_seq).max().unwrap_or(0);
        self.event_store.update_sync_state(sync_state.last_pushed_seq, max_seq)?;

        Ok(PullResult { pulled: result.events.len() })
    }

    /// Full sync cycle
    pub async fn sync(&self) -> Result<SyncResult, String> {
        let push = self.push_events().await?;
        let pull = self.pull_events().await?;

        Ok(SyncResult {
            pushed: push.pushed,
            pulled: pull.pulled,
        })
    }

    fn apply_remote_event(&self, event: &EventEnvelope) -> Result<(), String> {
        // Check for conflicts (same entity, same version, different device)
        if self.has_conflict(event)? {
            self.resolve_conflict(event)?;
        }

        // Apply to event_store
        // Apply to projection
    }

    fn has_conflict(&self, event: &EventEnvelope) -> Result<bool, String> {
        // Check if we have an event for same entity at same version from different device
    }

    fn resolve_conflict(&self, remote_event: &EventEnvelope) -> Result<(), String> {
        // MVP: Last-write-wins (by global_seq)
        // Advanced: Per-entity version vectors
        // Best: CRDT merge
    }
}
```

### 9.5 Server API (PostgreSQL)

```rust
// Server side: Postgres event store
// POST /push-events
#[post("/push-events")]
async fn push_events(
    pool: web::Data<PgPool>,
    request: web::Json<PushRequest>,
) -> impl Responder {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    let mut accepted = 0;
    for event in &request.events {
        // Check if event already exists (idempotent)
        let exists = sqlx::query_scalar!(
            "SELECT EXISTS(SELECT 1 FROM event_store WHERE id = $1)",
            event.id
        )
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        if !exists {
            // Check for conflicts
            let conflict = sqlx::query!(
                "SELECT id FROM event_store
                 WHERE entity_type = $1 AND entity_id = $2 AND version = $3 AND device_id != $4",
                event.entity_type, event.entity_id, event.version, request.device_id
            )
            .fetch_optional(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

            if let Some(conflict_event) = conflict {
                // Conflict detected: server decides (MVP: accept first)
                continue;
            }

            // Store event
            sqlx::query!(
                "INSERT INTO event_store (id, project_id, entity_type, entity_id, event_type,
                 payload_json, metadata_json, version, global_seq, device_id, correlation_id,
                 causation_id, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)",
                event.id, event.project_id, event.entity_type, event.entity_id,
                event.entity_type, event.payload_json, event.metadata_json,
                event.version, event.global_seq, event.device_id, event.correlation_id,
                event.causation_id, event.created_at
            )
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

            accepted += 1;
        }
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    HttpResponse::Ok().json(PushResponse { accepted })
}

// GET /pull-events
#[get("/pull-events")]
async fn pull_events(
    pool: web::Data<PgPool>,
    query: web::Query<PullQuery>,
) -> impl Responder {
    let events = sqlx::query_as!(
        EventEnvelope,
        "SELECT id, project_id, entity_type, entity_id, event_type as event,
         payload_json, metadata_json, version, global_seq, device_id,
         correlation_id, causation_id, created_at
         FROM event_store
         WHERE global_seq > $1
         ORDER BY global_seq ASC
         LIMIT 1000",
        query.since
    )
    .fetch_all(pool.get_ref())
    .await
    .map_err(|e| e.to_string())?;

    HttpResponse::Ok().json(PullResponse { events })
}
```

### 9.6 Conflict Resolution Strategies

| Strategy | Complexity | Use Case |
|----------|------------|----------|
| **Last-Write-Wins** | Simple | MVP, low-conflict scenarios |
| **Per-Entity Version** | Medium | Most business applications |
| **Version Vectors** | Complex | High-concurrency environments |
| **CRDT** | Very Complex | Real-time collaborative editing |

**MVP Recommendation:** Last-Write-Wins with `global_seq` as tiebreaker.

**Recommended Path:**
```
Phase 1: Last-Write-Wins
    ↓
Phase 2: Per-Entity Version (reject if mismatch)
    ↓
Phase 3: CRDT for text fields (optional)
```

### 9.7 Offline-First Logic

```rust
pub struct OfflineQueue {
    pending_events: Vec<EventEnvelope>,
    is_online: AtomicBool,
}

impl OfflineQueue {
    /// Queue event for later sync
    pub fn enqueue(&mut self, event: EventEnvelope) {
        self.pending_events.push(event);
    }

    /// Mark device as online and sync
    pub async fn go_online(&mut self, sync_engine: &SyncEngine) -> Result<(), String> {
        self.is_online.store(true, Ordering::SeqCst);

        // Sync all pending events
        for event in self.pending_events.drain(..) {
            // Push to server
        }

        // Continue periodic sync
        loop {
            if !self.is_online.load(Ordering::SeqCst) {
                break;
            }
            sync_engine.sync().await.ok();
            tokio::time::sleep(Duration::from_secs(60)).await;
        }

        Ok(())
    }

    /// Mark device as offline
    pub fn go_offline(&mut self) {
        self.is_online.store(false, Ordering::SeqCst);
    }
}
```

### 9.8 Blob Sync

```rust
impl SyncEngine {
    /// Sync blobs (content-addressable)
    pub async fn sync_blobs(&self, missing_hashes: Vec<String>) -> Result<usize, String> {
        let mut synced = 0;

        for hash in missing_hashes {
            // Check if we already have this blob
            if self.blob_store.has_hash(&hash) {
                continue;
            }

            // Download from server
            let data = self.http_client
                .get(&format!("{}/download-blob/{}", self.server_url, hash))
                .send()
                .await
                .map_err(|e| e.to_string())?
                .bytes()
                .await
                .map_err(|e| e.to_string())?;

            // Verify hash
            let actual_hash = calculate_sha256(&data);
            if actual_hash != hash {
                return Err("Hash mismatch on blob download".to_string());
            }

            // Store locally
            self.blob_store.store(&data, None)?;
            synced += 1;
        }

        Ok(synced)
    }
}
```

---

## 10. Actor Model Pipeline

### 10.1 Overview

Replace direct function calls with an actor-based pipeline for data processing. Each actor handles one stage of the pipeline and communicates via message queues.

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│Ingestion │───►│ Parsing  │───►│ AI       │───►│Normalize │───►│ Storage  │
│ Actor    │    │ Actor    │    │ Analysis │    │ Actor    │    │ Actor    │
│          │    │          │    │ Actor    │    │          │    │          │
│ Receives │    │ Parses   │    │ Embeds,  │    │ Cleans,  │    │ Writes   │
│ files    │    │ Excel,   │    │ extracts,│    │ validates│    │ events   │
│ from UI  │    │ KML,     │    │ corrects │    │ maps     │    │ to store │
│          │    │ KMZ      │    │          │    │          │    │          │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
```

### 10.2 Actor Base

```rust
use tokio::sync::mpsc;

pub trait Actor: Send + 'static {
    type Message: Send + 'static;
    type Response: Send + 'static;

    fn name(&self) -> &str;

    /// Process a single message
    async fn handle(&mut self, msg: Self::Message) -> Option<Self::Response>;

    /// Called when actor starts
    async fn start(&mut self) {}

    /// Called when actor stops
    async fn stop(&mut self) {}
}

pub struct ActorHandle<M, R> {
    tx: mpsc::Sender<ActorMessage<M, R>>,
}

struct ActorMessage<M, R> {
    payload: M,
    reply_tx: tokio::sync::oneshot::Sender<Option<R>>,
}

pub fn spawn_actor<A: Actor>(mut actor: A, capacity: usize) -> ActorHandle<A::Message, A::Response> {
    let (tx, mut rx) = mpsc::channel::<ActorMessage<A::Message, A::Response>>(capacity);

    tokio::spawn(async move {
        actor.start().await;

        while let Some(msg) = rx.recv().await {
            let response = actor.handle(msg.payload).await;
            let _ = msg.reply_tx.send(response);
        }

        actor.stop().await;
    });

    ActorHandle { tx }
}

impl<M, R> ActorHandle<M, R> {
    pub async fn send(&self, msg: M) -> Option<R> {
        let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
        self.tx.send(ActorMessage { payload: msg, reply_tx }).await.ok()?;
        reply_rx.await.ok()?
    }
}
```

### 10.3 Ingestion Actor

```rust
pub struct IngestionActor {
    event_store: Arc<EventStore>,
    parsing_handle: ActorHandle<ParsingMessage, ParsingResponse>,
}

pub struct IngestionMessage {
    pub file_path: PathBuf,
    pub project_id: Uuid,
    pub correlation_id: Uuid,
}

pub struct IngestionResponse {
    pub success: bool,
    pub message: String,
}

impl Actor for IngestionActor {
    type Message = IngestionMessage;
    type Response = IngestionResponse;

    fn name(&self) -> &str { "IngestionActor" }

    async fn handle(&mut self, msg: Self::Message) -> Option<Self::Response> {
        let extension = msg.file_path.extension()?.to_str()?.to_lowercase();

        let parsing_msg = ParsingMessage {
            file_path: msg.file_path,
            project_id: msg.project_id,
            correlation_id: msg.correlation_id,
            format: extension,
        };

        let result = self.parsing_handle.send(parsing_msg).await?;

        Some(IngestionResponse {
            success: result.success,
            message: result.message,
        })
    }
}
```

### 10.4 Parsing Actor

```rust
pub struct ParsingActor {
    ai_handle: ActorHandle<AIAnalysisMessage, AIAnalysisResponse>,
}

pub struct ParsingMessage {
    pub file_path: PathBuf,
    pub project_id: Uuid,
    pub correlation_id: Uuid,
    pub format: String,
}

pub struct ParsingResponse {
    pub success: bool,
    pub message: String,
    pub dataset_meta: Option<DatasetMeta>,
    pub feature_count: usize,
}

impl Actor for ParsingActor {
    type Message = ParsingMessage;
    type Response = ParsingResponse;

    fn name(&self) -> &str { "ParsingActor" }

    async fn handle(&mut self, msg: Self::Message) -> Option<Self::Response> {
        // Parse based on format
        let (dataset_meta, records) = match msg.format.as_str() {
            "xlsx" | "xls" => self.parse_excel(&msg.file_path)?,
            "kml" => self.parse_kml(&msg.file_path)?,
            "kmz" => self.parse_kmz(&msg.file_path)?,
            _ => return Some(ParsingResponse { success: false, message: "Unsupported format".to_string(), dataset_meta: None, feature_count: 0 }),
        };

        let feature_count = records.len();

        // Forward to AI analysis
        let ai_msg = AIAnalysisMessage {
            records,
            project_id: msg.project_id,
            correlation_id: msg.correlation_id,
            dataset_meta: dataset_meta.clone(),
        };

        let ai_result = self.ai_handle.send(ai_msg).await?;

        // Emit DatasetImported event
        Some(ParsingResponse {
            success: true,
            message: format!("Imported {} features", feature_count),
            dataset_meta: Some(dataset_meta),
            feature_count,
        })
    }
}
```

### 10.5 AI Analysis Actor

```rust
pub struct AIAnalysisActor {
    embedding_model: Option<Arc<EmbeddingModel>>,  // ONNX model
    normalize_handle: ActorHandle<NormalizationMessage, NormalizationResponse>,
}

pub struct AIAnalysisMessage {
    pub records: Vec<FeatureRecord>,
    pub project_id: Uuid,
    pub correlation_id: Uuid,
    pub dataset_meta: DatasetMeta,
}

pub struct AIAnalysisResponse {
    pub success: bool,
    pub message: String,
}

impl Actor for AIAnalysisActor {
    type Message = AIAnalysisMessage;
    type Response = AIAnalysisResponse;

    fn name(&self) -> &str { "AIAnalysisActor" }

    async fn handle(&mut self, msg: Self::Message) -> Option<Self::Response> {
        let mut processed_records = Vec::new();

        for record in msg.records {
            // Generate embedding for text fields
            if let Some(model) = &self.embedding_model {
                let text = record.properties.values().cloned().collect::<Vec<_>>().join(" ");
                let embedding = model.encode(&text)?;

                // Store embedding in ai_corrections
                // TODO: Migrate to LanceDB vector store
            }

            // AI extraction (contract metadata, BOM, etc.)
            // ... existing AI logic

            processed_records.push(record);
        }

        // Forward to normalization
        let norm_msg = NormalizationMessage {
            records: processed_records,
            project_id: msg.project_id,
            correlation_id: msg.correlation_id,
            dataset_meta: msg.dataset_meta,
        };

        self.normalize_handle.send(norm_msg).await?;

        Some(AIAnalysisResponse {
            success: true,
            message: format!("Analyzed {} records", processed_records.len()),
        })
    }
}
```

### 10.6 Normalization Actor

```rust
pub struct NormalizationActor {
    storage_handle: ActorHandle<StorageMessage, StorageResponse>,
}

pub struct NormalizationMessage {
    pub records: Vec<FeatureRecord>,
    pub project_id: Uuid,
    pub correlation_id: Uuid,
    pub dataset_meta: DatasetMeta,
}

pub struct NormalizationResponse {
    pub success: bool,
    pub message: String,
}

impl Actor for NormalizationActor {
    type Message = NormalizationMessage;
    type Response = NormalizationResponse;

    fn name(&self) -> &str { "NormalizationActor" }

    async fn handle(&mut self, msg: Self::Message) -> Option<Self::Response> {
        // Normalize field names
        // Standardize values
        // Validate against metadata_registry schemas
        // Deduplicate records

        let normalized_records = msg.records.into_iter()
            .map(|r| self.normalize_record(r))
            .collect::<Vec<_>>();

        // Forward to storage
        let storage_msg = StorageMessage {
            records: normalized_records,
            project_id: msg.project_id,
            correlation_id: msg.correlation_id,
            dataset_meta: msg.dataset_meta,
        };

        self.storage_handle.send(storage_msg).await?;

        Some(NormalizationResponse {
            success: true,
            message: format!("Normalized {} records", normalized_records.len()),
        })
    }
}
```

### 10.7 Storage Actor

```rust
pub struct StorageActor {
    event_store: Arc<EventStore>,
    projection_engine: Arc<ProjectionEngine>,
}

pub struct StorageMessage {
    pub records: Vec<FeatureRecord>,
    pub project_id: Uuid,
    pub correlation_id: Uuid,
    pub dataset_meta: DatasetMeta,
}

pub struct StorageResponse {
    pub success: bool,
    pub message: String,
}

impl Actor for StorageActor {
    type Message = StorageMessage;
    type Response = StorageResponse;

    fn name(&self) -> &str { "StorageActor" }

    async fn handle(&mut self, msg: Self::Message) -> Option<Self::Response> {
        let correlation_id = Some(msg.correlation_id);
        let mut stored_count = 0;

        // Begin batch transaction
        for record in msg.records {
            // Create FeatureCreated event
            let event = AppEvent::FeatureCreated {
                layer_id: Uuid::nil(),  // TODO: resolve layer
                group_id: None,
                name: record.properties.get("name").cloned().unwrap_or_default(),
                geom_type: record.geom_type,
                geometry: record.geometry,
                properties: serde_json::to_value(&record.properties).unwrap_or_default(),
                style_id: None,
            };

            let feature_id = Uuid::new_v4();  // TODO: use record.id if present

            match self.event_store.append(event, "feature", feature_id) {
                Ok(envelope) => {
                    // Apply projection
                    self.projection_engine.process_event(&envelope).ok();
                    stored_count += 1;
                }
                Err(e) => {
                    eprintln!("[StorageActor] Failed to store feature: {}", e);
                }
            }
        }

        // Emit DatasetImported event
        let import_event = AppEvent::DatasetImported {
            dataset_id: msg.dataset_meta.dataset_id,
            feature_count: stored_count,
            metadata: serde_json::to_value(&msg.dataset_meta).unwrap_or_default(),
        };

        self.event_store.append(import_event, "dataset", Uuid::new_v4()).ok();

        Some(StorageResponse {
            success: true,
            message: format!("Stored {} features", stored_count),
        })
    }
}
```

### 10.8 Pipeline Orchestration

```rust
pub struct Pipeline {
    ingestion_handle: ActorHandle<IngestionMessage, IngestionResponse>,
}

impl Pipeline {
    pub fn new(
        event_store: Arc<EventStore>,
        projection_engine: Arc<ProjectionEngine>,
    ) -> Self {
        // Create actors in dependency order
        let storage_actor = StorageActor {
            event_store: event_store.clone(),
            projection_engine: projection_engine.clone(),
        };
        let storage_handle = spawn_actor(storage_actor, 100);

        let normalize_actor = NormalizationActor {
            storage_handle,
        };
        let normalize_handle = spawn_actor(normalize_actor, 100);

        let ai_actor = AIAnalysisActor {
            embedding_model: None,  // Load ONNX model
            normalize_handle,
        };
        let ai_handle = spawn_actor(ai_actor, 50);

        let parsing_actor = ParsingActor {
            ai_handle,
        };
        let parsing_handle = spawn_actor(parsing_actor, 50);

        let ingestion_actor = IngestionActor {
            event_store,
            parsing_handle,
        };
        let ingestion_handle = spawn_actor(ingestion_actor, 20);

        Self { ingestion_handle }
    }

    pub async fn import_file(&self, file_path: PathBuf, project_id: Uuid) -> Result<IngestionResponse, String> {
        let correlation_id = Uuid::new_v4();
        let msg = IngestionMessage {
            file_path,
            project_id,
            correlation_id,
        };

        self.ingestion_handle.send(msg).await
            .ok_or_else(|| "Pipeline unavailable".to_string())
    }
}
```

---

## 11. AI & Vector Search Architecture

### 11.1 Current State

| Component | Status | Issue |
|-----------|--------|-------|
| `ai_corrections` table | Stored but not queried | No vector similarity search |
| Embeddings (ONNX) | Stored as BLOB in SQLite | Cannot do nearest-neighbor |
| LanceDB | Optional dependency | Not integrated |
| Semantic search | Not implemented | Only FTS5 text search |

### 11.2 V2 AI Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      AI Pipeline                             │
│                                                              │
│  Text Content                                                 │
│       │                                                       │
│       ▼                                                       │
│  ┌──────────────┐                                            │
│  │ Embedding     │  ONNX (all-MiniLM-L6-v2, 384-dim)        │
│  │ Generation    │                                            │
│  └──────┬───────┘                                            │
│         │                                                      │
│         ▼                                                      │
│  ┌──────────────┐    ┌──────────────┐                         │
│  │ LanceDB       │    │ ai_corrections│                        │
│  │ Vector Store  │    │ (correction  │                        │
│  │ (embeddings)  │◄──►│  history)    │                        │
│  └──────┬───────┘    └──────────────┘                         │
│         │                                                      │
│         ▼                                                      │
│  ┌──────────────┐                                            │
│  │ Semantic     │  Similar embeddings → similar content      │
│  │ Search       │                                            │
│  └──────────────┘                                            │
│                                                              │
│  ┌──────────────┐                                            │
│  │ AI Learning  │  Use ai_corrections to fine-tune           │
│  │ Loop         │  extraction prompts                        │
│  └──────────────┘                                            │
└─────────────────────────────────────────────────────────────┘
```

### 11.3 LanceDB Integration

```rust
#[cfg(feature = "vector-db")]
pub struct VectorStore {
    db: lancedb::Connection,
    embedding_model: Arc<EmbeddingModel>,
}

#[cfg(feature = "vector-db")]
impl VectorStore {
    pub async fn new(base_path: &Path) -> Result<Self, String> {
        let db = lancedb::connect(base_path.join("index"))
            .execute()
            .await
            .map_err(|e| e.to_string())?;

        // Create or open embedding table
        // Schema: [entity_id: Utf8, entity_type: Utf8, embedding: FixedSizeList(384), text: Utf8]

        Ok(Self {
            db,
            embedding_model: Arc::new(EmbeddingModel::new()?),
        })
    }

    pub async fn add_embedding(&self, entity_id: Uuid, entity_type: &str, text: &str) -> Result<(), String> {
        let embedding = self.embedding_model.encode(text)?;

        // Insert into LanceDB
        // ...
        Ok(())
    }

    pub async fn search_similar(&self, query_text: &str, limit: usize) -> Result<Vec<VectorSearchResult>, String> {
        let query_embedding = self.embedding_model.encode(query_text)?;

        // Search LanceDB
        // ...
        Ok(results)
    }
}
```

### 11.4 Semantic Search API

```rust
pub enum SearchMode {
    FullText,       // FTS5 (fast, keyword-based)
    Semantic,       // Vector similarity (slower, meaning-based)
    Hybrid,         // Both combined
}

impl SearchEngine {
    pub async fn search(&self, query: &str, mode: SearchMode, project_id: Uuid, limit: usize)
        -> Result<Vec<SearchResult>, String>
    {
        match mode {
            SearchMode::FullText => self.fulltext_search(query, project_id, limit),
            SearchMode::Semantic => self.semantic_search(query, project_id, limit).await,
            SearchMode::Hybrid => self.hybrid_search(query, project_id, limit).await,
        }
    }
}
```

---

## 12. Migration Strategy V1 → V2

### 12.1 Migration Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Migration Pipeline                             │
│                                                                  │
│  V1 .pmp (SQLite)                                                │
│  ├── projects (INTEGER id)                                       │
│  ├── files (INTEGER id)                                          │
│  ├── design_events (GIS only)                                    │
│  └── ...                                                         │
│       │                                                           │
│       ▼                                                           │
│  ┌──────────────────────────────────────────┐                   │
│  │  Migration Runner                         │                   │
│  │                                           │                   │
│  │  1. Backup original .pmp                  │                   │
│  │  2. Create V2 schema                       │                   │
│  │  3. Convert INTEGER → UUID                │                   │
│  │  4. Rebuild event_store from:             │                   │
│  │     - design_events → event_store         │                   │
│  │     - Reconstruct CRUD events from state  │                   │
│  │  5. Rebuild projections                   │                   │
│  │  6. Rebuild entity_index from FTS5        │                   │
│  │  7. Create manifest.json                  │                   │
│  │  8. Verify integrity                      │                   │
│  │  9. Remove V1 tables                      │                   │
│  └──────────────────────────────────────────┘                   │
│       │                                                           │
│       ▼                                                           │
│  V2 .pmp (Folder or SQLite)                                      │
│  ├── core.db (UUID IDs)                                          │
│  ├── manifest.json                                               │
│  └── ...                                                         │
└──────────────────────────────────────────────────────────────────┘
```

### 12.2 Migration Steps (Detailed)

#### Step 1: Backup
```rust
fn backup_original_pmp(v1_path: &Path) -> Result<PathBuf, String> {
    let backup_path = v1_path.with_extension("pmp.v1.bak");
    std::fs::copy(v1_path, &backup_path)?;
    Ok(backup_path)
}
```

#### Step 2: Create V2 Schema
```rust
fn create_v2_schema(conn: &Connection) -> Result<(), String> {
    // Run all CREATE TABLE statements from Section 3
    // Include migrations table
    // Set PRAGMA user_version = 5
    Ok(())
}
```

#### Step 3: Convert INTEGER → UUID

```rust
fn migrate_ids(conn: &Connection) -> Result<HashMap<String, HashMap<i64, Uuid>>, String> {
    let mut id_map = HashMap::new();

    // Projects
    let mut project_map = HashMap::new();
    let mut stmt = conn.prepare("SELECT id FROM projects").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |r| r.get::<_, i64>(0)).map_err(|e| e.to_string())?;
    for row in rows {
        let old_id = row.map_err(|e| e.to_string())?;
        let new_id = Uuid::new_v4();
        project_map.insert(old_id, new_id);
        conn.execute(
            "UPDATE projects SET id = ?1 WHERE id = ?2",
            params![new_id.to_string(), old_id],
        ).map_err(|e| e.to_string())?;
    }
    id_map.insert("projects".to_string(), project_map);

    // Repeat for all tables...
    // files, tasks, personnel, contracts, etc.

    // Update foreign keys
    for (table, fk_columns) in FK_MAPPING.iter() {
        for column in fk_columns {
            let ref_table = get_reference_table(table, column);
            if let Some(ref_map) = id_map.get(ref_table) {
                update_fk(conn, table, column, ref_map)?;
            }
        }
    }

    Ok(id_map)
}
```

#### Step 4: Rebuild Event Store

```rust
fn rebuild_event_store(conn: &Connection, id_map: &HashMap<String, HashMap<i64, Uuid>>) -> Result<(), String> {
    // 4a: Convert design_events → event_store
    let mut stmt = conn.prepare(
        "SELECT event_id, project_id, event_type, payload_json, timestamp, is_undone
         FROM design_events ORDER BY timestamp ASC"
    ).map_err(|e| e.to_string())?;

    let events = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, i64>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, bool>(5)?,
        ))
    }).map_err(|e| e.to_string())?;

    let mut global_seq = 0;
    for event_row in events {
        let (event_id, old_project_id, event_type, payload_json, timestamp, is_undone) = event_row.map_err(|e| e.to_string())?;

        if is_undone {
            continue;  // Skip undone events
        }

        let project_uuid = id_map.get("projects").and_then(|m| m.get(&old_project_id)).copied().unwrap_or_else(Uuid::new_v4);

        // Parse payload and convert to AppEvent
        let payload: serde_json::Value = serde_json::from_str(&payload_json).unwrap_or_default();
        let app_event = convert_design_event_to_app_event(&event_type, &payload)?;

        // Determine entity_type and entity_id from payload
        let (entity_type, entity_id) = extract_entity_info(&payload, &id_map)?;

        // Get version for this entity
        let version = get_entity_version(conn, &entity_type, &entity_id)?;

        // Insert into event_store
        conn.execute(
            "INSERT INTO event_store (id, project_id, entity_type, entity_id, event_type, payload_json, version, global_seq, device_id, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'migration', ?9)",
            params![event_id, project_uuid.to_string(), entity_type, entity_id.to_string(), app_event_type(&app_event), payload_json, version, global_seq, timestamp],
        ).map_err(|e| e.to_string())?;

        global_seq += 1;
    }

    // 4b: Reconstruct events from table state (INSERT events for existing records)
    reconstruct_insert_events(conn, &id_map)?;

    Ok(())
}
```

#### Step 5: Rebuild Projections
```rust
fn rebuild_projections(conn: &Connection, projection_engine: &ProjectionEngine, project_id: Uuid) -> Result<(), String> {
    projection_engine.rebuild_all(project_id)?;
    Ok(())
}
```

#### Step 6: Rebuild Entity Index
```rust
fn rebuild_entity_index(conn: &Connection) -> Result<(), String> {
    // Clear entity_index
    conn.execute("DELETE FROM entity_index", []).map_err(|e| e.to_string())?;

    // Populate from all projection tables
    conn.execute(
        "INSERT INTO entity_index (entity_id, entity_type, project_id, name, search_vector, updated_at)
         SELECT id, 'task', project_id, name, name, updated_at FROM tasks",
        [],
    ).map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO entity_index (entity_id, entity_type, project_id, name, search_vector, updated_at)
         SELECT id, 'file', project_id, filename, filename, updated_at FROM files",
        [],
    ).map_err(|e| e.to_string())?;

    // Repeat for features, notes, etc.

    // FTS5 will auto-populate via triggers
    Ok(())
}
```

#### Step 7: Create manifest.json
```rust
fn create_manifest(pmp_path: &Path, project_id: Uuid, last_global_seq: i64) -> Result<(), String> {
    let manifest = Manifest {
        format_version: "2.0".to_string(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        project_id,
        created_at: chrono::Utc::now(),
        updated_at: chrono::Utc::now(),
        features: vec!["event_sourcing".to_string()],
        db_schema_version: 5,
        metadata_schema_version: 1,
        device_id: "migration".to_string(),
        last_global_seq,
    };

    let manifest_path = if pmp_path.is_dir() {
        pmp_path.join("manifest.json")
    } else {
        // For single-file mode, store in same directory
        pmp_path.with_extension("pmp.manifest.json")
    };

    std::fs::write(manifest_path, serde_json::to_string_pretty(&manifest)?)?;
    Ok(())
}
```

#### Step 8: Verify Integrity
```rust
fn verify_migration(conn: &Connection, project_id: Uuid) -> Result<MigrationReport, String> {
    let mut report = MigrationReport::default();

    // Check event_store has events
    report.event_count = conn.query_row(
        "SELECT COUNT(*) FROM event_store WHERE project_id = ?",
        params![project_id.to_string()],
        |r| r.get(0),
    ).unwrap_or(0);

    // Check projections match events
    report.task_count = conn.query_row(
        "SELECT COUNT(*) FROM tasks WHERE project_id = ?",
        params![project_id.to_string()],
        |r| r.get(0),
    ).unwrap_or(0);

    // Check entity_index
    report.index_count = conn.query_row(
        "SELECT COUNT(*) FROM entity_index WHERE project_id = ?",
        params![project_id.to_string()],
        |r| r.get(0),
    ).unwrap_or(0);

    // Validate foreign keys
    let fk_violations = conn.query_row("PRAGMA foreign_key_check", [], |r| r.get(0)).unwrap_or(0);
    report.fk_violations = fk_violations;

    report.success = report.event_count > 0 && report.fk_violations == 0;

    Ok(report)
}
```

#### Step 9: Remove V1 Tables
```rust
fn cleanup_v1_tables(conn: &Connection) -> Result<(), String> {
    let v1_tables = vec![
        "design_events",
        "design_snapshots",
        "content_index",
        "file_search",
        "task_search",
        "note_search",
        "task_dependencies",
    ];

    for table in v1_tables {
        conn.execute(&format!("DROP TABLE IF EXISTS {}", table), []).ok();
    }

    Ok(())
}
```

### 12.3 Migration Rollback Plan

```rust
fn rollback_migration(backup_path: &Path, original_path: &Path) -> Result<(), String> {
    // Restore backup
    std::fs::copy(backup_path, original_path)?;

    // Remove manifest
    let manifest_path = original_path.with_extension("pmp.manifest.json");
    if manifest_path.exists() {
        std::fs::remove_file(manifest_path)?;
    }

    Ok(())
}
```

---

## 13. Implementation Roadmap

### Phase 1: Foundation (Weeks 1-4)

**Goal:** Standardize event_store, build projection engine, migrate V1 → V2

| Week | Task | Deliverable |
|------|------|-------------|
| 1 | Design V2 schema | ✅ Schema SQL files |
| 1 | Create event_store table | ✅ Event append API |
| 1 | Create EventEnvelope, AppEvent types | ✅ Rust types |
| 2 | Build ProjectionEngine | ✅ Projector trait + TaskProjector |
| 2 | Create metadata_registry | ✅ Default schemas seeded |
| 2 | Create entity_index + FTS5 | ✅ Unified search |
| 3 | Build migration engine | ✅ Migration runner |
| 3 | Implement V1 → V2 migration | ✅ Tested migration |
| 4 | Replace design_events → event_store | ✅ FeatureProjector |
| 4 | Remove V1 code paths | ❌ No V1 fallback |

**Success Criteria:**
- ✅ Can migrate V1 .pmp → V2 .pmp
- ✅ All projections rebuild from event_store
- ✅ No V1 tables or code paths remain

### Phase 2: Storage & Format (Weeks 5-10)

**Goal:** metadata_registry, new .pmp format, blob storage

| Week | Task | Deliverable |
|------|------|-------------|
| 5 | Implement full metadata_registry | ✅ Schema validation at event time |
| 5 | Register all entity schemas | ✅ 7 default schemas |
| 6 | Implement .pmp folder format | ✅ manifest.json |
| 6 | Zip/unzip support | ✅ Package/extract |
| 7 | Implement blob_registry | ✅ SHA-256 storage |
| 7 | Implement BlobStore | ✅ Content-addressable blobs |
| 8 | Convert files table to use blob_id | ✅ Blob references |
| 8 | Implement blob GC | ✅ Reference counting |
| 9 | Add `current_version` to all tables | ✅ Version tracking |
| 9 | UUID migration for all tables | ✅ No more INTEGER IDs |
| 10 | Update all Tauri commands to UUID | ✅ Frontend compatibility |

**Success Criteria:**
- ✅ .pmp is versioned container with manifest
- ✅ Blobs are deduplicated and integrity-checked
- ✅ All entities use UUIDs

### Phase 3: Sync Engine (Weeks 11-18)

**Goal:** Basic multi-device sync, server API, conflict resolution

| Week | Task | Deliverable |
|------|------|-------------|
| 11 | Design server schema (PostgreSQL) | ✅ Server event_store |
| 11 | Implement push-events API | ✅ Idempotent event storage |
| 12 | Implement pull-events API | ✅ Delta sync |
| 12 | Implement client SyncEngine | ✅ push_events, pull_events |
| 13 | Implement OfflineQueue | ✅ Queue while offline |
| 13 | Implement background sync loop | ✅ Periodic sync |
| 14 | Implement conflict detection | ✅ Same entity, same version |
| 14 | Implement Last-Write-Wins resolution | ✅ By global_seq |
| 15 | Implement blob sync | ✅ Missing blob detection |
| 15 | Implement device_id generation | ✅ Per-device unique ID |
| 16 | Test 2-device sync | ✅ E2E test |
| 16 | Test conflict scenarios | ✅ Conflict resolution test |
| 17 | Add sync status UI | ✅ Frontend sync indicator |
| 17 | Add error handling & retry | ✅ Resilient sync |
| 18 | Server deployment | ✅ Docker/PM2 |

**Success Criteria:**
- ✅ 2 devices can sync via server
- ✅ Conflicts resolved automatically
- ✅ Blobs sync correctly
- ✅ Offline mode works

### Phase 4: AI & Product (Weeks 19+)

**Goal:** AI pipeline with actors, vector search, productization

| Week | Task | Deliverable |
|------|------|-------------|
| 19 | Implement Actor base | ✅ spawn_actor, ActorHandle |
| 19 | Implement IngestionActor | ✅ File intake |
| 20 | Implement ParsingActor | ✅ Excel, KML, KMZ |
| 20 | Implement AIAnalysisActor | ✅ Embeddings, extraction |
| 21 | Implement NormalizationActor | ✅ Data cleaning |
| 21 | Implement StorageActor | ✅ Event writing |
| 22 | Integrate LanceDB | ✅ Vector store |
| 22 | Implement semantic search | ✅ Hybrid search mode |
| 23 | Build embedding cache | ✅ Moka cache |
| 23 | AI learning loop | ✅ Use ai_corrections |
| 24 | Plugin system design | ✅ Plugin trait |
| 24 | Product SKU definition | ✅ Free/Pro/Enterprise |
| 25+ | Ongoing features | ✅ Per roadmap |

**Success Criteria:**
- ✅ Actor pipeline processes imports end-to-end
- ✅ Semantic search returns relevant results
- ✅ Plugin system allows extensibility
- ✅ Product SKUs defined

### Phase Dependencies

```
Phase 1 (Foundation)
    ↓
Phase 2 (Storage & Format)
    ↓
Phase 3 (Sync Engine) ← Can start Phase 4 in parallel after Week 14
    ↓
Phase 4 (AI & Product)
```

---

## 14. Product SKU & Licensing

### 14.1 SKU Matrix

| Feature | Free | Pro | Enterprise |
|---------|------|-----|------------|
| Local .pmp | ✅ | ✅ | ✅ |
| Event Sourcing | ✅ | ✅ | ✅ |
| AI Analysis | ❌ | ✅ | ✅ |
| Multi-Device Sync | ❌ | ✅ | ✅ |
| Vector Search | ❌ | ✅ | ✅ |
| Server Deployment | ❌ | ❌ | ✅ |
| Multi-User | ❌ | ❌ | ✅ |
| RBAC | Basic | Full | Full |
| Audit Logs | 30 days | Unlimited | Unlimited |
| Support | Community | Priority | Dedicated |

### 14.2 Feature Flags

```rust
pub struct FeatureFlags {
    pub event_sourcing: bool,       // Always true
    pub ai_analysis: bool,          // Pro+
    pub multi_device_sync: bool,    // Pro+
    pub vector_search: bool,        // Pro+
    pub server_deployment: bool,    // Enterprise
    pub multi_user: bool,           // Enterprise
}

impl FeatureFlags {
    pub fn from_license(license: &License) -> Self {
        match license.tier {
            LicenseTier::Free => Self {
                event_sourcing: true,
                ai_analysis: false,
                multi_device_sync: false,
                vector_search: false,
                server_deployment: false,
                multi_user: false,
            },
            LicenseTier::Pro => Self {
                event_sourcing: true,
                ai_analysis: true,
                multi_device_sync: true,
                vector_search: true,
                server_deployment: false,
                multi_user: false,
            },
            LicenseTier::Enterprise => Self {
                event_sourcing: true,
                ai_analysis: true,
                multi_device_sync: true,
                vector_search: true,
                server_deployment: true,
                multi_user: true,
            },
        }
    }
}
```

### 14.3 Plugin System

```rust
pub trait Plugin: Send + Sync {
    fn name(&self) -> &str;
    fn version(&self) -> &str;
    fn description(&self) -> &str;

    /// Called on plugin load
    fn initialize(&self, ctx: &PluginContext) -> Result<(), String>;

    /// Called on plugin unload
    fn shutdown(&self, ctx: &PluginContext) -> Result<(), String>;
}

pub struct PluginContext {
    pub event_store: Arc<EventStore>,
    pub projection_engine: Arc<ProjectionEngine>,
    pub blob_store: Arc<BlobStore>,
    pub config: serde_json::Value,
}

pub struct PluginRegistry {
    plugins: HashMap<String, Box<dyn Plugin>>,
}

impl PluginRegistry {
    pub fn load_plugin(&mut self, plugin: Box<dyn Plugin>, ctx: PluginContext) -> Result<(), String> {
        plugin.initialize(&ctx)?;
        self.plugins.insert(plugin.name().to_string(), plugin);
        Ok(())
    }

    pub fn unload_plugin(&mut self, name: &str, ctx: PluginContext) -> Result<(), String> {
        if let Some(plugin) = self.plugins.remove(name) {
            plugin.shutdown(&ctx)?;
        }
        Ok(())
    }
}
```

**Plugin Types:**
- `ai/` — AI model plugins (alternative embedding models, custom extractors)
- `import/` — File format importers (CSV, GeoJSON, Shapefile, etc.)
- `export/` — Export plugins (PDF reports, GIS exports, etc.)
- `sync/` — Custom sync providers (custom server, S3 sync, etc.)

### 14.4 Open API (Future)

```
REST API (Enterprise only):
  GET  /api/v1/projects          — List projects
  GET  /api/v1/projects/:id      — Project details
  POST /api/v1/events            — Push events (programmatic)
  GET  /api/v1/entities/:type    — Query entities
  GET  /api/v1/entities/:type/:id — Entity details
  POST /api/v1/analytics/query   — Run DuckDB query
  GET  /api/v1/search            — Full-text + semantic search
```

---

## 15. Appendix - Code Mapping

### 15.1 Current → V2 File Mapping

| Current File | V2 Destination | Notes |
|--------------|----------------|-------|
| `db/mod.rs` | `db/connection.rs` | Connection management (keep) |
| `db/mod.rs` | `db/event_store.rs` | Replace `execute_immediate_sync` |
| `db/schema.rs` | `db/schema_v2.rs` | New V2 schema |
| `db/models.rs` | `db/state.rs` | DatabaseState updates |
| `db/logic.rs` | `projectors/` | Split into individual projectors |
| `db/migrations.rs` | `db/migrations.rs` | Keep, extend |
| `modules/core/db_v2.rs` | **DELETE** | Replace with proper V2 |
| `DESIGN/design_events/mod.rs` | `events/dispatcher.rs` | Generalize beyond GIS |
| `DESIGN/design_events/events.rs` | `events/types.rs` | Convert to AppEvent |
| `DESIGN/design_events/state.rs` | `state/map_state.rs` | Keep, adapt to UUID |
| `DESIGN/design_events/spatial.rs` | `state/spatial.rs` | Keep |
| `DESIGN/design_events/topology.rs` | `projectors/topology_projectors.rs` | Keep as projector |
| `modules/ingestion/import/metadata.rs` | `pipeline/ingestion_actor.rs` | Convert to actor |
| `modules/ingestion/import/contract_model.rs` | `models/contract.rs` | Keep |
| `modules/ingestion/import/excel_import.rs` | `pipeline/parsing_actor.rs` | Convert to actor |
| `modules/ingestion/import/kml_import.rs` | `pipeline/parsing_actor.rs` | Convert to actor |
| `modules/ingestion/import/kmz_import.rs` | `pipeline/parsing_actor.rs` | Convert to actor |
| `analytics/mod.rs` | `analytics/engine.rs` | Keep, extend |
| `modules/ai/ai_engine/sync.rs` | `sync/engine.rs` | Replace with V2 sync |
| `modules/ai/ai_engine/trainer.rs` | `ai/trainer.rs` | Keep |
| `commands/project.rs` | `commands/project.rs` | Update to UUID |
| `commands/task.rs` | `commands/task.rs` | Update to UUID |
| `commands/contract_analysis.rs` | `commands/contract.rs` | Keep |
| `commands/material.rs` | `commands/material.rs` | Keep |
| `commands/content.rs` | `commands/content.rs` | Keep |
| `commands/search.rs` | `commands/search.rs` | Use entity_index |
| `commands/note.rs` | `commands/note.rs` | Update to UUID |
| `commands/import.rs` | `commands/import.rs` | Use Pipeline |
| — | `sync/server_api.rs` | NEW: Server-side API |
| — | `sync/client.rs` | NEW: Client sync engine |
| — | `events/projectors/task_projector.rs` | NEW |
| — | `events/projectors/feature_projector.rs` | NEW |
| — | `events/projectors/file_projector.rs` | NEW |
| — | `events/projectors/work_item_projector.rs` | NEW |
| — | `metadata/registry.rs` | NEW: Schema registry |
| — | `search/engine.rs` | NEW: Unified search |
| — | `storage/blob_store.rs` | NEW: Blob storage |
| — | `migration/v1_to_v2.rs` | NEW: Migration logic |

### 15.2 Table Mapping V1 → V2

| V1 Table | V2 Table | Changes |
|----------|----------|---------|
| `projects` | `projects` | INTEGER → UUID, add `current_version` |
| `files` | `files` | INTEGER → UUID, add `blob_id`, `current_version` |
| `personnel` | `personnel` | INTEGER → UUID, add `current_version` |
| `contracts` | `contracts` | INTEGER → UUID, add `current_version` |
| `tasks` | `tasks` | INTEGER → UUID, split `dependencies` → `task_links`, add `current_version` |
| `notes` | `notes` | INTEGER → UUID, add `current_version` |
| `design_events` | `event_store` | **Major change**: all entities, UUID, version, global_seq, device_id |
| `design_snapshots` | **REMOVED** | Rebuilt from event_store |
| `materials` | `materials` | INTEGER → UUID, add `current_version` |
| `work_items` | `work_items` | INTEGER → UUID, add `current_version` |
| `content_types` | `content_types` | INTEGER → UUID |
| `content_fields` | `content_fields` | INTEGER → UUID |
| `content_items` | `content_items` | INTEGER → UUID, add `current_version` |
| `roles` | `roles` | INTEGER → UUID |
| `personnel_roles` | `personnel_roles` | UUID FKs |
| `audit_logs` | `audit_logs` | INTEGER → UUID |
| `feature_attachments` | `feature_attachments` | INTEGER → UUID |
| `design_styles` | `design_styles` | INTEGER → UUID |
| `contract_execution_groups` | `contract_execution_groups` | INTEGER → UUID |
| `project_folders` | `project_folders` | INTEGER → UUID |
| `project_settings` | `project_settings` | UUID FK |
| `task_dependencies` | `task_links` | **Restructure**: explicit link_type |
| `content_index` | **REMOVED** | Replaced by entity_index |
| `file_search` | **REMOVED** | Replaced by entity_search |
| `task_search` | **REMOVED** | Replaced by entity_search |
| `note_search` | **REMOVED** | Replaced by entity_search |
| — | `layers` | **NEW**: persistent layer definitions |
| — | `feature_groups` | **NEW**: persistent feature groups |
| — | `metadata_registry` | **NEW**: schema control |
| — | `entity_index` | **NEW**: unified search |
| — | `entity_search` | **NEW**: FTS5 on entity_index |
| — | `blob_registry` | **NEW**: blob metadata |
| — | `sync_state` | **NEW**: device sync tracking |
| — | `migrations` | **NEW**: migration tracking |

### 15.3 Dependency Changes

```toml
# ADD
jsonschema = "0.18"          # Schema validation
uuid = { version = "1.12", features = ["v4", "v7"] }  # UUID v7 support
reqwest = { version = "0.12", features = ["json"] }    # HTTP client (sync)
actix-web = "4.4"            # Server API (optional)
sqlx = { version = "0.7", features = ["postgres", "runtime-tokio"] }  # Server DB

# KEEP
rusqlite = { version = "0.32", features = ["bundled"] }
duckdb = { version = "1.1", features = ["bundled"] }
tokio = { version = "1.49", features = ["full"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
chrono = { version = "0.4", features = ["serde"] }
dashmap = "6.1"
arc-swap = "1.7"
rstar = "0.12"
moka = "0.12"
bincode = "1.33"

# OPTIONAL (keep)
lancedb = { version = "0.10", optional = true }
arrow = { version = "52", optional = true }
tokenizers = { version = "0.19", optional = true }
ort = { version = "2.0", optional = true }

# REMOVE
# (none — all current deps remain useful)
```

---

## Summary

### What V2 Achieves

| Aspect | V1 | V2 |
|--------|----|----|
| **Source of Truth** | Mixed (tables + events) | event_store only |
| **IDs** | INTEGER (auto-increment) | UUID v4/v7 |
| **Write Path** | Direct table writes | Event → Projection |
| **Search** | 3 scattered FTS5 tables | 1 unified entity_index |
| **Metadata** | Ad-hoc JSON | Schema-registered |
| **Sync** | None | Event-based multi-device |
| **Blob Storage** | File paths | SHA-256 deduplicated |
| **Format** | Single SQLite file | Versioned container |
| **Pipeline** | Direct function calls | Actor Model |
| **Vector Search** | Stored, not queried | LanceDB semantic search |
| **Conflict Resolution** | None | Version-based |
| **Offline Support** | None | Queue + retry |
| **Extensibility** | Hard-coded | Plugin system |

### Key Principles

1. **Event is King** — All changes go through event_store
2. **UUID Everywhere** — No more INTEGER IDs
3. **Schema Governance** — No more JSON chaos
4. **Sync Native** — Built for multi-device from day one
5. **Offline First** — Local writes always succeed
6. **CQRS-lite** — Events for writes, projections for reads
7. **Actor Pipeline** — Scalable data processing
8. **Content-Addressable** — SHA-256 blob deduplication
