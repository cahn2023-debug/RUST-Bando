use super::{DatasetMeta, FeatureRecord, ImportMapping, TileIndexer};
use quick_xml::events::Event;
use quick_xml::reader::Reader;
use serde_json::json;
use std::collections::HashMap;
use std::io::BufRead;
use std::path::PathBuf;

pub struct KmlParser;

impl KmlParser {
    pub fn parse_file<F>(
        path: PathBuf,
        mapping: Option<ImportMapping>,
        on_feature: F,
    ) -> Result<DatasetMeta, String>
    where
        F: FnMut(FeatureRecord),
    {
        let reader = Reader::from_file(path).map_err(|e| e.to_string())?;
        Self::parse_reader(reader, mapping, on_feature)
    }

    pub fn parse_reader<R, F>(
        mut reader: Reader<R>,
        mapping: Option<ImportMapping>,
        mut on_feature: F,
    ) -> Result<DatasetMeta, String>
    where
        R: BufRead,
        F: FnMut(FeatureRecord),
    {
        reader.trim_text(true);

        let mut buf = Vec::new();
        let mut total_records = 0;
        let dataset_id = uuid::Uuid::new_v4();

        let mut in_placemark = false;
        let mut current_tag = String::new();
        let mut current_properties = HashMap::new();
        let mut current_geom_type = "Point".to_string();
        let mut current_coords: Vec<Vec<f64>> = Vec::new();
        let mut attr_name = String::new();

        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Start(e)) | Ok(Event::Empty(e)) => {
                    let is_empty = matches!(Event::Empty(e.clone()), Event::Empty(_));
                    let name_bytes = e.name();
                    current_tag = String::from_utf8_lossy(name_bytes.as_ref()).to_string();

                    match current_tag.as_str() {
                        "Placemark" => {
                            in_placemark = true;
                            current_properties = HashMap::new();
                            current_coords = Vec::new();
                            current_geom_type = "Point".to_string();
                        }
                        "Data" | "SimpleData" => {
                            attr_name = e
                                .attributes()
                                .find(|a| {
                                    a.as_ref()
                                        .map(|att| att.key.as_ref() == b"name")
                                        .unwrap_or(false)
                                })
                                .and_then(|a| a.ok())
                                .map(|a| String::from_utf8_lossy(&a.value).to_string())
                                .unwrap_or_default();
                        }
                        "LineString" => {
                            current_geom_type = "LineString".to_string();
                        }
                        "Polygon" => {
                            current_geom_type = "Polygon".to_string();
                        }
                        _ => {}
                    }

                    if is_empty && current_tag == "Placemark" {
                        in_placemark = false;
                    }
                }
                Ok(Event::Text(e)) => {
                    if !in_placemark {
                        continue;
                    }
                    let text = e
                        .unescape()
                        .map(|t| t.to_string())
                        .unwrap_or_else(|_| String::from_utf8_lossy(e.as_ref()).to_string());

                    match current_tag.as_str() {
                        "name" => {
                            current_properties.insert("name".to_string(), text);
                        }
                        "description" => {
                            current_properties.insert("description".to_string(), text);
                        }
                        "value" | "SimpleData" => {
                            if !attr_name.is_empty() {
                                current_properties.insert(attr_name.clone(), text);
                            }
                        }
                        "coordinates" => {
                            for pair in text.split_whitespace() {
                                let parts: Vec<&str> = pair.split(',').collect();
                                if parts.len() >= 2 {
                                    let lon = parts[0].trim().parse::<f64>().unwrap_or(0.0);
                                    let lat = parts[1].trim().parse::<f64>().unwrap_or(0.0);
                                    current_coords.push(vec![lon, lat]);
                                }
                            }
                        }
                        _ => {}
                    }
                }
                Ok(Event::End(e)) => {
                    let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                    if name == "Placemark" {
                        if !current_coords.is_empty() {
                            let (c_lat, c_lon) = Self::calculate_center(&current_coords);
                            let tile_id = TileIndexer::get_tile_id(c_lat, c_lon, 16);

                            if let Some(ref m) = mapping {
                                if let Some(mapped_name) = current_properties.get(&m.name_column) {
                                    current_properties
                                        .insert("name".to_string(), mapped_name.clone());
                                }
                            }

                            let records_added = total_records + 1;
                            current_properties.insert("stt".to_string(), records_added.to_string());
                            current_properties
                                .insert("kinh_do".to_string(), format!("{:.8}", c_lon));
                            current_properties.insert("vi_do".to_string(), format!("{:.8}", c_lat));

                            let record = FeatureRecord {
                                id: uuid::Uuid::new_v4(), // V2 ID
                                geom_type: current_geom_type.clone(),
                                geometry: json!({
                                    "type": &current_geom_type,
                                    "coordinates": if current_geom_type == "Point" {
                                        json!(current_coords[0])
                                    } else if current_geom_type == "Polygon" {
                                        json!([current_coords])
                                    } else {
                                        json!(current_coords)
                                    }
                                }),
                                center_lat: c_lat,
                                center_lon: c_lon,
                                tile_id,
                                properties: current_properties.clone(),
                            };

                            on_feature(record);
                            total_records += 1;
                        }
                        in_placemark = false;
                    }
                }
                Ok(Event::Eof) => break,
                _ => {}
            }
            buf.clear();
        }

        let mut metadata = DatasetMeta::default();
        metadata.dataset_id = dataset_id;
        metadata.feature_count = total_records;

        Ok(metadata)
    }

    fn calculate_center(coords: &Vec<Vec<f64>>) -> (f64, f64) {
        if coords.is_empty() {
            return (0.0, 0.0);
        }
        let mut sum_lat = 0.0;
        let mut sum_lon = 0.0;
        for c in coords {
            sum_lon += c[0];
            sum_lat += c[1];
        }
        (sum_lat / coords.len() as f64, sum_lon / coords.len() as f64)
    }
}
