use design_core::domain::implement::modules::v2::events::AppEvent;
use module_storage::models::EventPayload as V5Payload;
use rusqlite::{params, Connection};
use serde_json::json;
use std::borrow::Cow;
use std::time::Instant;
use uuid::Uuid;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("🚀 Starting GIS Performance Benchmark (10,000+ Features)...");

    let mut conn = Connection::open_in_memory()?;
    setup_schemas(&conn)?;

    let count = 10_000;
    println!("📊 Generating {} random features...", count);
    let features: Vec<(Uuid, String, Vec<u8>)> = (0..count)
        .map(|_| {
            let id = Uuid::new_v4();
            let name = format!("Feature {}", id);
            // Simple WKB Point (simplified for benchmark)
            let wkb = vec![
                1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            ];
            (id, name, wkb)
        })
        .collect();

    // --- BENCHMARK V2 (JSON) ---
    println!("⏱️ Measuring V2 (JSON-based) Insertion...");
    let start_v2 = Instant::now();
    let tx = conn.transaction()?;
    for (id, name, _) in &features {
        let payload = json!({
            "type": "FeatureUpdated",
            "feature_id": id.to_string(),
            "properties": { "name": name },
            "geometry": { "type": "Point", "coordinates": [0.0, 0.0] }
        })
        .to_string();

        tx.execute(
            "INSERT INTO event_store_v2 (id, entity_id, payload) VALUES (?1, ?2, ?3)",
            params![Uuid::new_v4().to_string(), id.to_string(), payload],
        )?;
    }
    tx.commit()?;
    let duration_v2 = start_v2.elapsed();
    println!("✅ V2 Finished: {:?}", duration_v2);

    // --- BENCHMARK V5.3 (WKB + Bincode) ---
    println!("⏱️ Measuring V5.3 (WKB/Bincode-based) Insertion...");
    let start_v5 = Instant::now();
    let tx = conn.transaction()?;
    for (id, name, wkb) in &features {
        let v5_payload = V5Payload::FeatureUpdated {
            feature_id: *id,
            project_id: Some(Uuid::nil()),
            name: Some(name.clone()),
            layer_id: Some(Uuid::nil()),
            geom_type: Some("Point".to_string()),
            geometry_wkb: wkb.clone().into(),
        };

        // Use bincode2 (2.0.0-rc.3 alias)
        let payload_blob =
            bincode2::serde::encode_to_vec(&v5_payload, bincode2::config::standard())?;
        let event_id = Uuid::new_v4().into_bytes();
        let entity_id = id.into_bytes();
        let schema_version = 1i32;
        let created_at = 123456789i64;

        tx.execute(
            "INSERT INTO event_store_v5 (id, entity_id, schema_version, created_at, payload)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                &event_id.as_slice(),
                &entity_id.as_slice(),
                &schema_version,
                &created_at,
                &payload_blob
            ],
        )?;

        tx.execute(
            "INSERT INTO features_v5 (id, project_id, name, layer_id, geom_type, geometry, last_event_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                &id.into_bytes().as_slice(),
                &Uuid::nil().into_bytes().as_slice(),
                &name,
                &Uuid::nil().into_bytes().as_slice(),
                "Point",
                &wkb.as_slice(),
                &event_id.as_slice()
            ],
        )?;
    }
    tx.commit()?;
    let duration_v5 = start_v5.elapsed();
    println!("✅ V5.3 Finished: {:?}", duration_v5);

    println!("\n--- FINAL REPORT ---");
    println!("V2 Total Time:   {:?}", duration_v2);
    println!("V5.3 Total Time: {:?}", duration_v5);
    let speedup = duration_v2.as_secs_f64() / duration_v5.as_secs_f64();
    println!("🚀 Speedup: {:.2}x", speedup);
    println!("--------------------");

    Ok(())
}

fn setup_schemas(conn: &Connection) -> rusqlite::Result<()> {
    // V2 Schema
    conn.execute(
        "CREATE TABLE event_store_v2 (
            id TEXT PRIMARY KEY,
            entity_id TEXT,
            payload TEXT
        )",
        [],
    )?;

    // V5.3 Schema
    conn.execute(
        "CREATE TABLE event_store_v5 (
            id BLOB PRIMARY KEY,
            entity_id BLOB,
            schema_version INTEGER,
            created_at INTEGER,
            payload BLOB
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE features_v5 (
            id BLOB PRIMARY KEY,
            project_id BLOB,
            name TEXT,
            layer_id BLOB,
            geom_type TEXT,
            geometry BLOB,
            last_event_id BLOB
        )",
        [],
    )?;

    Ok(())
}
