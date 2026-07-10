use parking_lot::Mutex;
use rusqlite::Connection;
use std::sync::Arc;


use super::super::projectors::*;
pub use crate::domain::implement::db::projection_engine::{ProjectionEngine, Projector};

// ============================================================================
// ProjectionEngine Orchestrator
// ============================================================================

/// Initializes a standard ProjectionEngine with all V2 projectors registered.
pub fn create_v2_projection_engine(conn: Arc<Mutex<Connection>>) -> ProjectionEngine {
    let mut engine = ProjectionEngine::new(conn);

    // Core Projectors
    engine.register(Arc::new(project::ProjectProjector));
    engine.register(Arc::new(region::RegionProjector));
    engine.register(Arc::new(layer::LayerProjector));
    engine.register(Arc::new(feature_group::FeatureGroupProjector));
    engine.register(Arc::new(feature::FeatureProjector));
    engine.register(Arc::new(file::FileProjector));
    engine.register(Arc::new(task::TaskProjector));

    // Internal Models
    engine.register(Arc::new(contract::ContractProjector));
    engine.register(Arc::new(work_item::WorkItemProjector));
    engine.register(Arc::new(note::NoteProjector));
    engine.register(Arc::new(material::MaterialProjector));
    engine.register(Arc::new(personnel::PersonnelProjector));
    engine.register(Arc::new(role::RoleProjector));
    engine.register(Arc::new(status::StatusProjector));
    engine.register(Arc::new(settings::SettingsProjector));
    engine.register(Arc::new(content_item::ContentItemProjector));

    engine
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn create_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        crate::domain::implement::modules::v2::storage::schema::apply_v2_schema(&conn).unwrap();
        conn
    }

    #[test]
    fn test_v2_engine_registration() {
        let conn = create_test_db();
        let engine = create_v2_projection_engine(Arc::new(Mutex::new(conn)));

        let types = engine.registered_types();
        assert!(types.contains(&"project".to_string()));
        assert!(types.contains(&"task".to_string()));
        assert!(types.contains(&"feature".to_string()));
    }

    #[test]
    fn test_task_projector_apply() {
        let conn = create_test_db();
        let engine = create_v2_projection_engine(Arc::new(Mutex::new(conn)));

        let project_id = Uuid::new_v4();
        let entity_id = Uuid::new_v4();

        let event = EventEnvelope::new(
            project_id,
            "task",
            entity_id,
            AppEvent::TaskCreated {
                id: entity_id,
                name: "Modular Task".to_string(),
                parent_id: None,
                metadata: serde_json::json!({}),
            },
            "test",
            None,
        );

        engine.process_event(&event).unwrap();

        let count: i64 = engine
            .conn
            .lock()
            .query_row("SELECT COUNT(*) FROM tasks", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn test_engine_replay_from_log() {
        let conn = create_test_db();
        let arc_conn = Arc::new(Mutex::new(conn));
        let engine = create_v2_projection_engine(arc_conn.clone());

        let project_id = Uuid::new_v4();
        let entity_id = Uuid::new_v4();

        // 1. Manually insert an event into a dummy log or use existing EventLog if possible
        // For unit test, we can use a mock or just test the replay method if we have events.

        // Actually, ProjectionEngine::replay_from_log takes an EventLog.
        // We'd need to write to a temp directory.
        let temp_dir = tempfile::tempdir().unwrap();
        let event_log = crate::domain::implement::modules::v2::storage::event_log::EventLog::new(
            temp_dir.path(),
        );

        let event = AppEvent::TaskCreated {
            id: entity_id,
            name: "Replay Task".to_string(),
            parent_id: None,
            metadata: serde_json::json!({}),
        };

        let envelope = EventEnvelope::new(project_id, "task", entity_id, event, "test", None);
        event_log.append(&envelope, 0).unwrap();

        // 2. Replay
        let count = engine.replay_from_log(&event_log).unwrap();
        assert_eq!(count, 1);

        // 3. Verify
        let name: String = arc_conn
            .lock()
            .query_row(
                "SELECT name FROM tasks WHERE id = ?",
                [entity_id.to_string()],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(name, "Replay Task");
    }
}
