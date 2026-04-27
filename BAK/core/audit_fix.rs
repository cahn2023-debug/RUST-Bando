use rusqlite::Connection;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let db_path = "J:/My Drive/-----TRIEN KHAI -----/Duan_Camera_LamDong.pmp";
    let conn = Connection::open(db_path)?;

    println!("--- Projects Table Check ---");
    let mut stmt = conn.prepare("SELECT id, name, contract_number, investor FROM projects")?;
    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, Option<String>>(2)?,
            row.get::<_, Option<String>>(3)?,
        ))
    })?;
    for row in rows {
        let (id, name, cn, inv) = row?;
        println!(
            "[ID:{}] Name: '{}' | CN: '{:?}' | Inv: '{:?}'",
            id, name, cn, inv
        );
    }

    println!("--- Files Table Count ---");
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM files", [], |r| r.get(0))?;
    println!("Total files: {}", count);

    println!("--- WorkItems Count ---");
    let wi_count: i64 = conn.query_row("SELECT COUNT(*) FROM work_items", [], |r| r.get(0))?;
    println!("Total WorkItems (BOM): {}", wi_count);

    Ok(())
}
