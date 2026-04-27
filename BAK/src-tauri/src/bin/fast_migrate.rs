use rusqlite::{params, Connection};
use std::path::Path;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let path_str = "d:\\Code Antinigaty\\Phan mem quan ly file V4\\RUST\\project_v4.pmp";
    let path = Path::new(path_str);
    
    if !path.exists() {
        println!("❌ File not found: {}", path_str);
        return Ok(());
    }

    println!("🚀 Starting FAST migration for: {}", path_str);
    let conn = Connection::open(path)?;

    // 1. Check if already V2
    let is_v2: bool = conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='pmp_metadata'",
        [],
        |r| Ok(r.get::<_, i64>(0)? > 0)
    ).unwrap_or(false);

    if is_v2 {
        println!("✅ Database is already V2. No migration needed.");
        return Ok(());
    }

    // 2. Rename V1 tables (Safety: check if they exist)
    let tables_to_rename = vec!["features", "regions", "layers", "world_state", "project_info"];
    for table in tables_to_rename {
        let exists: bool = conn.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?",
            params![table],
            |r| Ok(r.get::<_, i64>(0)? > 0)
        ).unwrap_or(false);
        
        if exists {
            println!("   - Renaming {} to v1_{}", table, table);
            conn.execute(&format!("ALTER TABLE {} RENAME TO v1_{}", table, table), [])?;
        }
    }

    // 3. Create V2 infrastructure
    println!("   - Creating V2 infrastructure...");
    conn.execute_batch("
        CREATE TABLE pmp_metadata (key TEXT PRIMARY KEY, value TEXT);
        INSERT INTO pmp_metadata (key, value) VALUES ('version', '5.2.0');
        
        CREATE TABLE event_store (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            aggregate_id TEXT NOT NULL,
            aggregate_type TEXT NOT NULL,
            event_type TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            metadata_json TEXT,
            version INTEGER NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE TABLE features (
            id TEXT PRIMARY KEY,
            layer_id TEXT NOT NULL,
            type TEXT NOT NULL,
            geometry_json TEXT NOT NULL,
            properties_json TEXT NOT NULL,
            metadata_json TEXT,
            version INTEGER NOT NULL
        );

        CREATE TABLE layers (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            visible INTEGER DEFAULT 1,
            locked INTEGER DEFAULT 0,
            opacity REAL DEFAULT 1.0,
            metadata_json TEXT,
            version INTEGER NOT NULL
        );
    ")?;

    // 4. Migrate Features to event_store (Synthetic events)
    println!("   - Migrating Features to event_store...");
    let mut stmt = conn.prepare("SELECT id, layer_id, geometry_json, properties_json, geom_type FROM v1_features")?;
    let features_iter = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?, // id
            row.get::<_, String>(1)?, // layer_id
            row.get::<_, String>(2)?, // geometry
            row.get::<_, String>(3)?, // properties
            row.get::<_, String>(4)?, // type (geom_type)
        ))
    })?;

    let mut count = 0;
    for feat in features_iter {
        let (id, layer_id, geom, props, geom_type) = feat?;
        // Create a synthetic FeatureCreated event
        let payload = format!(r#"{{"id":"{}","layer_id":"{}","geom_type":"{}","geometry":{},"properties":{}}}"#, 
            id, layer_id, geom_type, geom, props);
            
        conn.execute(
            "INSERT INTO event_store (aggregate_id, aggregate_type, event_type, payload_json, version) VALUES (?, ?, ?, ?, ?)",
            params![id, "Feature", "FeatureCreated", payload, 1]
        )?;
        
        // Also insert into projection for immediate UI use
        conn.execute(
            "INSERT INTO features (id, layer_id, type, geometry_json, properties_json, version) VALUES (?, ?, ?, ?, ?, ?)",
            params![id, layer_id, geom_type, geom, props, 1]
        )?;
        count += 1;
    }
    println!("   - Migrated {} features.", count);

    println!("🎉 Migration completed successfully!");
    Ok(())
}
