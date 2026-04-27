use rusqlite::{Connection, Result};

fn main() -> Result<()> {
    let db_path = "D:\\Code Antinigaty\\Phan mem quan ly file V4\\Du_an_165.pmp";
    let conn = Connection::open(db_path)?;

    println!("--- DB AUDIT: {} ---", db_path);

    // 1. Projects
    println!("\n--- Projects Table ---");
    let mut stmt = conn.prepare("SELECT id, name FROM projects")?;
    let projects = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;
    for p in projects {
        let (id, name) = p?;
        println!("  Project: {} ({})", id, name);
    }

    // 2. Event Store IDs
    println!("\n--- Event Store Project IDs ---");
    let mut stmt =
        conn.prepare("SELECT project_id, COUNT(*) FROM event_store GROUP BY project_id")?;
    let event_pids = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
    })?;
    for p in event_pids {
        let (id, count) = p?;
        println!("  Project ID: {} ({} events)", id, count);
    }

    println!("\n--- Event Store Entity Types ---");
    let mut stmt =
        conn.prepare("SELECT entity_type, COUNT(*) FROM event_store GROUP BY entity_type")?;
    let types = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
    })?;
    for t in types {
        let (name, count) = t?;
        println!("  Entity Type: {:<15} | Events: {}", name, count);
    }

    // 3. Table Counts
    println!("\n--- Table Counts ---");
    let tables = vec![
        "event_store",
        "features",
        "projects",
        "design_events",
        "work_items",
        "files",
        "tasks",
        "layers",
    ];
    for table in tables {
        let count: i64 = conn
            .query_row(&format!("SELECT count(*) FROM {}", table), [], |row| {
                row.get(0)
            })
            .unwrap_or(-1);
        println!("  Table: {:<15} | Rows: {}", table, count);
    }

    Ok(())
}
