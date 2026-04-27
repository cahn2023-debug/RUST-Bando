use rusqlite::{params, Connection};

/// Function to execute the base C# schema + Rust modifications.
/// This defines the core schema for all .pmp project files.
pub fn apply_base_schema(conn: &Connection) -> Result<(), String> {
    // --- 0. MIGRATIONS (ENSURE COLUMNS EXIST) ---
    // Added for Metadata Inheritance (Optimization V5.2)
    crate::implement::db::migrations::ensure_column(conn, "projects", "metadata_json", "TEXT").ok();
    crate::implement::db::migrations::ensure_column(conn, "work_items", "metadata_json", "TEXT")
        .ok();
    crate::implement::db::migrations::ensure_column(conn, "tasks", "metadata_json", "TEXT").ok();
    crate::implement::db::migrations::ensure_column(conn, "features", "area", "REAL").ok();
    crate::implement::db::migrations::ensure_column(conn, "features", "length", "REAL").ok();

    // --- 1. TABLES (CREATE IF NOT EXISTS) ---

    // Projects table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY, 
            name TEXT NOT NULL,
            root_path TEXT NOT NULL,
            path TEXT,
            description TEXT,
            contract_number TEXT,
            investor TEXT,
            contractor TEXT,
            signed_date TEXT,
            duration TEXT,
            end_date TEXT,
            status TEXT NOT NULL DEFAULT 'active',
            metadata_json TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    // Files table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS files (
            id TEXT PRIMARY KEY, 
            project_id TEXT,
            path TEXT NOT NULL,
            path_noaccent TEXT,
            filename TEXT NOT NULL,
            filename_noaccent TEXT,
            extension TEXT,
            size INTEGER DEFAULT 0,
            file_type TEXT,
            created_at DATETIME,
            modified_at DATETIME,
            content_summary TEXT,
            content_index TEXT,
            metadata_json TEXT,
            categorization TEXT,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    // Personnel table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS personnel (
            id TEXT PRIMARY KEY, 
            project_id TEXT,
            name TEXT NOT NULL,
            phone TEXT,
            region TEXT,
            role TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    // Contracts table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS contracts (
            id TEXT PRIMARY KEY, 
            project_id TEXT,
            name TEXT NOT NULL,
            contract_number TEXT,
            vendor TEXT,
            value REAL,
            signed_date TEXT,
            notes TEXT,
            file_path TEXT,
            has_analysis INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    // Tasks table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY, 
            project_id TEXT NOT NULL,
            parent_id TEXT,
            related_file_id TEXT,
            name TEXT NOT NULL,
            description TEXT,
            status TEXT NOT NULL DEFAULT 'todo',
            priority TEXT DEFAULT 'Normal',       
            start_date DATETIME,
            end_date DATETIME,
            target_file_path TEXT,
            anchor_data TEXT,
            progress REAL DEFAULT 0,
            dependencies TEXT,
            is_completed BOOLEAN NOT NULL DEFAULT 0,
            color TEXT,
            assignee_id TEXT,
            contract_id TEXT,
            metadata_json TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
            FOREIGN KEY (parent_id) REFERENCES tasks(id) ON DELETE SET NULL,
            FOREIGN KEY (related_file_id) REFERENCES files(id) ON DELETE SET NULL,
            FOREIGN KEY (assignee_id) REFERENCES personnel(id) ON DELETE SET NULL,
            FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE SET NULL
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    // Notes table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS notes (
            id TEXT PRIMARY KEY, 
            project_id TEXT,
            title TEXT NOT NULL,
            content TEXT,
            target_file_path TEXT,
            anchor_data TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    // Project Folders
    conn.execute(
        "CREATE TABLE IF NOT EXISTS project_folders (
            id TEXT PRIMARY KEY, 
            project_id TEXT NOT NULL,
            folder_path TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    // Content Index
    conn.execute(
        "CREATE TABLE IF NOT EXISTS content_index (
            file_path TEXT PRIMARY KEY,
            content TEXT,
            last_modified INTEGER,
            content_hash TEXT,
            file_size INTEGER
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    // Task Dependencies Table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS task_dependencies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            from_task_id INTEGER NOT NULL,
            to_task_id INTEGER NOT NULL,
            FOREIGN KEY(from_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
            FOREIGN KEY(to_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
            UNIQUE(from_task_id, to_task_id)
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    // File Search FTS5
    conn.execute(
        "CREATE VIRTUAL TABLE IF NOT EXISTS file_search USING fts5(
            file_path UNINDEXED,
            title,
            content,
            tokenize='unicode61 remove_diacritics 2'
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    // Task Search FTS5
    conn.execute(
        "CREATE VIRTUAL TABLE IF NOT EXISTS task_search USING fts5(
            task_id UNINDEXED,
            name,
            description,
            tokenize='unicode61 remove_diacritics 2'
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    // Note Search FTS5
    conn.execute(
        "CREATE VIRTUAL TABLE IF NOT EXISTS note_search USING fts5(
            note_id UNINDEXED,
            title,
            content,
            tokenize='unicode61 remove_diacritics 2'
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    // Design Events
    conn.execute(
        "CREATE TABLE IF NOT EXISTS design_events (
            event_id TEXT PRIMARY KEY,
            project_id INTEGER,
            event_type TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            is_undone BOOLEAN NOT NULL DEFAULT 0,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    // Design Snapshots
    conn.execute(
        "CREATE TABLE IF NOT EXISTS design_snapshots (
            project_id INTEGER PRIMARY KEY,
            last_event_id TEXT,
            state_json TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    // Materials table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS materials (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            name TEXT NOT NULL,
            code TEXT UNIQUE,
            unit TEXT,
            base_price REAL DEFAULT 0,
            category TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    // Work Items table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS work_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            project_id INTEGER NOT NULL,
            feature_id TEXT,
            name TEXT NOT NULL,
            material_id INTEGER,
            quantity REAL DEFAULT 0,
            unit_price REAL DEFAULT 0,
            total_price REAL DEFAULT 0,
            status TEXT DEFAULT 'pending',
            metadata_json TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
            FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE SET NULL
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    // Features table (Read Model)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS features (
            id TEXT PRIMARY KEY,
            project_id INTEGER NOT NULL,
            name TEXT,
            geom_type TEXT NOT NULL,
            geometry_json TEXT NOT NULL,
            geometry_wkb BLOB,
            min_x REAL,
            min_y REAL,
            max_x REAL,
            max_y REAL,
            properties_json TEXT,
            style_id INTEGER,
            layer_id TEXT,
            group_id TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    // Contract Execution Groups
    conn.execute(
        "CREATE TABLE IF NOT EXISTS contract_execution_groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            status TEXT DEFAULT 'todo',
            due_date TEXT,
            assignee TEXT,
            color TEXT,
            bom_item_uids TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    // AI Corrections table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS ai_corrections (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            file_hash TEXT,
            field_name TEXT NOT NULL,
            original_value TEXT,
            corrected_value TEXT NOT NULL,
            context_text TEXT,
            embedding BLOB,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    // Flexible Content Types
    conn.execute(
        "CREATE TABLE IF NOT EXISTS content_types (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            icon TEXT,
            description TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    // Flexible Content Fields
    conn.execute(
        "CREATE TABLE IF NOT EXISTS content_fields (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content_type_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            label TEXT NOT NULL,
            field_type TEXT NOT NULL,
            required BOOLEAN DEFAULT 0,
            options_json TEXT,
            FOREIGN KEY (content_type_id) REFERENCES content_types(id) ON DELETE CASCADE,
            UNIQUE(content_type_id, name)
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    // Flexible Content Items
    conn.execute(
        "CREATE TABLE IF NOT EXISTS content_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content_type_id INTEGER NOT NULL,
            project_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            data_json TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (content_type_id) REFERENCES content_types(id) ON DELETE CASCADE,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    // Project Settings
    conn.execute(
        "CREATE TABLE IF NOT EXISTS project_settings (
            project_id TEXT PRIMARY KEY,
            epsg_code TEXT DEFAULT '3857',
            units TEXT DEFAULT 'm',
            center_lat REAL,
            center_lon REAL,
            default_zoom REAL DEFAULT 15,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    // Audit Logs
    conn.execute(
        "CREATE TABLE IF NOT EXISTS audit_logs (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            user_id TEXT,
            user_email TEXT,
            action_type TEXT NOT NULL,
            table_name TEXT NOT NULL,
            record_id TEXT NOT NULL,
            old_values_json TEXT,
            new_values_json TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES personnel(id) ON DELETE SET NULL
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    // Feature Attachments
    conn.execute(
        "CREATE TABLE IF NOT EXISTS feature_attachments (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            feature_id TEXT NOT NULL,
            file_id TEXT NOT NULL,
            attachment_type TEXT DEFAULT 'GENERAL',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
            FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    // Design Styles
    conn.execute(
        "CREATE TABLE IF NOT EXISTS design_styles (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            name TEXT NOT NULL,
            geom_type TEXT NOT NULL,
            stroke_color TEXT,
            stroke_width REAL,
            fill_color TEXT,
            opacity REAL,
            icon_path TEXT,
            dash_pattern TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    // Roles System
    conn.execute(
        "CREATE TABLE IF NOT EXISTS roles (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            permissions_json TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS personnel_roles (
            personnel_id TEXT NOT NULL,
            role_id TEXT NOT NULL,
            PRIMARY KEY (personnel_id, role_id),
            FOREIGN KEY (personnel_id) REFERENCES personnel(id) ON DELETE CASCADE,
            FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    // --- 2. INDEXES (CREATE IF NOT EXISTS) ---

    conn.execute("CREATE INDEX IF NOT EXISTS idx_design_events_ts ON design_events(project_id, is_undone, timestamp)", []).ok();
    conn.execute("CREATE INDEX IF NOT EXISTS idx_design_events_project_ts ON design_events(project_id, timestamp)", []).ok();
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_audit_logs_project_id ON audit_logs(project_id)",
        [],
    )
    .ok();
    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_work_items_feature_id ON work_items(feature_id)",
        [],
    )
    .ok();
    conn.execute("CREATE INDEX IF NOT EXISTS idx_feature_attachments_feature_id ON feature_attachments(feature_id)", []).ok();
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id)",
        [],
    )
    .ok();
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_files_project ON files(project_id)",
        [],
    )
    .ok();
    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_files_path ON files(path COLLATE NOCASE)",
        [],
    )
    .ok();
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_contracts_file_path ON contracts(file_path COLLATE NOCASE)",
        [],
    )
    .ok();
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_files_filename ON files(filename COLLATE NOCASE)",
        [],
    )
    .ok();
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_audit_logs_project_ts ON audit_logs(project_id, timestamp DESC)",
        [],
    ).ok();
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action_type, table_name)",
        [],
    )
    .ok();
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_design_events_type ON design_events(event_type)",
        [],
    )
    .ok();
    conn.execute("CREATE INDEX IF NOT EXISTS idx_features_layer_group ON features(project_id, layer_id, group_id)", []).ok();
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_features_spatial ON features(project_id, min_x, min_y, max_x, max_y)",
        [],
    ).ok();
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_features_wkb ON features(project_id, geometry_wkb)",
        [],
    )
    .ok();
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_tasks_status_date ON tasks(project_id, status, end_date)",
        [],
    )
    .ok();
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_files_project ON files(project_id)",
        [],
    )
    .ok();
    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_files_path ON files(path COLLATE NOCASE)",
        [],
    )
    .ok();
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_contracts_file_path ON contracts(file_path COLLATE NOCASE)",
        [],
    )
    .ok();
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_files_filename ON files(filename COLLATE NOCASE)",
        [],
    )
    .ok();
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_audit_logs_project_ts ON audit_logs(project_id, timestamp DESC)",
        [],
    ).ok();
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action_type, table_name)",
        [],
    )
    .ok();
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_design_events_type ON design_events(event_type)",
        [],
    )
    .ok();
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_features_layer_group ON features(project_id, layer_id, group_id)",
        [],
    ).ok();
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_tasks_status_date ON tasks(project_id, status, end_date)",
        [],
    )
    .ok();
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_content_items_project ON content_items(project_id)",
        [],
    )
    .ok();
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_content_items_type ON content_items(content_type_id)",
        [],
    )
    .ok();

    // --- 3. SEED DATA ---

    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM content_types", [], |r| r.get(0))
        .unwrap_or(0);
    if count == 0 {
        conn.execute("INSERT INTO content_types (name, icon, description) VALUES ('Thiết bị', 'Zap', 'Quản lý máy móc, công cụ tại công trường')", []).ok();
        let type_id: i32 = conn.last_insert_rowid() as i32;
        conn.execute("INSERT INTO content_fields (content_type_id, name, label, field_type, required) VALUES (?1, 'code', 'Mã hiệu', 'text', 1)", params![type_id]).ok();
        conn.execute("INSERT INTO content_fields (content_type_id, name, label, field_type, required) VALUES (?1, 'brand', 'Thương hiệu', 'text', 0)", params![type_id]).ok();
        conn.execute("INSERT INTO content_fields (content_type_id, name, label, field_type, required) VALUES (?1, 'status', 'Tình trạng', 'text', 0)", params![type_id]).ok();
        conn.execute("INSERT INTO content_fields (content_type_id, name, label, field_type, required) VALUES (?1, 'purchase_date', 'Ngày mua', 'date', 0)", params![type_id]).ok();

        conn.execute("INSERT INTO content_types (name, icon, description) VALUES ('Nhân sự dự án', 'Users', 'Danh sách cán bộ, công nhân viên tham gia dự án')", []).ok();
        let type_id: i32 = conn.last_insert_rowid() as i32;
        conn.execute("INSERT INTO content_fields (content_type_id, name, label, field_type, required) VALUES (?1, 'role', 'Chức vụ', 'text', 1)", params![type_id]).ok();
        conn.execute("INSERT INTO content_fields (content_type_id, name, label, field_type, required) VALUES (?1, 'phone', 'Số điện thoại', 'text', 0)", params![type_id]).ok();
        conn.execute("INSERT INTO content_fields (content_type_id, name, label, field_type, required) VALUES (?1, 'email', 'Email', 'text', 0)", params![type_id]).ok();

        conn.execute("INSERT OR IGNORE INTO roles (name, permissions_json) VALUES ('Admin', '{\"all\": true}')", []).ok();
        conn.execute("INSERT OR IGNORE INTO roles (name, permissions_json) VALUES ('Editor', '{\"edit_map\": true, \"edit_tasks\": true}')", []).ok();
        conn.execute("INSERT OR IGNORE INTO roles (name, permissions_json) VALUES ('Viewer', '{\"view_only\": true}')", []).ok();
    }

    Ok(())
}
