use rusqlite::{params, Connection};
use std::path::Path;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let db_path = "D:\\Code Antinigaty\\Phan mem quan ly file V4\\Du_an_165.pmp";
    println!("Checking database: {}", db_path);

    if !Path::new(db_path).exists() {
        println!("Error: File does not exist");
        return Ok(());
    }

    let conn = Connection::open(db_path)?;

    // Check tables
    let mut stmt = conn.prepare("SELECT name FROM sqlite_master WHERE type='table'")?;
    let tables: Vec<String> = stmt
        .query_map([], |row| row.get(0))?
        .filter_map(|r| r.ok())
        .collect();
    println!("Tables: {:?}", tables);

    // Check version
    let is_v2 = tables.contains(&"event_store".to_string());
    println!("Is V2: {}", is_v2);

    if is_v2 {
        let event_count: i64 =
            conn.query_row("SELECT COUNT(*) FROM event_store", [], |r| r.get(0))?;
        println!("Event count: {}", event_count);

        let feature_count: i64 =
            conn.query_row("SELECT COUNT(*) FROM features", [], |r| r.get(0))?;
        println!("Feature count (V2): {}", feature_count);

        if tables.contains(&"v1_features".to_string()) {
            let v1_feature_count: i64 =
                conn.query_row("SELECT COUNT(*) FROM v1_features", [], |r| r.get(0))?;
            println!("V1 Feature count (backup): {}", v1_feature_count);
        }
    } else {
        if tables.contains(&"features".to_string()) {
            let feature_count: i64 =
                conn.query_row("SELECT COUNT(*) FROM features", [], |r| r.get(0))?;
            println!("Feature count (V1): {}", feature_count);
        }
    }

    Ok(())
}
