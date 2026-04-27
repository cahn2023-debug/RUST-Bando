use rusqlite::Connection;

fn main() {
    if let Err(e) = run() {
        eprintln!("ERROR: {:?}", e);
        std::process::exit(1);
    }
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let path = "D:\\Code Antinigaty\\Phan mem quan ly file V4\\Du_an_165.pmp";
    println!("Inspecting file: {}", path);
    let conn = Connection::open(path)?;

    let mut stmt = conn.prepare("SELECT name FROM sqlite_master WHERE type='table'")?;
    let tables: Vec<String> = stmt
        .query_map([], |row| row.get(0))?
        .filter_map(|r| r.ok())
        .collect();

    println!("Tables found: {:?}", tables);

    for table in &[
        "v1_design_events",
        "design_events",
        "event_store",
        "v1_projects",
        "projects",
    ] {
        if tables.contains(&table.to_string()) {
            println!("\n--- Table: {} ---", table);
            let count: i64 = conn
                .query_row(&format!("SELECT COUNT(*) FROM {}", table), [], |r| r.get(0))
                .unwrap_or(0);
            println!("Count: {}", count);

            if count > 0 {
                let mut stmt = conn.prepare(&format!("SELECT * FROM {} LIMIT 3", table))?;
                let col_count = stmt.column_count();
                println!("Columns: {:?}", stmt.column_names());

                println!("Sample (top 3):");
                let mut rows = stmt.query([])?;
                while let Some(row) = rows.next()? {
                    let mut vals = Vec::new();
                    for i in 0..col_count {
                        let val = match row.get::<_, rusqlite::types::Value>(i)? {
                            rusqlite::types::Value::Null => "NULL".to_string(),
                            rusqlite::types::Value::Integer(i) => i.to_string(),
                            rusqlite::types::Value::Real(f) => f.to_string(),
                            rusqlite::types::Value::Text(s) => s,
                            rusqlite::types::Value::Blob(b) => format!("<blob {} bytes>", b.len()),
                        };
                        vals.push(val);
                    }
                    println!("  {}", vals.join(" | "));
                }

                if table.contains("events") || table.contains("store") {
                    println!("Project IDs in this table:");
                    if let Ok(mut stmt) =
                        conn.prepare(&format!("SELECT DISTINCT project_id FROM {}", table))
                    {
                        let mut rows = stmt.query([])?;
                        while let Some(row) = rows.next()? {
                            let id: rusqlite::types::Value = row.get(0)?;
                            println!("  - {:?}", id);
                        }
                    } else if let Ok(mut stmt) =
                        conn.prepare(&format!("SELECT DISTINCT project_uuid FROM {}", table))
                    {
                        let mut rows = stmt.query([])?;
                        while let Some(row) = rows.next()? {
                            let id: rusqlite::types::Value = row.get(0)?;
                            println!("  - {:?}", id);
                        }
                    }
                }
            }
        }
    }

    Ok(())
}
