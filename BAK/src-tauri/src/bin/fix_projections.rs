use design_core::implement::modules::v2::projections::{
    ContentItemProjector, ContractProjector, FeatureGroupProjector, FeatureProjector,
    FileProjector, LayerProjector, MaterialProjector, NoteProjector, ProjectProjector, Projector,
    SettingsProjector, TaskProjector, WorkItemProjector,
};
use rusqlite::{params, Connection};
use uuid::Uuid;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let db_path = "D:\\Code Antinigaty\\Phan mem quan ly file V4\\Du_an_165.pmp";
    let conn = Connection::open(db_path)?;

    println!("--- EMERGENCY SYNC & REBUILD ---");

    // 1. Identify all project IDs with events
    let mut stmt = conn.prepare("SELECT DISTINCT project_id FROM event_store")?;
    let event_pids: Vec<String> = stmt
        .query_map([], |row| row.get(0))?
        .collect::<Result<Vec<String>, _>>()?;

    println!(
        "Found {} unique project IDs in event_store.",
        event_pids.len()
    );

    for pid_str in event_pids {
        println!("\nChecking Project ID: {}", pid_str);

        let pid = Uuid::parse_str(&pid_str)?;

        // Ensure project exists in projects table
        let exists: i64 = conn.query_row(
            "SELECT COUNT(*) FROM projects WHERE id = ?",
            params![pid_str],
            |r| r.get(0),
        )?;
        if exists == 0 {
            println!(
                "  [ALIGN] Project {} not in projects table. Inserting...",
                pid_str
            );
            conn.execute(
                "INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, datetime('now'), datetime('now'))",
                params![pid_str, "Du_an_165"],
            )?;
        }

        // Projectors to run
        let projectors: Vec<Box<dyn Projector>> = vec![
            Box::new(ProjectProjector),
            Box::new(FileProjector),
            Box::new(TaskProjector),
            Box::new(FeatureProjector),
            Box::new(WorkItemProjector),
            Box::new(ContractProjector),
            Box::new(LayerProjector),
            Box::new(FeatureGroupProjector),
            Box::new(NoteProjector),
            Box::new(MaterialProjector),
            Box::new(SettingsProjector),
            Box::new(ContentItemProjector),
        ];

        for projector in projectors {
            let entity = projector.entity_type();
            print!("  Rebuilding {}... ", entity);
            match projector.rebuild(&conn, pid) {
                Ok(count) => println!("OK ({} rows)", count),
                Err(e) => println!("ERROR: {}", e),
            }
        }
    }

    // 3. Final verification
    println!("\n--- Final Verification ---");
    let feature_count: i64 = conn.query_row("SELECT COUNT(*) FROM features", [], |r| r.get(0))?;
    println!("Total features in DB: {}", feature_count);

    println!("\nDONE.");
    Ok(())
}
