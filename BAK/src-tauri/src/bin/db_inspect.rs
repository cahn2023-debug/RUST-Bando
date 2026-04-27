use rusqlite::Connection;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let db_path = "project_v4.pmp";
    let conn = Connection::open(db_path)?;

    println!("--- TABLES ---");
    let mut stmt = conn.prepare("SELECT name FROM sqlite_master WHERE type='table'")?;
    let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;

    for row in rows {
        let table_name = row?;
        println!("Table: {}", table_name);

        let mut col_stmt = conn.prepare(&format!("PRAGMA table_info({})", table_name))?;
        let col_rows = col_stmt.query_map([], |r| r.get::<_, String>(1))?;
        print!("  Columns: ");
        for col_row in col_rows {
            print!("{}, ", col_row?);
        }
        println!("\n");
    }

    Ok(())
}
