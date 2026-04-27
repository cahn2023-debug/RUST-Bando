use rusqlite::Connection;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let path = "D:\\Code Antinigaty\\Phan mem quan ly file V4\\Du_an_165.pmp";
    let conn = Connection::open(path)?;

    let mut stmt = conn.prepare("SELECT name FROM sqlite_master WHERE type='table'")?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;

    println!("Tables in {}:", path);
    for row in rows {
        let table = row?;
        println!(" - {}", table);

        let mut info_stmt = conn.prepare(&format!("PRAGMA table_info(\"{}\")", table))?;
        let info_rows =
            info_stmt.query_map([], |r| Ok((r.get::<_, String>(1)?, r.get::<_, String>(2)?)))?;
        for info in info_rows {
            let (name, decl_type) = info?;
            println!("    - {}: {}", name, decl_type);
        }
    }
    Ok(())
}
