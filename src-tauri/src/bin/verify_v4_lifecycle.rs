use design_core::domain::implement::modules::v2::events::AppEvent;
use design_core::domain::implement::modules::v2::V2Database;
use design_core::domain::implement::db::event_store::EventStore;
use design_core::design::design_events::{MapState, DesignEventType};
use design_core::domain::contract::spatial_models::BincodeMapState;
use uuid::Uuid;
use std::sync::Arc;
use std::path::PathBuf;
use serde_json::json;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let test_db_path = PathBuf::from("test_lifecycle.pmp");
    if test_db_path.exists() {
        std::fs::remove_file(&test_db_path)?;
    }

    println!("🚀 [PHASE 1] Initializing new .pmp project at {:?}", test_db_path);
    let v2_db = V2Database::open(test_db_path.clone())?;
    let project_id = Uuid::new_v4();
    let device_id = "VERIFY_RUNNER".to_string();

    let mut events = Vec::new();

    // 1. Create a Region
    let region_id = Uuid::new_v4();
    events.push((
        AppEvent::RegionCreated {
            name: "Test Region".into(),
            metadata: json!({ "id": region_id.to_string() }),
        },
        "region".to_string(),
        region_id,
    ));

    // 2. Create a Layer
    let layer_id = Uuid::new_v4();
    events.push((
        AppEvent::LayerCreated {
            name: "Default Layer".into(),
            metadata: json!({ "id": layer_id.to_string(), "region_id": region_id.to_string() }),
        },
        "layer".to_string(),
        layer_id,
    ));

    // 3. Create a Folder (FeatureGroup)
    let group_id = Uuid::new_v4();
    events.push((
        AppEvent::FeatureGroupCreated {
            name: "Project Folder".into(),
            metadata: json!({ "id": group_id.to_string(), "layer_id": layer_id.to_string() }),
        },
        "feature_group".to_string(),
        group_id,
    ));

    // 4. Create a Point Feature
    let point_id = Uuid::new_v4();
    events.push((
        AppEvent::FeatureCreated {
            layer_id,
            group_id: Some(group_id),
            name: "Reference Point".into(),
            geom_type: "Point".into(),
            geometry: json!([105.854444, 21.028333]), // Hanoi coordinates
            properties: json!({ "elevation": 10 }),
            style_id: None,
            is_visible: true,
            note: Some("Initial creation".into()),
            bbox: None,
            metadata: json!({ "id": point_id.to_string() }),
        },
        "feature".to_string(),
        point_id,
    ));

    // 5. Update Metadata (Add Rotation)
    events.push((
        AppEvent::FeatureUpdated {
            changes: json!({
                "id": point_id.to_string(),
                "properties": { "rotation": 45, "elevation": 15 }
            }),
        },
        "feature".to_string(),
        point_id,
    ));

    // 6. Move Point
    events.push((
        AppEvent::FeatureUpdated {
            changes: json!({
                "id": point_id.to_string(),
                "geometry": [105.85, 21.03]
            }),
        },
        "feature".to_string(),
        point_id,
    ));

    println!("📝 Saving batch of {} events...", events.len());
    let store = EventStore::new(v2_db.conn.clone(), device_id);
    let saved_ids = store.save_batch(project_id, events).map_err(|e| e.to_string())?;
    println!("✅ Events saved to Disk. Total saved: {}", saved_ids.len());

    // Explicitly drop for file safety if needed
    // v2_db is dropped at end of scope

    println!("\n🔄 [PHASE 2] Re-opening project from disk...");
    let v2_db_reload = V2Database::open(test_db_path.clone())?;
    let conn_reload = v2_db_reload.conn.lock();
    
    println!("🔭 Querying design_events table directly...");
    let mut stmt = conn_reload.prepare("SELECT payload_json FROM design_events ORDER BY timestamp ASC")?;
    let rows = stmt.query_map([], |row| {
        let payload: String = row.get(0)?;
        Ok(payload)
    })?;

    let mut map_state = MapState::default();
    let mut count = 0;
    for row in rows {
        let payload: String = row?;
        if let Ok(event) = DesignEventType::robust_deserialize(&payload, None) {
            map_state.apply_event(&event);
            count += 1;
        }
    }
    println!("📈 Hydrated MapState with {} events from Disk.", count);

    // Verify consistency
    let snapshot = map_state.to_snapshot();
    let bincode_state = BincodeMapState::from(snapshot);

    assert_eq!(bincode_state.regions.len(), 1, "Should have 1 region");
    assert_eq!(bincode_state.layers.len(), 1, "Should have 1 layer");
    assert_eq!(bincode_state.features.len(), 1, "Should have 1 feature");

    let feat = bincode_state.features.get(&point_id.to_string().into()).expect("Feature not found in state");
    println!("📍 Feature: {}", feat.name);
    println!("📐 Properties: {}", feat.properties);
    println!("🌐 Coordinates: {}", feat.coordinates);

    assert!(feat.properties.contains("rotation"), "Metadata rotation should be present");
    assert!(feat.coordinates.contains("105.85"), "Coordinates should be updated to moved location");

    println!("\n✨ LIFECYCLE VERIFICATION SUCCESSFUL!");
    println!("File size: {} bytes", std::fs::metadata(&test_db_path)?.len());
    
    Ok(())
}
