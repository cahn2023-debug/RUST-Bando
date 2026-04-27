use super::{GisReportSummary, LandCategorySummary};
// use geo::{Euclidean, Length}; // Legacy geo imports (removed for compatibility with 0.29)
use rusqlite::{params, Connection};
use serde_json::Value;

pub struct ReportingEngine<'a> {
    conn: &'a Connection,
}

impl<'a> ReportingEngine<'a> {
    pub fn new(conn: &'a Connection) -> Self {
        Self { conn }
    }

    pub fn generate_project_report(&self, project_id: &str) -> Result<GisReportSummary, String> {
        let mut report = GisReportSummary {
            timestamp: chrono::Utc::now().timestamp(),
            ..Default::default()
        };

        let mut stmt = self
            .conn
            .prepare("SELECT geometry_json, properties_json FROM features WHERE project_id = ?1")
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(params![project_id], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|e| e.to_string())?;

        for row_res in rows {
            if let Ok((geom_json_str, props_json_str)) = row_res {
                let geom_val: Value = serde_json::from_str(&geom_json_str).unwrap_or(Value::Null);
                let props_val: Value = serde_json::from_str(&props_json_str).unwrap_or(Value::Null);

                // Get area/length from spatial calculation
                let (area, length) = self.calculate_spatial_metrics(&geom_val);

                // Get land_type from properties
                let land_type = props_val
                    .get("land_type")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Unknown")
                    .to_string();

                let entry = report
                    .categories
                    .entry(land_type.clone())
                    .or_insert_with(|| LandCategorySummary {
                        land_type,
                        ..Default::default()
                    });

                entry.count += 1;
                if let Some(a) = area {
                    entry.total_area += a;
                    report.overall_total_area += a;
                }
                if let Some(l) = length {
                    entry.total_length += l;
                    report.overall_total_length += l;
                }
            }
        }

        Ok(report)
    }

    fn calculate_spatial_metrics(&self, geom: &Value) -> (Option<f64>, Option<f64>) {
        crate::domain::implement::modules::v2::spatial::calculate_area_length_planar(geom)
    }
}
