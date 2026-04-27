# Database & Metadata Documentation

## 📋 Table of Contents
1. [Overview](#overview)
2. [Database Architecture](#database-architecture)
3. [.pmp File Format](#pmp-file-format)
4. [SQLite Schema (V1 - Primary)](#sqlite-schema-v1---primary)
5. [SQLite Schema (V2 - Alternative)](#sqlite-schema-v2---alternative)
6. [Database Relationships](#database-relationships)
7. [Metadata System](#metadata-system)
8. [Full-Text Search (FTS5)](#full-text-search-fts5)
9. [Connection Architecture](#connection-architecture)
10. [Event-Sourcing System](#event-sourcing-system)
11. [Database Operations](#database-operations)
12. [Migration System](#migration-system)
13. [Analytics (DuckDB)](#analytics-duckdb)
14. [External Databases](#external-databases)

---

## Overview

This is a **Tauri-based Rust desktop application** for project management with GIS capabilities. The application uses a **multi-database architecture** centered around `.pmp` files, which are SQLite databases containing all project data, metadata, and GIS design state.

**Key Technologies:**
- **SQLite** (via `rusqlite`) — Primary storage in `.pmp` files
- **DuckDB** (via `duckdb` crate) — Analytics/OLAP queries
- **PostgreSQL** (via `sqlx`) — Separate financial system
- **FTS5** — Full-text search virtual tables

---

## Database Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Application Layer                         │
│  ┌──────────┐  ┌──────────────┐  ┌─────────────┐  ┌──────────┐ │
│  │  Commands │  │   Modules    │  │   DESIGN    │  │ Analytics│ │
│  │ (Tauri)   │  │ (Ingestion)  │  │ (GIS/Map)   │  │ (DuckDB) │ │
│  └─────┬────┘  └──────┬───────┘  └──────┬──────┘  └────┬─────┘ │
│        │              │                 │               │       │
└────────┼──────────────┼─────────────────┼───────────────┼───────┘
         │              │                 │               │
         ▼              ▼                 ▼               ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Database Access Layer                        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              db/mod.rs (Connection Management)            │   │
│  │  - create_project_db()  - open_project_db()              │   │
│  │  - clear_active_connection()  - execute_immediate_sync() │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │ db/schema.rs │  │ db/logic.rs  │  │ db/migrations.rs      │ │
│  │ (V1 Schema)  │  │ (Business    │  │ (Column additions,    │ │
│  │ 31 tables    │  │  Logic)      │  │  FTS5, normalization) │ │
│  └──────────────┘  └──────────────┘  └───────────────────────┘ │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              modules/core/db_v2.rs (V2 Schema)            │   │
│  │  - UUID-based IDs  - FTS5 triggers  - V1→V2 migration    │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
         │              │                 │               │
         ▼              ▼                 ▼               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Storage Layer                               │
│  ┌─────────────────────┐      ┌─────────────────────────────┐   │
│  │   .pmp Files        │      │   DuckDB (.duckdb)          │   │
│  │   (SQLite DB)       │      │   (Analytics/OLAP)          │   │
│  │   - Project data    │      │   - Attached to .pmp        │   │
│  │   - GIS events      │      │   - Complex queries         │   │
│  │   - Metadata        │      │   - Reports                 │   │
│  └─────────────────────┘      └─────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## .pmp File Format

### What is a .pmp file?

A `.pmp` file is a **SQLite database file** that represents a single project. It contains all project data, including:
- Project metadata
- File inventory and analysis results
- Tasks, notes, personnel, contracts
- GIS design events and snapshots
- Materials, work items, BOM data
- Content types and dynamic content
- Audit logs and RBAC roles
- Full-text search indexes

### Example .pmp Files
- `Du_an_165.pmp`
- `TOOL/database/1213.pmp`

### File Structure (Internal)

```
.pmp file (SQLite Database)
├── Tables (31 total)
│   ├── projects (1 record per file)
│   ├── files (file inventory)
│   ├── personnel (project staff)
│   ├── contracts (contract records)
│   ├── tasks (task management)
│   ├── notes (user notes)
│   ├── project_folders
│   ├── content_index
│   ├── task_dependencies
│   ├── design_events (GIS event log)
│   ├── design_snapshots (GIS state snapshots)
│   ├── materials (material catalog)
│   ├── work_items (analytical work items)
│   ├── contract_execution_groups
│   ├── ai_corrections (AI learning data)
│   ├── content_types (dynamic content definitions)
│   ├── content_fields (dynamic field schemas)
│   ├── content_items (dynamic content instances)
│   ├── project_settings (GIS settings)
│   ├── audit_logs (audit trail)
│   ├── feature_attachments
│   ├── design_styles (GIS visual styles)
│   ├── roles (RBAC role definitions)
│   └── personnel_roles (role assignments)
├── FTS5 Virtual Tables
│   ├── file_search
│   ├── task_search
│   └── note_search
└── Indexes (performance optimization)
```

### SQLite Connection Settings

All connections to `.pmp` files use these PRAGMA settings:

```sql
PRAGMA journal_mode = WAL;           -- Write-Ahead Logging for concurrency
PRAGMA synchronous = NORMAL;         -- Balance between speed and safety
PRAGMA foreign_keys = ON;            -- Enforce referential integrity
PRAGMA temp_store = MEMORY;          -- Faster temporary operations
PRAGMA cache_size = -64000;          -- 64MB cache (in KB, negative = KB)
PRAGMA mmap_size = 268435456;        -- 256MB memory-mapped I/O
```

---

## SQLite Schema (V1 - Primary)

### Table: `projects`
**Purpose:** Project metadata and configuration

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY | Project unique identifier |
| `name` | TEXT | NOT NULL | Project name |
| `root_path` | TEXT | NOT NULL | Root directory path on disk |
| `path` | TEXT | NULL | Full path to .pmp file |
| `description` | TEXT | NULL | Project description |
| `contract_number` | TEXT | NULL | Associated contract number |
| `investor` | TEXT | NULL | Investor/client name |
| `contractor` | TEXT | NULL | Contractor name |
| `signed_date` | TEXT | NULL | Contract signing date |
| `duration` | TEXT | NULL | Project duration |
| `end_date` | TEXT | NULL | Project end date |
| `status` | TEXT | DEFAULT 'active' | Project status (active/archived) |
| `metadata_json` | TEXT | NULL | Extended metadata (JSON) |
| `created_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP | Creation timestamp |
| `updated_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP | Last update timestamp |

**Metadata Inheritance (V5.2):** Project metadata flows down to work_items and other child entities.

---

### Table: `files`
**Purpose:** File inventory with AI analysis cache

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | File unique identifier |
| `project_id` | INTEGER | FK → projects(id) ON DELETE CASCADE | Parent project |
| `path` | TEXT | NOT NULL | File path (normalized to `/`) |
| `path_noaccent` | TEXT | NULL | Path with diacritics removed |
| `filename` | TEXT | NOT NULL | Original filename |
| `filename_noaccent` | TEXT | NULL | Filename with diacritics removed |
| `extension` | TEXT | NULL | File extension |
| `size` | INTEGER | DEFAULT 0 | File size in bytes |
| `file_type` | TEXT | NULL | Detected file type |
| `created_at` | DATETIME | NULL | File creation date |
| `modified_at` | DATETIME | NULL | File modification date |
| `content_summary` | TEXT | NULL | AI-generated content summary |
| `content_index` | TEXT | NULL | Content indexing data |
| `metadata_json` | TEXT | NULL | AI analysis results (ContractMetadata cached) |
| `categorization` | TEXT | NULL | File categorization |

**Indexes:**
- `idx_files_project` — Quick lookup by project
- `idx_files_path` (UNIQUE COLLATE NOCASE) — Case-insensitive unique path
- `idx_files_filename` — Filename search

---

### Table: `personnel`
**Purpose:** Project staff and team members

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Personnel unique identifier |
| `project_id` | INTEGER | FK → projects(id) ON DELETE CASCADE | Parent project |
| `name` | TEXT | NOT NULL | Person's name |
| `phone` | TEXT | NULL | Phone number |
| `region` | TEXT | NULL | Region/area assignment |
| `role` | TEXT | NULL | Role description |
| `created_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP | Creation timestamp |

---

### Table: `contracts`
**Purpose:** Contract records with analysis linkage

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Contract unique identifier |
| `project_id` | INTEGER | FK → projects(id) ON DELETE CASCADE | Parent project |
| `name` | TEXT | NOT NULL | Contract name |
| `contract_number` | TEXT | NULL | Contract number |
| `vendor` | TEXT | NULL | Vendor/supplier name |
| `value` | REAL | NULL | Contract value |
| `signed_date` | TEXT | NULL | Signing date |
| `notes` | TEXT | NULL | Additional notes |
| `file_path` | TEXT | NULL | Path to contract file |
| `has_analysis` | INTEGER | DEFAULT 0 | Has AI analysis (0/1) |
| `created_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP | Creation timestamp |

**Index:** `idx_contracts_file_path` (COLLATE NOCASE)

---

### Table: `tasks`
**Purpose:** Task management with dependencies, Gantt, assignments

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Task unique identifier |
| `project_id` | INTEGER | NOT NULL, FK → projects(id) ON DELETE CASCADE | Parent project |
| `parent_id` | INTEGER | FK → tasks(id) ON DELETE SET NULL | Parent task (hierarchical) |
| `related_file_id` | INTEGER | FK → files(id) ON DELETE SET NULL | Associated file |
| `name` | TEXT | NOT NULL | Task name |
| `description` | TEXT | NULL | Task description |
| `status` | TEXT | DEFAULT 'todo' | Task status |
| `priority` | TEXT | DEFAULT 'Normal' | Task priority |
| `start_date` | DATETIME | NULL | Start date (Gantt) |
| `end_date` | DATETIME | NULL | End date (Gantt) |
| `target_file_path` | TEXT | NULL | Target output file path |
| `anchor_data` | TEXT | NULL | GIS anchor data |
| `progress` | REAL | DEFAULT 0 | Progress percentage (0-100) |
| `dependencies` | TEXT | NULL | Dependency data (JSON) |
| `is_completed` | BOOLEAN | DEFAULT 0 | Completion flag |
| `color` | TEXT | NULL | Display color |
| `assignee_id` | INTEGER | FK → personnel(id) ON DELETE SET NULL | Assigned person |
| `contract_id` | INTEGER | FK → contracts(id) ON DELETE SET NULL | Associated contract |
| `created_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP | Creation timestamp |
| `updated_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP | Last update timestamp |

**Index:** `idx_tasks_project`

---

### Table: `notes`
**Purpose:** User notes anchored to files/locations

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Note unique identifier |
| `project_id` | INTEGER | FK → projects(id) ON DELETE CASCADE | Parent project |
| `title` | TEXT | NOT NULL | Note title |
| `content` | TEXT | NULL | Note content |
| `target_file_path` | TEXT | NULL | Associated file path |
| `anchor_data` | TEXT | NULL | GIS anchor coordinates |
| `created_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP | Creation timestamp |
| `updated_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP | Last update timestamp |

---

### Table: `project_folders`
**Purpose:** Folder organization for project files

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Folder unique identifier |
| `project_id` | INTEGER | NOT NULL, FK → projects(id) ON DELETE CASCADE | Parent project |
| `folder_path` | TEXT | NOT NULL | Folder path |
| `created_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP | Creation timestamp |

---

### Table: `content_index`
**Purpose:** Legacy content cache

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `file_path` | TEXT | PRIMARY KEY | File path |
| `content` | TEXT | NULL | File content |
| `last_modified` | INTEGER | NULL | Last modification timestamp |
| `content_hash` | TEXT | NULL | Content hash for change detection |
| `file_size` | INTEGER | NULL | File size |

---

### Table: `task_dependencies`
**Purpose:** Task dependency graph

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Dependency unique identifier |
| `from_task_id` | INTEGER | NOT NULL, FK → tasks(id) ON DELETE CASCADE | Source task |
| `to_task_id` | INTEGER | NOT NULL, FK → tasks(id) ON DELETE CASCADE | Target task |
| **UNIQUE** | (from_task_id, to_task_id) | | Prevents duplicate dependencies |

---

### Table: `design_events`
**Purpose:** Event-sourcing for GIS map changes

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `event_id` | TEXT | PRIMARY KEY | Event unique identifier (UUID) |
| `project_id` | INTEGER | FK → projects(id) ON DELETE CASCADE | Parent project |
| `event_type` | TEXT | NOT NULL | Event type (FeatureCreated, FeatureUpdated, etc.) |
| `payload_json` | TEXT | NOT NULL | Serialized event data (JSON) |
| `timestamp` | DATETIME | DEFAULT CURRENT_TIMESTAMP | Event timestamp |
| `is_undone` | BOOLEAN | DEFAULT 0 | Undo flag |

**Indexes:**
- `idx_design_events_ts` — (project_id, is_undone, timestamp)
- `idx_design_events_project_ts` — (project_id, timestamp)

---

### Table: `design_snapshots`
**Purpose:** Map state snapshots for fast reload

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `project_id` | INTEGER | PRIMARY KEY, FK → projects(id) ON DELETE CASCADE | Parent project |
| `last_event_id` | TEXT | NULL | Last applied event ID |
| `state_json` | TEXT | NOT NULL | Full MapState serialized (JSON) |
| `timestamp` | DATETIME | DEFAULT CURRENT_TIMESTAMP | Snapshot timestamp |

---

### Table: `materials`
**Purpose:** Material catalog

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Material unique identifier |
| `name` | TEXT | NOT NULL | Material name |
| `code` | TEXT | UNIQUE | Material code |
| `unit` | TEXT | NULL | Unit of measure |
| `base_price` | REAL | DEFAULT 0 | Base price |
| `category` | TEXT | NULL | Material category |
| `created_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP | Creation timestamp |

---

### Table: `work_items`
**Purpose:** Analytical work items linked to GIS features

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Work item unique identifier |
| `project_id` | INTEGER | NOT NULL, FK → projects(id) ON DELETE CASCADE | Parent project |
| `feature_id` | TEXT | NULL | Associated GIS feature ID |
| `name` | TEXT | NOT NULL | Work item name |
| `material_id` | INTEGER | FK → materials(id) ON DELETE SET NULL | Associated material |
| `quantity` | REAL | DEFAULT 0 | Quantity |
| `unit_price` | REAL | DEFAULT 0 | Unit price |
| `total_price` | REAL | DEFAULT 0 | Total price |
| `status` | TEXT | DEFAULT 'pending' | Status |
| `metadata_json` | TEXT | NULL | Feature analysis metadata |
| `created_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP | Creation timestamp |

**Metadata Inheritance:** Inherits metadata from project and feature/group metadata.

---

### Table: `contract_execution_groups`
**Purpose:** BOM execution grouping

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Group unique identifier |
| `project_id` | INTEGER | NOT NULL, FK → projects(id) ON DELETE CASCADE | Parent project |
| `name` | TEXT | NOT NULL | Group name |
| `description` | TEXT | NULL | Group description |
| `status` | TEXT | DEFAULT 'todo' | Status |
| `due_date` | TEXT | NULL | Due date |
| `assignee` | TEXT | NULL | Assigned person |
| `color` | TEXT | NULL | Display color |
| `bom_item_uids` | TEXT | NULL | Associated BOM item UIDs (JSON) |
| `created_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP | Creation timestamp |
| `updated_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP | Last update timestamp |

---

### Table: `ai_corrections`
**Purpose:** AI learning feedback loop with embeddings

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Correction unique identifier |
| `file_hash` | TEXT | NULL | File hash for matching |
| `field_name` | TEXT | NOT NULL | Field that was corrected |
| `original_value` | TEXT | NULL | Original AI-extracted value |
| `corrected_value` | TEXT | NOT NULL | User-corrected value |
| `context_text` | TEXT | NULL | Context surrounding the field |
| `embedding` | BLOB | NULL | Vector embedding for similarity search |
| `created_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP | Creation timestamp |

---

### Table: `content_types`
**Purpose:** Flexible content type definitions

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Content type unique identifier |
| `name` | TEXT | NOT NULL UNIQUE | Content type name |
| `icon` | TEXT | NULL | UI icon identifier |
| `description` | TEXT | NULL | Content type description |
| `created_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP | Creation timestamp |

**Seed Data:** Default types include "Thiết bị" (Equipment) and "Nhân sự dự án" (Project Personnel).

---

### Table: `content_fields`
**Purpose:** Dynamic field schemas per content type

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Field unique identifier |
| `content_type_id` | INTEGER | NOT NULL, FK → content_types(id) ON DELETE CASCADE | Parent content type |
| `name` | TEXT | NOT NULL | Field name (internal) |
| `label` | TEXT | NOT NULL | Field label (display) |
| `field_type` | TEXT | NOT NULL | Field type (text, number, date, etc.) |
| `required` | BOOLEAN | DEFAULT 0 | Required flag |
| `options_json` | TEXT | NULL | Field options (JSON) |
| **UNIQUE** | (content_type_id, name) | | Prevents duplicate fields per type |

---

### Table: `content_items`
**Purpose:** Dynamic content instances with JSON data

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Content item unique identifier |
| `content_type_id` | INTEGER | NOT NULL, FK → content_types(id) ON DELETE CASCADE | Content type |
| `project_id` | INTEGER | NOT NULL, FK → projects(id) ON DELETE CASCADE | Parent project |
| `name` | TEXT | NOT NULL | Item name |
| `data_json` | TEXT | NOT NULL | Dynamic data (JSON) |
| `created_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP | Creation timestamp |
| `updated_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP | Last update timestamp |

**Indexes:**
- `idx_content_items_project` — (project_id)
- `idx_content_items_type` — (content_type_id)

---

### Table: `project_settings`
**Purpose:** GIS settings (EPSG, units, center, zoom)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `project_id` | INTEGER | PRIMARY KEY, FK → projects(id) ON DELETE CASCADE | Parent project |
| `epsg_code` | TEXT | DEFAULT '3857' | Coordinate reference system |
| `units` | TEXT | DEFAULT 'm' | Measurement units |
| `center_lat` | REAL | NULL | Map center latitude |
| `center_lon` | REAL | NULL | Map center longitude |
| `default_zoom` | REAL | DEFAULT 15 | Default zoom level |
| `updated_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP | Last update timestamp |

---

### Table: `audit_logs`
**Purpose:** Audit trail with old/new JSON values

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Log entry unique identifier |
| `project_id` | INTEGER | NOT NULL, FK → projects(id) ON DELETE CASCADE | Parent project |
| `user_id` | INTEGER | FK → personnel(id) ON DELETE SET NULL | User who made the change |
| `user_email` | TEXT | NULL | User email |
| `action_type` | TEXT | NOT NULL | Action performed |
| `table_name` | TEXT | NOT NULL | Affected table |
| `record_id` | TEXT | NOT NULL | Affected record ID |
| `old_values_json` | TEXT | NULL | Previous values (JSON) |
| `new_values_json` | TEXT | NULL | New values (JSON) |
| `timestamp` | DATETIME | DEFAULT CURRENT_TIMESTAMP | Log timestamp |

**Index:** `idx_audit_logs_project_id`

---

### Table: `feature_attachments`
**Purpose:** File attachments to GIS features

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Attachment unique identifier |
| `project_id` | INTEGER | NOT NULL, FK → projects(id) ON DELETE CASCADE | Parent project |
| `feature_id` | TEXT | NOT NULL | GIS feature ID |
| `file_id` | INTEGER | NOT NULL, FK → files(id) ON DELETE CASCADE | Attached file |
| `attachment_type` | TEXT | DEFAULT 'GENERAL' | Attachment type |
| `created_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP | Creation timestamp |

**Index:** `idx_feature_attachments_feature_id`

---

### Table: `design_styles`
**Purpose:** Visual styling for GIS features

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Style unique identifier |
| `project_id` | INTEGER | NOT NULL, FK → projects(id) ON DELETE CASCADE | Parent project |
| `name` | TEXT | NOT NULL | Style name |
| `geom_type` | TEXT | NOT NULL | Geometry type (Point, Line, Polygon) |
| `stroke_color` | TEXT | NULL | Stroke color |
| `stroke_width` | REAL | NULL | Stroke width |
| `fill_color` | TEXT | NULL | Fill color |
| `opacity` | REAL | NULL | Opacity (0-1) |
| `icon_path` | TEXT | NULL | Icon path (for points) |
| `dash_pattern` | TEXT | NULL | Dash pattern (for lines) |
| `created_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP | Creation timestamp |

---

### Table: `roles`
**Purpose:** RBAC role definitions with JSON permissions

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Role unique identifier |
| `name` | TEXT | NOT NULL UNIQUE | Role name |
| `permissions_json` | TEXT | NOT NULL | Permissions (JSON) |
| `created_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP | Creation timestamp |

**Seed Data:** Default roles: Admin (`{"all": true}`), Editor (`{"edit_map": true, "edit_tasks": true}`), Viewer (`{"view_only": true}`).

---

### Table: `personnel_roles`
**Purpose:** Role assignment junction table

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `personnel_id` | INTEGER | NOT NULL, FK → personnel(id) ON DELETE CASCADE | Personnel |
| `role_id` | INTEGER | NOT NULL, FK → roles(id) ON DELETE CASCADE | Role |
| **PRIMARY KEY** | (personnel_id, role_id) | | Composite key |

---

## SQLite Schema (V2 - Alternative)

**Location:** `src-tauri/src/IMPLEMENT/modules/core/db_v2.rs`

V2 is an **alternative schema** that uses UUID-based IDs and includes FTS5 triggers for automatic full-text search synchronization.

### Key Differences from V1

| Feature | V1 (Primary) | V2 (Alternative) |
|---------|--------------|------------------|
| **ID Type** | INTEGER (auto-increment) | TEXT (UUID v4) |
| **FTS5** | Manual sync | Automatic via triggers |
| **Path Storage** | Absolute paths | Relative paths |
| **Migration** | — | Automatic V1→V2 migration |

### V2 Tables

#### Table: `projects`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | UUID v4 |
| `title` | TEXT | NOT NULL | Project title |
| `description` | TEXT | NULL | Description |
| `base_dir_hint` | TEXT | NULL | Base directory hint |
| `metadata_json` | TEXT | DEFAULT '{}' | Extended metadata |
| `created_at` | TEXT | NOT NULL | RFC3339 timestamp |
| `updated_at` | TEXT | NOT NULL | RFC3339 timestamp |

#### Table: `files`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | UUID v4 |
| `project_id` | TEXT | NOT NULL, FK → projects(id) | Parent project UUID |
| `rel_path` | TEXT | NOT NULL | Relative path |
| `filename` | TEXT | NOT NULL | Filename |
| `extension` | TEXT | NULL | File extension |
| `file_size` | INTEGER | NULL | File size |
| `hash_sha256` | TEXT | NULL | SHA-256 hash |
| `mime_type` | TEXT | NULL | MIME type |
| `status` | TEXT | DEFAULT 'active' | Status |
| `metadata_json` | TEXT | DEFAULT '{}' | Metadata |
| `created_at` | TEXT | NOT NULL | RFC3339 timestamp |
| `updated_at` | TEXT | NOT NULL | RFC3339 timestamp |

#### Table: `tags`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Tag ID |
| `name` | TEXT | NOT NULL UNIQUE | Tag name |
| `color` | TEXT | DEFAULT '#6366f1' | Tag color |
| `category` | TEXT | NULL | Tag category |

#### Table: `file_tags`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `file_id` | TEXT | NOT NULL, FK → files(id) | File UUID |
| `tag_id` | INTEGER | NOT NULL, FK → tags(id) | Tag ID |
| **PRIMARY KEY** | (file_id, tag_id) | | Composite key |

#### Table: `files_fts` (FTS5 Virtual Table)
| Column | Type | Description |
|--------|------|-------------|
| `id` | UNINDEXED | File UUID |
| `filename` | TEXT | Filename (searchable) |
| `rel_path` | TEXT | Relative path (searchable) |
| `metadata_json` | TEXT | Metadata (searchable) |

**Triggers:**
- `files_ai` — After INSERT: Add to FTS index
- `files_ad` — After DELETE: Remove from FTS index
- `files_au` — After UPDATE: Rebuild FTS entry

---

## Database Relationships

### Entity Relationship Diagram

```
projects (1)
    │
    ├───(N) files
    │        │
    │        └───(N) feature_attachments ────┐
    │                                        │
    ├───(N) personnel ────(N:M) personnel_roles ──── roles
    │                                                  │
    │                                                  └─── permissions_json
    │
    ├───(N) contracts
    │        │
    │        └───(N) tasks (via contract_id)
    │
    ├───(N) tasks
    │        │
    │        ├─── self-reference (parent_id) — hierarchical tasks
    │        ├───(N) task_dependencies (from_task_id)
    │        ├───(N) task_dependencies (to_task_id)
    │        ├─── files (via related_file_id)
    │        └─── personnel (via assignee_id)
    │
    ├───(N) notes
    │
    ├───(N) project_folders
    │
    ├───(N) design_events
    │
    ├───(1) design_snapshots
    │
    ├───(N) work_items
    │        │
    │        └─── materials (via material_id)
    │
    ├───(N) contract_execution_groups
    │
    ├───(N) content_items
    │        │
    │        └─── content_types (via content_type_id)
    │                  │
    │                  └───(N) content_fields
    │
    ├───(1) project_settings
    │
    ├───(N) audit_logs
    │        │
    │        └─── personnel (via user_id)
    │
    └───(N) design_styles
```

### Key Relationships

| Parent Table | Child Table | Relationship | ON DELETE |
|--------------|-------------|--------------|-----------|
| projects | files | 1:N | CASCADE |
| projects | personnel | 1:N | CASCADE |
| projects | contracts | 1:N | CASCADE |
| projects | tasks | 1:N | CASCADE |
| projects | notes | 1:N | CASCADE |
| projects | project_folders | 1:N | CASCADE |
| projects | design_events | 1:N | CASCADE |
| projects | design_snapshots | 1:1 | CASCADE |
| projects | work_items | 1:N | CASCADE |
| projects | contract_execution_groups | 1:N | CASCADE |
| projects | content_items | 1:N | CASCADE |
| projects | project_settings | 1:1 | CASCADE |
| projects | audit_logs | 1:N | CASCADE |
| projects | feature_attachments | 1:N | CASCADE |
| projects | design_styles | 1:N | CASCADE |
| tasks | tasks (self) | 1:N | SET NULL |
| tasks | task_dependencies | 1:N (from) | CASCADE |
| tasks | task_dependencies | 1:N (to) | CASCADE |
| personnel | personnel_roles | 1:N | CASCADE |
| roles | personnel_roles | 1:N | CASCADE |
| content_types | content_fields | 1:N | CASCADE |
| content_types | content_items | 1:N | CASCADE |
| materials | work_items | 1:N | SET NULL |
| files | feature_attachments | 1:N | CASCADE |

---

## Metadata System

### Overview

The metadata system uses **JSON columns** extensively across multiple tables to store flexible, schema-less data. This allows the application to evolve without requiring database migrations for every new field.

### Metadata Locations

| Table | Column | Purpose |
|-------|--------|---------|
| `projects` | `metadata_json` | Project-level metadata (contract info, custom fields) |
| `files` | `metadata_json` | AI analysis results, ContractMetadata cached |
| `work_items` | `metadata_json` | Feature analysis metadata |
| `design_events` | `payload_json` | Serialized GIS event data |
| `design_snapshots` | `state_json` | Full MapState serialized |
| `roles` | `permissions_json` | RBAC permissions |
| `content_items` | `data_json` | Dynamic content data |
| `content_fields` | `options_json` | Field configuration options |
| `audit_logs` | `old_values_json`, `new_values_json` | Audit deltas |
| `contract_execution_groups` | `bom_item_uids` | Associated BOM items |

### Metadata Models

#### DatasetMeta
**Location:** `modules/ingestion/import/metadata.rs`

Used during data import to track dataset structure and field definitions.

```rust
struct DatasetMeta {
    dataset_id: String,          // SHA-256 hash of headers
    fields: Vec<FieldMeta>,      // Field definitions
    sample_data: Option<Vec<HashMap<String, String>>>,
}

struct FieldMeta {
    name: String,               // Normalized field name
    field_type: String,         // "string", "number", etc.
    display_name: String,       // Original header text
    required: bool,             // Is this field required
}
```

#### FeatureRecord
**Location:** `modules/ingestion/import/metadata.rs`

Represents a GIS feature during import.

```rust
struct FeatureRecord {
    id: String,
    geom_type: String,          // "Point", "LineString", "Polygon"
    geometry: serde_json::Value, // GeoJSON-like geometry
    center_lat: f64,
    center_lon: f64,
    tile_id: String,
    properties: HashMap<String, String>,
}
```

#### ContractMetadata
**Location:** `modules/ingestion/import/contract_model.rs`

Stores contract details and BOM (Bill of Materials) data.

```rust
struct ContractMetadata {
    contract_number: String,
    investor: String,
    contractor: String,
    signed_date: String,
    duration: String,
    end_date: String,
    bom_table: Vec<BOMItem>,
    categorization: String,
}

struct BOMItem {
    uid: String,
    stt: String,
    name: String,
    description: String,
    unit: String,
    quantity: f64,
    price: f64,
    total: f64,
    manufacturer: String,
    origin: String,
}
```

#### ImportMapping
**Location:** `modules/ingestion/import/metadata.rs`

Column mapping for data import.

```rust
struct ImportMapping {
    name_column: String,
    lat_column: String,
    lng_column: String,
    description_column: Option<String>,
    order_column: Option<String>,
}
```

### Metadata Inheritance (V5.2)

The system implements a **metadata inheritance** hierarchy:

```
Project Metadata
    └── Feature Group Metadata
         └── Feature Metadata
              └── Work Item Metadata
```

**Implementation:** In `db/logic.rs`, the `apply_event_to_structural_tables()` function applies metadata from higher levels to child entities when GIS events are processed.

### Metadata Normalization

The `normalize_metadata` command (registered in `lib.rs`) standardizes metadata across records, ensuring consistent structure and removing duplicates.

---

## Full-Text Search (FTS5)

### Overview

The application uses SQLite's FTS5 extension to provide full-text search capabilities across files, tasks, and notes.

### FTS5 Virtual Tables

#### `file_search`
```sql
CREATE VIRTUAL TABLE file_search USING fts5(
    file_path UNINDEXED,
    title,
    content,
    tokenize='unicode61 remove_diacritics 2'
);
```

#### `task_search`
```sql
CREATE VIRTUAL TABLE task_search USING fts5(
    task_id UNINDEXED,
    name,
    description,
    tokenize='unicode61 remove_diacritics 2'
);
```

#### `note_search`
```sql
CREATE VIRTUAL TABLE note_search USING fts5(
    note_id UNINDEXED,
    title,
    content,
    tokenize='unicode61 remove_diacritics 2'
);
```

#### `files_fts` (V2 only)
```sql
CREATE VIRTUAL TABLE files_fts USING fts5(
    id UNINDEXED,
    filename,
    rel_path,
    metadata_json,
    content='files',
    content_rowid='rowid'
);
```

With automatic sync triggers:
- `files_ai` — After INSERT
- `files_ad` — After DELETE
- `files_au` — After UPDATE

### Tokenizer Configuration

All FTS5 tables use: `tokenize='unicode61 remove_diacritics 2'`

This configuration:
- Supports Unicode characters
- Removes Vietnamese diacritics for better search matching
- Uses minimum token length of 2 characters

---

## Connection Architecture

### DatabaseState Structure

**Location:** `db/models.rs`

```rust
pub struct DatabaseState {
    /// Read Connection — Primary for hydration/queries
    pub conn: Arc<Mutex<Option<Connection>>>,

    /// Write Connection — Dedicated for persistence
    pub write_conn: Arc<Mutex<Option<Connection>>>,

    /// Connection Pool — Additional concurrent read connections
    pub connection_pool: DashMap<PathBuf, Arc<Mutex<Connection>>>,

    /// State Cache — Cached MapState by project_id
    pub state_cache: DashMap<i64, Arc<MapState>>,

    /// Active Project ID
    pub active_project_id: Arc<Mutex<Option<i64>>>,

    /// Hydrated Project ID — Tracks hydration state
    pub hydrated_project_id: Arc<Mutex<Option<i64>>>,

    /// Indexing Task ID — Counter for indexing operations
    pub indexing_task_id: Arc<AtomicU64>,

    /// Project ID to Path Mapping
    pub project_id_to_path: DashMap<i64, PathBuf>,

    /// Design State Blob — Serialized design state for streaming
    pub design_state_blob: Arc<Mutex<Option<Vec<u8>>>>,

    /// Active DMP Path — Currently active .pmp file path
    pub active_dmp_path: Arc<Mutex<Option<PathBuf>>>,

    /// Sync Status — 0: Idle, 1: Syncing, 2: Error
    pub sync_status: Arc<AtomicU8>,
}
```

### 3-Connection Model

The application uses **three separate SQLite connections** for optimal performance:

```
┌─────────────────────────────────────────────────────────────┐
│                     DatabaseState                            │
│                                                              │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │    conn     │  │  write_conn  │  │ connection_pool   │  │
│  │  (Read)     │  │  (Write)     │  │  (Read Pool)      │  │
│  │             │  │              │  │                   │  │
│  │ Primary for │  │ Dedicated   │  │ DashMap<PathBuf, │  │
│  │ hydration   │  │ persistence │  │  Arc<Mutex<Conn>> │  │
│  │ and queries │  │ with IMMED. │  │                   │  │
│  │             │  │ transactions│  │ For concurrent   │  │
│  │             │  │             │  │ read operations  │  │
│  └─────────────┘  └──────────────┘  └───────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**Connection 1 — Read (`conn`):**
- Used for data hydration, queries, and reads
- Primary connection for most operations
- Initialized when opening a .pmp file

**Connection 2 — Write (`write_conn`):**
- Dedicated for write operations
- Uses IMMEDIATE transactions to avoid lock contention
- Handles `execute_immediate_sync()` with retry logic
- Separate connection to avoid blocking reads

**Connection 3 — Pool (`connection_pool`):**
- DashMap of additional read connections
- Supports concurrent read operations
- Keyed by file path for multi-project scenarios

### Connection Lifecycle

```
1. initialize_database()
   └── Creates DatabaseState (no DB opened yet)

2. create_project_db() / open_project_db()
   ├── Opens SQLite connection to .pmp file
   ├── Applies setup_connection() PRAGMAs
   ├── Applies base schema (CREATE TABLE IF NOT EXISTS)
   ├── Creates/loads project record
   ├── Initializes 3-connection model
   └── Sets active_project_id

3. clear_active_connection()
   ├── Checkpoints WAL (PRAGMA wal_checkpoint(TRUNCATE))
   ├── Closes all connections
   └── Clears active_project_id
```

### Write Retry Logic

`execute_immediate_sync()` implements retry logic for write collisions:

```rust
fn execute_immediate_sync(...) -> Result<String, String> {
    let max_retries = 10;
    loop {
        match execute_immediate_sync_internal(...) {
            Ok(last_id) => return Ok(last_id),
            Err(e) if e.contains("database is locked") && retry_count < max_retries => {
                retry_count += 1;
                sleep(50 * retry_count ms);  // Exponential backoff
            }
            Err(e) => return Err(e),
        }
    }
}
```

Emits `sync-status` events: `1` (syncing) → `0` (idle) or `2` (error)

---

## Event-Sourcing System

### Overview

The GIS design system uses **event-sourcing** to track all changes to the map state. Events are stored in `design_events` table and can be replayed to reconstruct the full map state.

### Design Event Types

**Location:** `DESIGN/design_events/events.rs`

```rust
enum DesignEventType {
    FeatureCreated { ... },
    FeatureUpdated { ... },
    FeatureDeleted { ... },
    LayerCreated { ... },
    LayerUpdated { ... },
    LayerDeleted { ... },
    SettingsUpdated { ... },
    // ... additional event variants
}
```

### Event Flow

```
User Action (GIS Map)
    │
    ▼
Design Event Created
    │
    ├──► Stored in design_events table
    │
    └──► execute_immediate_sync()
              │
              ├──► INSERT INTO design_events
              │
              └──► apply_event_to_structural_tables()
                        │
                        ├──► Update features (in-memory MapState)
                        ├──► Apply metadata inheritance
                        ├──► Update work_items if applicable
                        └──► Emit frontend events
```

### Event Persistence

Events are written using `execute_immediate_sync()`:
1. Opens IMMEDIATE transaction on `write_conn`
2. For each event:
   - Generates UUID event_id
   - Serializes event to JSON (`payload_json`)
   - Inserts into `design_events` table
   - Applies to structural tables via `apply_event_to_structural_tables()`
3. Commits transaction

### Snapshots

`design_snapshots` table stores full MapState snapshots for fast reload:
- One record per project
- Contains serialized `state_json` (full map state)
- Used to avoid replaying all events from scratch
- Updated periodically or on project save

---

## Database Operations

### Key Functions

**Location:** `db/mod.rs`

#### `initialize_database(_app_dir: PathBuf)`
Creates the `DatabaseState` struct without opening any database. Waits for `load_pmp_file` command.

#### `create_project_db(state, db_path)`
Creates a brand new `.pmp` file:
1. Opens SQLite connection
2. Applies connection PRAGMAs
3. Applies base schema (all tables)
4. Sets as active read connection

#### `open_project_db(state, db_path)`
Opens an existing `.pmp` file:
1. Validates file exists and is not a directory
2. Opens connection with fallback to canonicalized path
3. Applies PRAGMAs and base schema
4. Migrates absolute paths to relative
5. Loads or creates project record
6. Initializes 3-connection model:
   - Read connection (`conn`)
   - Write connection (`write_conn`)
   - Pool connection
7. Sets up metadata mappings

#### `clear_active_connection(state)`
Closes all connections cleanly:
1. Checkpoints WAL on both read and write connections
2. Closes all connections
3. Clears active project ID

#### `execute_immediate_sync(app_handle, state, project_id, events)`
Writes design events with retry logic:
1. Sets sync status to 1 (syncing)
2. Opens IMMEDIATE transaction
3. For each event:
   - Generates UUID
   - Serializes to JSON
   - Inserts into `design_events`
   - Applies to structural tables
4. Commits and sets sync status to 0 (idle)
5. On lock error: retries up to 10 times with backoff
6. On other error: sets sync status to 2 (error)

### Connection Setup

**Location:** `db/mod.rs` — `setup_connection()`

```rust
fn setup_connection(conn: &mut Connection) -> Result<(), String> {
    conn.busy_timeout(Duration::from_secs(30))?;
    conn.execute_batch("
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA foreign_keys = ON;
        PRAGMA temp_store = MEMORY;
        PRAGMA cache_size = -64000;
        PRAGMA mmap_size = 268435456;
    ")?;
    Ok(())
}
```

### Schema Application

**Location:** `db/schema.rs` — `apply_base_schema()`

Executes in order:
1. **Migrations:** Ensures optional columns exist (`metadata_json` on projects, work_items)
2. **Tables:** Creates all 31 tables with `CREATE TABLE IF NOT EXISTS`
3. **Indexes:** Creates performance indexes with `CREATE INDEX IF NOT EXISTS`
4. **Seed Data:** Inserts default content types, fields, and roles if empty

---

## Migration System

### Migration Types

#### Column Addition (Runtime)
**Location:** `db/migrations.rs`

Uses `ensure_column()` to safely add columns without errors if they already exist:
```rust
ensure_column(conn, "projects", "metadata_json", "TEXT").ok();
ensure_column(conn, "work_items", "metadata_json", "TEXT").ok();
```

#### Path Migration (V1)
**Location:** `db/logic.rs` — `migrate_to_relative_paths()`

Converts absolute paths to relative paths based on project root.

#### FTS5 Migration
Adds FTS5 virtual tables and triggers during schema application.

#### V1 → V2 Migration
**Location:** `modules/core/db_v2.rs` — `migrate_v1_to_v2()`

Full migration from V1 to V2 schema:
1. Renames V1 tables to `_v1` suffix
2. Creates new V2 schema with UUIDs
3. Migrates project records (generates UUIDs)
4. Migrates file records (converts paths, generates UUIDs)
5. Drops `_v1` tables
6. Enables FTS5 triggers

### V70: Orphan Recovery & Deduplication

**Location:** `db/logic.rs`

#### `recover_orphaned_rows(conn, active_id)`
Fixes rows with NULL or mismatched `project_id` by updating them to the active project ID.

#### `deduplicate_projects(conn)`
Handles duplicate project entries:
1. Groups projects by name (case-insensitive)
2. For duplicates, picks the ID with most child records
3. Updates child references to best ID
4. Deletes duplicate project records

---

## Analytics (DuckDB)

### Overview

**Location:** `analytics/mod.rs`

The application uses DuckDB for analytical queries on `.pmp` data:

```
┌─────────────────────────────────────────────┐
│                DuckDB                        │
│                                              │
│  ┌───────────────────────────────────────┐  │
│  │   SQLite Scanner Extension             │  │
│  │   ┌─────────────────────────────┐    │  │
│  │   │  Attach .pmp file           │    │  │
│  │   │  (Read-only SQLite access)  │    │  │
│  │   └─────────────────────────────┘    │  │
│  │                                       │  │
│  │   Complex OLAP queries                │  │
│  │   - Aggregations                      │  │
│  │   - Multi-table joins                 │  │
│  │   - Reports                           │  │
│  │   - Data exports                      │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

### Key Capabilities
- Attaches `.pmp` SQLite files via SQLite Scanner extension
- Executes complex analytical queries without impacting SQLite performance
- Supports aggregations, multi-table joins, and report generation

---

## External Databases

### PostgreSQL (Financial System)

**Location:** `financial_system/`

A **separate Rust crate** for financial management using PostgreSQL:

| Feature | Details |
|---------|---------|
| **ORM** | `sqlx` with compile-time checked SQL |
| **Connection** | `Pool<Postgres>` |
| **Migration** | `financial_system/migrations/20260321_init_pfms.sql` |
| **Tables** | projects, output_contracts, output_items, input_contracts, input_items, allocations, file_registry, audit_logs |
| **Key Feature** | Allocation system with `SELECT FOR UPDATE` locking |
| **Constraint** | `SUM(allocated_amount) <= actual_cost` |

### Firebase/Firestore

**Location:** `modules/ingestion/import/firestore_writer.rs`

- **Status:** DISABLED (no-op stub)
- **Purpose:** Was intended for auth only
- **Firestore sync:** Not implemented

### RocksDB

- **Status:** Listed in `Cargo.toml` but **NOT USED** in source code
- **Version:** `0.23.0`

### LanceDB (Vector Database)

- **Status:** Optional feature (`vector-db` feature flag)
- **Version:** `0.10`
- **Purpose:** Vector similarity search (not actively used)

---

## Key Code Files

### Core DB Module

| File | Purpose |
|------|---------|
| `db/mod.rs` | Connection management, open/create/close, sync operations |
| `db/schema.rs` | Full SQLite schema (31 tables + indexes + seed data) |
| `db/models.rs` | DatabaseState struct definition |
| `db/logic.rs` | Path migration, event application, orphan recovery, dedup |
| `db/migrations.rs` | Column addition, FTS5 migration, normalization |
| `modules/core/db_v2.rs` | V2 schema with UUIDs, FTS5 triggers, V1→V2 migration |

### Tauri Command Handlers

| File | Purpose |
|------|---------|
| `commands/project.rs` | CRUD for .pmp files, load/create/delete |
| `commands/project_v2.rs` | V2 commands (create, search with FTS5) |
| `commands/project_v4.rs` | Settings, design styles, audit logs |
| `commands/contract_analysis.rs` | Contract metadata analysis, BOM tables |
| `commands/task.rs` | Task CRUD and dependencies |
| `commands/material.rs` | Materials and work items |
| `commands/content.rs` | Dynamic content types/items |
| `commands/search.rs` | Document search/indexing |
| `commands/note.rs` | Notes CRUD |
| `commands/import.rs` | Import with column mapping |
| `commands/models.rs` | Data models (AuditLog, DesignStyle, ProjectSettings) |

### Import/Ingestion

| File | Purpose |
|------|---------|
| `modules/ingestion/import/metadata.rs` | DatasetMeta, FeatureRecord, ImportMapping |
| `modules/ingestion/import/contract_model.rs` | ContractMetadata, BOMItem |
| `modules/ingestion/import/excel_import.rs` | Excel import with metadata inference |
| `modules/ingestion/import/kml_import.rs` | KML import with DatasetMeta |
| `modules/ingestion/import/kmz_import.rs` | KMZ import with DatasetMeta |

### Domain/Crate Level

| File | Purpose |
|------|---------|
| `crates/app_domain/src/interfaces.rs` | ProjectStorage trait, GisProcessor trait |
| `crates/module_storage/src/lib.rs` | StorageService implementing ProjectStorage |
| `crates/app_domain/src/pmp_v2.rs` | V2 domain models |
| `shared_models/src/pmp_v2.rs` | V2 shared models |

### Design Events (Event-Sourcing)

| File | Purpose |
|------|---------|
| `DESIGN/design_events/mod.rs` | Event dispatch, hydration, undo/redo |
| `DESIGN/design_events/state.rs` | MapState with spatial indexing (RTree) |
| `DESIGN/design_events/models.rs` | RegionState, LayerState, FeatureState |
| `DESIGN/design_events/events.rs` | DesignEventType enum |
| `DESIGN/design_events/spatial.rs` | SpatialFeature, SpatialSegment |

### Analytics

| File | Purpose |
|------|---------|
| `analytics/mod.rs` | DuckDB analytics engine |

---

## Dependencies

### Cargo.toml Key Dependencies

```toml
rusqlite = { version = "0.32.1", features = ["bundled"] }
duckdb = { version = "1.1.1", features = ["bundled"] }
rocksdb = "0.23.0"              # Listed but NOT USED
lancedb = { version = "0.10", optional = true }  # vector-db feature
```

### Database Libraries Used

| Library | Purpose | Status |
|---------|---------|--------|
| `rusqlite` | SQLite access for .pmp files | ✅ Active |
| `duckdb` | Analytics/OLAP queries | ✅ Active |
| `sqlx` | PostgreSQL for financial system | ✅ Active (separate crate) |
| `rocksdb` | Key-value store | ❌ Not used |
| `lancedb` | Vector database | ⚠️ Optional feature |

---

## Summary

### Database Architecture Highlights

1. **Single File Per Project:** Each `.pmp` file is a self-contained SQLite database with all project data.

2. **3-Connection Model:** Read, Write, and Pool connections for optimal concurrency.

3. **Event-Sourcing:** All GIS changes tracked as replayable events with undo/redo support.

4. **Flexible Metadata:** JSON columns throughout for schema-less extensibility.

5. **Full-Text Search:** FTS5 indexes for fast content search across files, tasks, and notes.

6. **Metadata Inheritance:** Project → Feature → WorkItem metadata cascade.

7. **WAL Mode:** Write-Ahead Logging for concurrent read/write operations.

8. **Retry Logic:** Write collisions handled with exponential backoff.

9. **Multi-Database:** SQLite (.pmp) for projects, DuckDB for analytics, PostgreSQL for finance.

10. **Migration Support:** Automatic V1→V2 migration, path normalization, orphan recovery.
