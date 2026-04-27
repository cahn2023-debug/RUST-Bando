use rusqlite::Connection;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let path = "D:\\Code Antinigaty\\Phan mem quan ly file V4\\Du_an_165.pmp";
    println!("Inspecting event_store columns for: {}", path);
    let conn = Connection::open(path)?;

    let mut stmt = conn.prepare("PRAGMA table_info(event_store)")?;
    let mut rows = stmt.query([])?;

    println!("Columns in event_store:");
    while let Some(row) = rows.next()? {
        let name: String = row.get(1)?;
        let dtype: String = row.get(2)?;
        println!("  - {}: {}", name, dtype);
    }

    println!("\nSample data (FeatureCreated):");
    let mut stmt = conn.prepare(
        "SELECT id, payload_json FROM event_store WHERE event_type = 'FeatureCreated' LIMIT 1",
    )?;
    let mut rows = stmt.query([])?;
    if let Some(row) = rows.next()? {
        let id: String = row.get(0)?;
        let payload: String = row.get(1)?;
        println!("ID: {}", id);
        println!("Payload: {}", payload);
    }

    Ok(())
}
