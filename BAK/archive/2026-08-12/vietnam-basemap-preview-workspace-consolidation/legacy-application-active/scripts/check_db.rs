use rusqlite::Connection;
use serde_json::Value;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let db_path = "d:/Code Antinigaty/Phan mem quan ly file V4/RUST/DUAN_CAMERA_LAMDONG.pmp";
    let conn = Connection::open(db_path)?;

    println!("--- PROJECTS TABLE ---");
    let mut stmt = conn.prepare("SELECT id, name, contract_number, investor, contractor, signed_date, duration, end_date FROM projects")?;
    let project_iter = stmt.query_map([], |row| {
        Ok((
            row.get::<_, i32>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, Option<String>>(2)?,
            row.get::<_, Option<String>>(3)?,
            row.get::<_, Option<String>>(4)?,
            row.get::<_, Option<String>>(5)?,
            row.get::<_, Option<String>>(6)?,
            row.get::<_, Option<String>>(7)?,
        ))
    })?;

    for p in project_iter {
        let p = p?;
        println!("ID: {}, Name: {}", p.0, p.1);
        println!("  Contract: {:?}", p.2);
        println!("  Investor: {:?}", p.3);
        println!("  Contractor: {:?}", p.4);
        println!("  Signed Date: {:?}", p.5);
        println!("  Duration: {:?}", p.6);
        println!("  End Date: {:?}", p.7);
    }

    println!("\n--- FILES TABLE (Metadata) ---");
    let mut stmt =
        conn.prepare("SELECT path, metadata_json FROM files WHERE metadata_json IS NOT NULL")?;
    let file_iter = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;

    for f in file_iter {
        let f = f?;
        println!("File: {}", f.0);
        let meta: Value = serde_json::from_str(&f.1)?;
        println!("  Metadata: {}", serde_json::to_string_pretty(&meta)?);
    }

    Ok(())
}
