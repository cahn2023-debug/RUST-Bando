#[cfg(test)]
mod tests {
    use crate::models::{EventEnvelope, EventPayload};
    use crate::StorageService;
    use std::borrow::Cow;
    use std::time::{SystemTime, UNIX_EPOCH};
    use uuid::Uuid;

    fn now() -> i64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64
    }

    #[tokio::test]
    async fn test_event_sourcing_flow() {
        let temp_dir = tempfile::tempdir().unwrap();
        let db_path = temp_dir.path().join("test.db");

        let storage = StorageService::new();
        storage.open(db_path).await.expect("Failed to open DB");

        let repo = storage.get_repo().await.expect("Failed to get repo");

        let entity_id = Uuid::new_v4();

        // 1. Append TaskCreated event
        let event1 = EventEnvelope {
            event_id: Uuid::new_v4(),
            entity_id,
            schema_version: 1,
            created_at: now(),
            payload: EventPayload::TaskCreated {
                project_id: Uuid::new_v4(),
                parent_id: None,
                title: "Test Task".to_string(),
                priority: 1,
                status: "TODO".to_string(),
                color: None,
                start_date: None,
                end_date: None,
                created_at: now(),
            },
        };

        repo.append_event_and_project(event1)
            .await
            .expect("Failed to append event 1");

        // 2. Append FeatureUpdated event (Zero-copy test)
        let geometry = vec![0, 1, 2, 3, 4, 5];
        let event2 = EventEnvelope {
            event_id: Uuid::new_v4(),
            entity_id,
            schema_version: 2,
            created_at: now() + 1,
            payload: EventPayload::FeatureUpdated {
                feature_id: entity_id,
                project_id: Some(Uuid::new_v4()),
                name: Some("Test Feature".to_string()),
                layer_id: Some(Uuid::new_v4()),
                geom_type: Some("Point".to_string()),
                geometry_wkb: Cow::Borrowed(&geometry),
            },
        };

        repo.append_event_and_project(event2)
            .await
            .expect("Failed to append event 2");

        // 3. Verify events retrieval and Upcasting
        let events = repo
            .get_entity_events(entity_id)
            .await
            .expect("Failed to get events");
        assert_eq!(events.len(), 2);

        // Check first event upcasted from V1 to LATEST_VERSION (3)
        assert_eq!(events[0].schema_version, 3);

        // 4. Verify Read Model (Projections)
        let row = sqlx::query("SELECT title, priority FROM tasks WHERE id = ?1")
            .bind(entity_id.as_bytes().as_slice())
            .fetch_one(&repo.pool)
            .await
            .expect("Failed to fetch task projection");

        use sqlx::Row;
        let title: String = row.get(0);
        let priority: i32 = row.get(1);
        assert_eq!(title, "Test Task");
        assert_eq!(priority, 1);
    }
}
