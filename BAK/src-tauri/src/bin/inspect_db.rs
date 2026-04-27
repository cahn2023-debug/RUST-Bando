use rusqlite::Connection;

fn main() {
    let db_path = "D:\\Code Antinigaty\\Phan mem quan ly file V4\\Du_an_165_fix.pmp";
    let conn = Connection::open(db_path).unwrap();

    println!("--- FeatureCreated Events ---");
    let mut stmt = conn
        .prepare(
            "SELECT id, project_id, entity_id, payload_json FROM event_store 
         WHERE entity_type = 'feature' AND event_type = 'created' LIMIT 10",
        )
        .unwrap();

    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
            ))
        })
        .unwrap();

    let mut found = false;
    for row in rows {
        let (id, project_id, entity_id, payload) = row.unwrap();
        println!("ID: {}, Project: {}, Entity: {}", id, project_id, entity_id);
        println!("Payload: {}", payload);
        println!("---");
        found = true;
    }
    if !found {
        println!("No FeatureCreated events found using event_type = 'created'. Checking event_type = 'FeatureCreated'...");
        let mut stmt = conn
            .prepare(
                "SELECT id, payload_json FROM event_store 
             WHERE entity_type = 'feature' AND event_type = 'FeatureCreated' LIMIT 3",
            )
            .unwrap();
        let rows = stmt
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
            .unwrap();
        for r in rows {
            let (id, p) = r.unwrap();
            println!("ID: {}, Payload: {}", id, p);
        }
    }

    println!("\n--- FeatureUpdated Events ---");
    let mut stmt = conn
        .prepare(
            "SELECT id, payload_json FROM event_store 
         WHERE entity_type = 'feature' AND event_type = 'updated' LIMIT 5",
        )
        .unwrap();

    let rows = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .unwrap();

    for row in rows {
        let (id, payload) = row.unwrap();
        println!("ID: {}, Payload: {}", id, payload);
    }
}
