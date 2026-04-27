pub mod commands;
pub mod reporter;

pub use reporter::ReportingEngine;
pub use serde::{Deserialize, Serialize};
pub use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct LandCategorySummary {
    pub land_type: String,
    pub count: u64,
    pub total_area: f64,
    pub total_length: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct GisReportSummary {
    pub timestamp: i64,
    pub categories: HashMap<String, LandCategorySummary>,
    pub overall_total_area: f64,
    pub overall_total_length: f64,
}

impl GisReportSummary {
    pub fn to_markdown(&self) -> String {
        let mut md = String::from("# GIS Analysis Report\n\n");
        md.push_str(&format!("*Timestamp: {}*\n\n", self.timestamp));
        md.push_str("| Land Type | Count | Total Area (m2) | Total Length (m) |\n");
        md.push_str("|-----------|-------|-----------------|------------------|\n");

        let mut sorted_keys: Vec<_> = self.categories.keys().collect();
        sorted_keys.sort();

        for key in sorted_keys {
            if let Some(cat) = self.categories.get(key) {
                md.push_str(&format!(
                    "| {} | {} | {:.2} | {:.2} |\n",
                    cat.land_type, cat.count, cat.total_area, cat.total_length
                ));
            }
        }

        md.push_str(&format!(
            "\n**Total Area:** {:.2} m2\n",
            self.overall_total_area
        ));
        md.push_str(&format!(
            "**Total Length:** {:.2} m\n",
            self.overall_total_length
        ));

        md
    }
}
