use crate::migration::EventMigrator;
use crate::models::{EventEnvelope, EventPayload};
use crate::projector::CoreProjector;
use anyhow::{anyhow, Result};
use futures::StreamExt;
use sqlx::{Pool, Row, Sqlite};
use std::time::Duration;
use uuid::Uuid;

#[derive(Clone)]
pub struct EventRepository {
    pub pool: Pool<Sqlite>,
}

impl EventRepository {
    pub fn new(pool: Pool<Sqlite>) -> Self {
        Self { pool }
    }

    /// Helper with Exponential Backoff for SQLITE_BUSY
    async fn with_retry<F, T, Fut>(&self, mut f: F) -> Result<T>
    where
        F: FnMut() -> Fut,
        Fut: std::future::Future<Output = Result<T>>,
    {
        let mut attempts = 0;
        let max_attempts = 5;
        let mut delay = Duration::from_millis(10);

        loop {
            match f().await {
                Ok(res) => return Ok(res),
                Err(e) if attempts < max_attempts => {
                    let err_msg = e.to_string();
                    if err_msg.contains("database is locked")
                        || err_msg.contains("code 5")
                        || err_msg.contains("code 6")
                    {
                        attempts += 1;
                        tokio::time::sleep(delay).await;
                        delay *= 2;
                        continue;
                    }
                    return Err(e);
                }
                Err(e) => return Err(e),
            }
        }
    }

    pub async fn append_event_and_project(&self, event: EventEnvelope<'_>) -> Result<()> {
        let payload_json = serde_json::to_string(&event.payload)
            .map_err(|e| anyhow!("Failed to serialize payload to JSON: {}", e))?;

        let event_id = event.event_id.as_bytes();
        let entity_id = event.entity_id.as_bytes();

        self.with_retry(|| async {
            let mut tx = self.pool.begin().await?;

            // 1. Save to event_store
            sqlx::query(
                "INSERT INTO event_store (id, entity_id, schema_version, created_at, payload) VALUES (?1, ?2, ?3, ?4, ?5)",
            )
            .bind(event_id.as_slice())
            .bind(entity_id.as_slice())
            .bind(event.schema_version)
            .bind(event.created_at)
            .bind(payload_json.as_str()) // Store as TEXT/JSON
            .execute(&mut *tx)
            .await?;

            // 2. Call Projector
            CoreProjector::apply_in_tx(&mut tx, &event).await?;

            tx.commit().await?;
            Ok(())
        })
        .await
    }

    pub async fn get_entity_events(&self, entity_id: Uuid) -> Result<Vec<EventEnvelope<'static>>> {
        let e_id = entity_id.as_bytes();
        let mut rows = sqlx::query(
            "SELECT id, entity_id, schema_version, created_at, payload FROM event_store WHERE entity_id = ?1 ORDER BY created_at ASC",
        )
        .bind(e_id.as_slice())
        .fetch(&self.pool);

        let mut events = Vec::new();
        while let Some(row_res) = rows.next().await {
            let row = row_res?;
            let id: Vec<u8> = row.get(0);
            let entity_id: Vec<u8> = row.get(1);
            let schema_version: i32 = row.get(2);
            let created_at: i64 = row.get(3);
            
            // Handle both BLOB (old Bincode/Binary) and TEXT (JSON)
            let payload: EventPayload<'static> = match row.try_get::<String, _>(4) {
                Ok(json_str) => {
                    let p: EventPayload = serde_json::from_str(&json_str)
                        .map_err(|e| anyhow!("Failed to parse JSON string: {}", e))?;
                    p.into_owned()
                }
                Err(_) => {
                    return Err(anyhow!("Found binary payload in event_store. Please migrate to JSON format."));
                }
            };

            let envelope = EventEnvelope {
                event_id: Uuid::from_slice(&id)
                    .map_err(|e| anyhow!("Invalid UUID in DB: {}", e))?,
                entity_id: Uuid::from_slice(&entity_id)
                    .map_err(|e| anyhow!("Invalid UUID in DB: {}", e))?,
                schema_version,
                created_at,
                payload,
            };

            // Upcast (Lazy Migration)
            let upcasted = EventMigrator::upcast(envelope);

            // Convert to 'static for return
            events.push(upcasted.into_owned());
        }

        Ok(events)
    }
}
