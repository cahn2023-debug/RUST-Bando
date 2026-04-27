use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct FieldMeta {
    pub name: String,
    pub field_type: String,
    pub display_name: String,
    pub required: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DatasetMeta {
    pub dataset_id: Uuid,
    pub fields: Vec<FieldMeta>,
    pub sample_data: Option<Vec<HashMap<String, String>>>,
    pub feature_count: usize, // Thêm trường này nếu cần
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeatureRecord {
    pub id: Uuid,
    pub geom_type: String,           // "Point", "LineString", "Polygon"
    pub geometry: serde_json::Value, // GeoJSON-like geometry data
    pub center_lat: f64,             // Used for tiling/indexing
    pub center_lon: f64,
    pub tile_id: String,
    pub properties: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportMapping {
    pub name_column: String,
    pub lat_column: String,
    pub lng_column: String,
    pub description_column: Option<String>,
    pub order_column: Option<String>,
}

impl DatasetMeta {
    /// Infers field types based on a sample of headers.
    pub fn infer_from_headers(headers: &[String]) -> Self {
        use sha2::{Digest, Sha256};

        let fields: Vec<FieldMeta> = headers
            .iter()
            .map(|h| {
                let lower = h.to_lowercase();
                let is_coord = lower.contains("vĩ độ")
                    || lower.contains("lat")
                    || lower.contains("kinh độ")
                    || lower.contains("lon")
                    || lower.contains("lng")
                    || lower == "x"
                    || lower == "y";
                let is_name = lower.contains("tên") || lower == "name" || lower == "label";

                FieldMeta {
                    name: h.to_lowercase().trim().replace(" ", "_"),
                    field_type: if is_coord {
                        "number".to_string()
                    } else {
                        "string".to_string()
                    },
                    display_name: h.clone(),
                    required: is_coord || is_name,
                }
            })
            .collect();

        // Generate a deterministic dataset_id based on hashed headers
        let mut hasher = Sha256::new();
        for f in &fields {
            hasher.update(f.name.as_bytes());
        }
        let hash_result = hasher.finalize();
        // Convert the first 16 bytes of the hash to a Uuid
        let mut bytes = [0u8; 16];
        bytes.copy_from_slice(&hash_result[..16]);
        let dataset_id = Uuid::from_bytes(bytes);

        Self {
            dataset_id,
            fields,
            sample_data: None,
            feature_count: 0,
        }
    }
}
