use rusqlite::Connection;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let path = "d:\\Code Antinigaty\\Phan mem quan ly file V4\\RUST\\project_v4.pmp";
    println!("Checking database: {}", path);
    let conn = Connection::open(path)?;

    // 1. Check if event_store exists
    let table_exists: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='event_store'",
        [],
        |r| r.get(0)
    ).unwrap_or(0);

    if table_exists == 0 {
        println!("❌ Error: event_store table DOES NOT exist in this file.");
        return Ok(());
    }
    println!("✅ event_store table exists.");

    // 2. Count events
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM event_store", [], |r| r.get(0))?;
    println!("Total events in store: {}", count);

    // 3. Distribution by type
    let mut stmt = conn.prepare("SELECT event_type, COUNT(*) FROM event_store GROUP BY event_type")?;
    let mut rows = stmt.query([])?;
    println!("Event distribution:");
    while let Some(row) = rows.next()? {
        let etype: String = row.get(0)?;
        let ecount: i64 = row.get(1)?;
        println!("  - {}: {}", etype, ecount);
    }

    // 4. Sample a FeatureCreated event to check geom_type
    let mut stmt = conn.prepare("SELECT payload FROM event_store WHERE event_type = 'FeatureCreated' LIMIT 1")?;
    let mut rows = stmt.query([])?;
    if let Some(row) = rows.next()? {
        let payload: String = row.get(0)?;
        println!("\nSample FeatureCreated Payload:");
        println!("{}", payload);
    }

    Ok(())
}
