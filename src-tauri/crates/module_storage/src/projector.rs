use crate::models::{EventEnvelope, EventPayload};
use anyhow::Result;
use sqlx::{Sqlite, Transaction};

pub struct CoreProjector;

impl CoreProjector {
    pub async fn apply_in_tx(
        tx: &mut Transaction<'_, Sqlite>,
        event: &EventEnvelope<'_>,
    ) -> Result<()> {
        let event_id = event.event_id.as_bytes();
        let entity_id = event.entity_id.as_bytes();

        match &event.payload {
            EventPayload::TaskCreated {
                project_id,
                parent_id,
                title,
                priority,
                status,
                color,
                start_date,
                end_date,
                ..
            } => {
                let p_id = project_id.as_bytes();
                let parent_uuid = parent_id.map(|u| u.as_bytes().to_vec());
                sqlx::query(
                    r#"
                    INSERT INTO tasks (
                        id, project_id, parent_id, title, priority, status, 
                        color, start_date, end_date, last_event_id
                    )
                    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
                    ON CONFLICT(id) DO UPDATE SET
                        project_id = excluded.project_id,
                        parent_id = excluded.parent_id,
                        title = excluded.title,
                        priority = excluded.priority,
                        status = excluded.status,
                        color = excluded.color,
                        start_date = excluded.start_date,
                        end_date = excluded.end_date,
                        last_event_id = excluded.last_event_id
                    WHERE excluded.last_event_id != tasks.last_event_id
                    "#,
                )
                .bind(entity_id.as_slice())
                .bind(p_id.as_slice())
                .bind(parent_uuid)
                .bind(title)
                .bind(priority)
                .bind(status)
                .bind(color)
                .bind(start_date)
                .bind(end_date)
                .bind(event_id.as_slice())
                .execute(&mut **tx)
                .await?;
            }
            EventPayload::FeatureUpdated {
                feature_id,
                project_id,
                name,
                layer_id,
                geom_type,
                geometry_wkb,
            } => {
                let f_id = feature_id.as_bytes();
                let p_id = project_id.map(|u| u.as_bytes().to_vec());
                let l_id = layer_id.map(|u| u.as_bytes().to_vec());
                let geom = geometry_wkb.as_ref();

                sqlx::query(
                    r#"
                    INSERT INTO features (id, project_id, name, layer_id, geom_type, geometry, last_event_id)
                    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                    ON CONFLICT(id) DO UPDATE SET
                        project_id = COALESCE(excluded.project_id, features.project_id),
                        name = COALESCE(excluded.name, features.name),
                        layer_id = COALESCE(excluded.layer_id, features.layer_id),
                        geom_type = COALESCE(excluded.geom_type, features.geom_type),
                        geometry = excluded.geometry,
                        last_event_id = excluded.last_event_id
                    WHERE excluded.last_event_id != features.last_event_id
                    "#,
                )
                .bind(f_id.as_slice())
                .bind(p_id)
                .bind(name)
                .bind(l_id)
                .bind(geom_type)
                .bind(geom)
                .bind(event_id.as_slice())
                .execute(&mut **tx)
                .await?;
            }
            EventPayload::ProjectSettingsUpdated {
                project_id,
                epsg_code,
                units,
                center_lat,
                center_lon,
                default_zoom,
            } => {
                let p_id = project_id.as_bytes();
                sqlx::query(
                    r#"
                    INSERT INTO project_settings (project_id, epsg_code, units, center_lat, center_lon, default_zoom, last_event_id)
                    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                    ON CONFLICT(project_id) DO UPDATE SET
                        epsg_code = excluded.epsg_code,
                        units = excluded.units,
                        center_lat = excluded.center_lat,
                        center_lon = excluded.center_lon,
                        default_zoom = excluded.default_zoom,
                        last_event_id = excluded.last_event_id
                    WHERE excluded.last_event_id != project_settings.last_event_id
                    "#,
                )
                .bind(p_id.as_slice())
                .bind(epsg_code)
                .bind(units)
                .bind(center_lat)
                .bind(center_lon)
                .bind(default_zoom)
                .bind(event_id.as_slice())
                .execute(&mut **tx)
                .await?;
            }
            EventPayload::AuditLogged {
                project_id,
                user_email,
                action_type,
                table_name,
                record_id,
                old_values_json,
                new_values_json,
            } => {
                let p_id = project_id.as_bytes();
                sqlx::query(
                    r#"
                    INSERT INTO audit_logs (id, project_id, user_email, action_type, table_name, record_id, old_values_json, new_values_json, created_at)
                    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
                    "#,
                )
                .bind(event_id.as_slice())
                .bind(p_id.as_slice())
                .bind(user_email)
                .bind(action_type)
                .bind(table_name)
                .bind(record_id)
                .bind(old_values_json)
                .bind(new_values_json)
                .bind(event.created_at)
                .execute(&mut **tx)
                .await?;
            }
            _ => {}
        }

        Ok(())
    }
}
