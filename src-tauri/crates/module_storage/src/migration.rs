use crate::models::EventEnvelope;

pub const LATEST_VERSION: i32 = 3;

pub struct EventMigrator;

impl EventMigrator {
    pub fn upcast<'a>(mut event: EventEnvelope<'a>) -> EventEnvelope<'a> {
        while event.schema_version < LATEST_VERSION {
            event = match event.schema_version {
                1 => Self::migrate_v1_to_v2(event),
                2 => Self::migrate_v2_to_v3(event),
                _ => break,
            };
        }
        event
    }

    fn migrate_v1_to_v2<'a>(mut event: EventEnvelope<'a>) -> EventEnvelope<'a> {
        // Logic for V1 -> V2 migration
        // For example, changing a field or adding a default value
        event.schema_version = 2;
        event
    }

    fn migrate_v2_to_v3<'a>(mut event: EventEnvelope<'a>) -> EventEnvelope<'a> {
        // Logic for V2 -> V3 migration
        event.schema_version = 3;
        event
    }
}
