#[cfg(test)]
mod tests {
    use crate::domain::implement::modules::v2::events::types::AppEvent;
    use serde_json::json;

    #[test]
    fn test_zero_copy_cycle() {
        let event = AppEvent::ProjectCreated {
            name: "Test Project".to_string(),
            root_path: "/tmp".to_string(),
            metadata: json!({"key": "value"}),
        };

        // 1. Convert to Zero-copy Payload
        let payload = event.to_zero_copy_payload();

        // 2. Restore from payload (Zero-copy)
        let restored = AppEvent::from_payload(payload);

        if let AppEvent::ProjectCreated { name, .. } = restored {
            assert_eq!(name, "Test Project");
        } else {
            panic!("Restoration failed");
        }
    }

    #[test]
    fn test_migration_from_json() {
        let legacy_json = json!({
            "ProjectCreated": {
                "name": "Legacy Project",
                "root_path": "/old",
                "metadata": {"legacy": true}
            }
        })
        .to_string();

        // Simulate robust_deserialize
        let restored = AppEvent::robust_deserialize(&legacy_json).unwrap();

        if let AppEvent::ProjectCreated { name, .. } = restored {
            assert_eq!(name, "Legacy Project");
        } else {
            panic!("Migration from JSON failed");
        }
    }
}
