use crate::domain::implement::modules::v2::projections::Projector;
use crate::domain::models::v2::EventEnvelope;
use rusqlite::Connection;
use uuid::Uuid;

pub struct IngestionProjector;

impl Projector for IngestionProjector {
    fn entity_type(&self) -> &str {
        "ingestion"
    }

    fn apply(&self, _conn: &Connection, _envelope: &EventEnvelope) -> Result<(), String> {
        // match &envelope.event { ... }
        Ok(())
    }

    fn rebuild(&self, _conn: &Connection, _project_id: Uuid) -> Result<usize, String> {
        Ok(0)
    }
}
