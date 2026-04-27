use super::{DatasetMeta, FeatureRecord, ImportMapping, TileIndexer};
use calamine::{Data, Reader};
use serde_json::json;
use std::collections::HashMap;
use std::path::PathBuf;

pub struct ExcelParser;

impl ExcelParser {
    fn parse_float_flexible(s: &str) -> Option<f64> {
        let cleaned = s.trim().replace(',', ".");
        cleaned.parse::<f64>().ok()
    }

    pub fn parse_file<F>(
        path: PathBuf,
        mapping: Option<ImportMapping>,
        mut on_feature: F,
    ) -> Result<DatasetMeta, String>
    where
        F: FnMut(FeatureRecord),
    {
        let mut workbook = calamine::open_workbook_auto(&path).map_err(|e| e.to_string())?;

        let sheet_name = workbook
            .sheet_names()
            .first()
            .ok_or("No sheets found in Excel file")?
            .clone();

        let range = workbook
            .worksheet_range(&sheet_name)
            .map_err(|e| format!("Could not read sheet {}: {}", sheet_name, e))?;

        let all_rows: Vec<Vec<Data>> = range.rows().map(|r| r.to_vec()).collect();

        if all_rows.is_empty() {
            return Err("Excel file is empty".to_string());
        }

        let mut headers = Vec::new();
        let mut header_found = false;
        let mut header_row_index = 0;

        for (idx, row) in all_rows.iter().take(50).enumerate() {
            let row_strs: Vec<String> = row.iter().map(|c| c.to_string().to_lowercase()).collect();
            let is_header = row_strs.iter().any(|s| {
                s.contains("vĩ độ")
                    || s.contains("lat")
                    || s.contains("y")
                    || s.contains("kinh độ")
                    || s.contains("lon")
                    || s.contains("lng")
                    || s.contains("x")
            });

            if is_header {
                headers = row.iter().map(|c| c.to_string()).collect();
                header_found = true;
                header_row_index = idx;
                break;
            }
        }

        if !header_found {
            headers = all_rows[0].iter().map(|c| c.to_string()).collect();
            header_row_index = 0;
        }

        let (lat_idx, lon_idx, name_idx, _order_idx) = if let Some(m) = &mapping {
            let normalize = |s: &str| s.trim().to_lowercase().replace("_", " ").replace("  ", " ");
            let lat = headers
                .iter()
                .position(|h| normalize(h) == normalize(&m.lat_column));
            let lon = headers
                .iter()
                .position(|h| normalize(h) == normalize(&m.lng_column));
            let name = headers
                .iter()
                .position(|h| normalize(h) == normalize(&m.name_column));
            let order = m
                .order_column
                .as_ref()
                .and_then(|col| headers.iter().position(|h| normalize(h) == normalize(col)));
            (lat, lon, name, order)
        } else {
            let lat = headers.iter().position(|h: &String| {
                let lh = h.to_lowercase();
                lh.contains("vĩ độ") || lh == "lat" || lh == "latitude" || lh == "y"
            });
            let lon = headers.iter().position(|h: &String| {
                let lh = h.to_lowercase();
                lh.contains("kinh độ")
                    || lh == "lon"
                    || lh == "longitude"
                    || lh == "lng"
                    || lh == "x"
            });
            let name = headers.iter().position(|h: &String| {
                let lh = h.to_lowercase();
                lh.contains("tên")
                    || lh.contains("nhãn")
                    || lh == "name"
                    || lh == "ten"
                    || lh == "label"
            });
            let order = headers.iter().position(|h: &String| {
                let lh = h.to_lowercase();
                lh.contains("mã")
                    || lh.contains("stt")
                    || lh.contains("h hiệu")
                    || lh == "id"
                    || lh == "index"
            });
            (lat, lon, name, order)
        };

        if lat_idx.is_none() || lon_idx.is_none() {
            return Err("Required coordinate columns (Lat/Lon) not found".to_string());
        }

        let lat_idx = lat_idx.unwrap();
        let lon_idx = lon_idx.unwrap();
        let dataset_id = uuid::Uuid::new_v4();
        let mut total_count = 0;

        for (idx, row) in all_rows[header_row_index + 1..].iter().enumerate() {
            let mut lat = match row.get(lat_idx) {
                Some(Data::Float(f)) => *f,
                Some(Data::Int(i)) => *i as f64,
                Some(Data::String(s)) => Self::parse_float_flexible(s).unwrap_or(0.0),
                _ => continue,
            };

            let mut lon = match row.get(lon_idx) {
                Some(Data::Float(f)) => *f,
                Some(Data::Int(i)) => *i as f64,
                Some(Data::String(s)) => Self::parse_float_flexible(s).unwrap_or(0.0),
                _ => continue,
            };

            if lat == 0.0 && lon == 0.0 {
                continue;
            }

            if !(-90.0..=90.0).contains(&lat)
                && (-180.0..=180.0).contains(&lat)
                && (-90.0..=90.0).contains(&lon)
            {
                std::mem::swap(&mut lat, &mut lon);
            }

            if !(-90.0..=90.0).contains(&lat) || !(-180.0..=180.0).contains(&lon) {
                continue;
            }

            let mut properties = HashMap::new();
            for (col_idx, header) in headers.iter().enumerate() {
                let value = row.get(col_idx).unwrap_or(&Data::Empty).to_string();
                if value != "Data::Empty" && !value.is_empty() {
                    properties.insert(header.clone(), value);
                }
            }

            let name_raw = name_idx
                .and_then(|i| row.get(i))
                .map(|d| d.to_string())
                .unwrap_or_else(|| format!("Point {}", idx + 1));

            properties.insert("name".to_string(), name_raw);
            let tile_id = TileIndexer::get_tile_id(lat, lon, 16);

            let record = FeatureRecord {
                id: uuid::Uuid::new_v4(), // Generate proper Uuid for V2
                geom_type: "Point".to_string(),
                geometry: json!({
                    "type": "Point",
                    "coordinates": [lon, lat]
                }),
                center_lat: lat,
                center_lon: lon,
                tile_id,
                properties,
            };

            on_feature(record);
            total_count += 1;
        }

        let mut metadata = DatasetMeta::default();
        metadata.dataset_id = dataset_id;
        metadata.feature_count = total_count;

        Ok(metadata)
    }
}
