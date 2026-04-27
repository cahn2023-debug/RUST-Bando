use rusqlite::Connection;
use design_core::domain::implement::modules::v2::V1ToV2Migrator;
use std::path::Path;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let path_str = "d:\\Code Antinigaty\\Phan mem quan ly file V4\\RUST\\project_v4.pmp";
    let path = Path::new(path_str);
    
    if !path.exists() {
        println!("❌ File not found: {}", path_str);
        return Ok(());
    }

    println!("🚀 Starting FORCED migration for: {}", path_str);
    
    // Create connection
    let conn = Connection::open(path)?;
    
    // Check if truly V1 (lack of pmp_metadata)
    let is_v2: bool = conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='pmp_metadata'",
        [],
        |r| {
            let count: i64 = r.get(0)?;
            Ok(count > 0)
        }
    ).unwrap_or(false);

    if is_v2 {
        println!("⚠️ Database is ALREADY V2 (pmp_metadata exists). Force migration might fail if logic checks this.");
    }

    // Attempt migration
    match V1ToV2Migrator::migrate(&conn) {
        Ok(report) => {
            println!("✅ Migration SUCCESS!");
            println!("   - Events: {}", report.event_count);
            println!("   - Tasks: {}", report.task_count);
            println!("   - Features: {}", report.feature_count);
            println!("   - Errors: {:?}", report.errors);
        },
        Err(e) => {
            println!("❌ Migration FAILED: {}", e);
            if e.contains("already V2") {
                 println!("💡 Trying to rebuild projections instead...");
                 // In some cases we just need to rebuild projections if event_store exists
            }
        }
    }

    Ok(())
}
